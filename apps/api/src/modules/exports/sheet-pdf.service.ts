import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer';
import { AuthService } from '../auth/auth.service';
import { CharacterSheetsService } from '../character-sheets/character-sheets.service';
import type { ExportTheme } from './dto/export-sheet-pdf.dto';

/**
 * The callbacks handed to the page run in the BROWSER, not in Node. Declaring the handful of globals
 * they touch keeps the DOM lib out of the API's tsconfig, where it would let a real backend file
 * reach for `document` and still compile.
 */
declare const document: {
  title: string;
  querySelector(selector: string): { getBoundingClientRect(): { height: number } } | null;
  fonts: { ready: Promise<unknown> };
};
declare const window: {
  localStorage: { setItem(key: string, value: string): void };
  __sheetHeight?: number;
  __sheetStable?: number;
};

/** next-themes storage key from the web `Providers`: seeding it renders the theme we were asked for. */
const THEME_STORAGE_KEY = 'rpgforge-theme';
const DEFAULT_THEME: ExportTheme = 'light';

// Generous because the smallest hosts give a fraction of a CPU, where a render that takes 6s on a
// laptop takes many times that. Too low a value turns a slow host into a broken feature.
const NAVIGATION_TIMEOUT_MS = 90_000;
const SHEET_TIMEOUT_MS = 60_000;
const LAYOUT_POLL_MS = 200;
/** Consecutive polls with an unchanged height before the sheet counts as settled. */
const STABLE_POLLS = 3;
/**
 * How long an unused browser stays alive. Idle Chromium holds ~150 MB for nothing, which on a small
 * instance is the difference between running and being OOM-killed; relaunching costs ~400 ms.
 */
const BROWSER_IDLE_MS = 120_000;
/**
 * Renders accepted at once, counting the one in progress. They run one at a time, so this is really
 * a bound on how long the last one waits: the throttler already caps a single user, but nothing
 * capped the total, and a queue with no ceiling just holds requests open until the client times out.
 */
const MAX_RENDERS_IN_FLIGHT = 3;

// Trimmed background work only: none of these change how a page rasterizes, so the PDF is unchanged.
const CHROMIUM_ARGS = [
  // Chromium's sandbox needs privileges most containers do not grant.
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-software-rasterizer',
  '--disable-accelerated-2d-canvas',
  '--renderer-process-limit=1',
];

@Injectable()
export class SheetPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(SheetPdfService.name);
  private browser: Promise<Browser> | null = null;
  /**
   * Renders run one at a time. A browser page costs real memory, and the alternative (a page per
   * request) lets a handful of clicks exhaust a small instance; a render takes a few seconds.
   */
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | null = null;
  /** Renders accepted and not yet finished: the one rendering plus the ones waiting their turn. */
  private inFlight = 0;

  constructor(
    private readonly authService: AuthService,
    private readonly characterSheets: CharacterSheetsService,
    private readonly configService: ConfigService
  ) {}

  async onModuleDestroy() {
    this.cancelIdleShutdown();
    await this.closeBrowser();
  }

  /** The sheet as a PDF, rendered by a real browser over the real page. */
  async renderSheetPdf(
    userId: string,
    sheetId: string,
    theme: ExportTheme = DEFAULT_THEME
  ): Promise<{ fileName: string; pdf: Buffer }> {
    // Shed load before touching the database: past this point a request would only sit in the queue
    // until the client gave up, which reads as a broken export rather than a busy one.
    if (this.inFlight >= MAX_RENDERS_IN_FLIGHT) {
      throw new ServiceUnavailableException(
        'Muitas fichas sendo exportadas agora. Tente de novo em alguns segundos.'
      );
    }

    // Ownership and 404 are decided by the sheet service, before any browser is involved.
    const sheet = await this.characterSheets.findOneForUser(userId, sheetId);
    const fileName = `${slugify(sheet.name) || 'ficha'}.pdf`;

    this.inFlight += 1;
    try {
      const render = () => this.render(userId, sheetId, sheet.name, theme);
      const run = this.queue.then(render, render);
      this.queue = run.catch(() => undefined);

      return { fileName, pdf: await run };
    } finally {
      this.inFlight -= 1;
    }
  }

  private async render(
    userId: string,
    sheetId: string,
    sheetName: string,
    theme: ExportTheme
  ): Promise<Buffer> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4000';
    // The flag tells the page this is the server-side export, so its print hook leaves the theme
    // alone (see use-print-light-theme).
    const url = new URL(`/sheets/${sheetId}?export=pdf`, frontendUrl);

    // A short-lived token minted here and handed straight to the headless browser: it never reaches
    // a client, and it only opens the page its own owner is already allowed to see.
    const accessToken = await this.authService.createRenderAccessToken(userId);

    // Held off until the render finishes, so the timer can never close a browser mid-page.
    this.cancelIdleShutdown();

    const browser = await this.getBrowser();
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      context = await browser.createBrowserContext();
      // Both names carry the same render token. The API authorizes on `accessToken`, but the web's
      // route gate only checks that a `refreshToken` cookie EXISTS, and without one the render is
      // redirected to /auth/login and never reaches the sheet.
      const renderCookie = {
        value: accessToken,
        domain: url.hostname,
        path: '/',
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'Lax' as const,
      };
      await context.setCookie(
        { name: 'accessToken', ...renderCookie },
        { name: 'refreshToken', ...renderCookie }
      );

      page = await context.newPage();
      await page.setViewport({ width: 1440, height: 1000 });
      await page.evaluateOnNewDocument(
        (key: string, value: string) => {
          try {
            window.localStorage.setItem(key, value);
          } catch {
            // Storage can be unavailable; the print stylesheet does not depend on this.
          }
        },
        THEME_STORAGE_KEY,
        theme
      );

      // `domcontentloaded`, not `networkidle2`: readiness is decided below by the sheet's own
      // signals, so waiting for the network to fall quiet first is the same wait paid twice.
      await page.goto(url.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      // The sheet says when its catalogs are in; the height check then covers the derivation that
      // follows. Waiting on the height alone caught sheets with a fallback AC and no attacks.
      await page.waitForSelector('.print-sheet[data-sheet-ready="true"]', {
        timeout: SHEET_TIMEOUT_MS,
      });
      await this.waitForSettledSheet(page);

      // The PDF's own title comes from the document's, and the site's is the app name.
      await page.evaluate((title: string) => {
        document.title = title;
      }, sheetName);

      // `page.pdf` renders with print media, so the sheet's own @media print block is what shapes
      // the file; `preferCSSPageSize` hands it the @page size and margins too. No header/footer,
      // which is the browser dialog's "Cabeçalhos e rodapés" the user had to uncheck by hand.
      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
      });

      return Buffer.from(pdf);
    } finally {
      await page?.close().catch(() => undefined);
      await context?.close().catch(() => undefined);
      this.scheduleIdleShutdown();
    }
  }

  private cancelIdleShutdown() {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private scheduleIdleShutdown() {
    this.cancelIdleShutdown();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      void this.closeBrowser();
    }, BROWSER_IDLE_MS);
    // A pending close must not be a reason to keep the process alive.
    this.idleTimer.unref();
  }

  private async closeBrowser() {
    const browser = this.browser;
    this.browser = null;
    if (!browser) return;
    await browser.then((instance) => instance.close()).catch(() => undefined);
  }

  /**
   * The sheet derives on mount and writes to itself a few times (granted spells, restores), so its
   * height keeps changing for a moment after the selector exists. Wait for it to stop moving, then
   * for the fonts, or the PDF catches a half-derived sheet.
   */
  private async waitForSettledSheet(page: Page) {
    await page.waitForFunction(
      (stablePolls: number) => {
        const element = document.querySelector('.print-sheet');
        if (!element) return false;
        const height = Math.round(element.getBoundingClientRect().height);
        if (window.__sheetHeight === height) {
          window.__sheetStable = (window.__sheetStable ?? 0) + 1;
        } else {
          window.__sheetHeight = height;
          window.__sheetStable = 0;
        }
        return (window.__sheetStable ?? 0) >= stablePolls;
      },
      { polling: LAYOUT_POLL_MS, timeout: SHEET_TIMEOUT_MS },
      STABLE_POLLS
    );
    await page.evaluate(() => document.fonts.ready);
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = puppeteer
        .launch({
          headless: true,
          executablePath: this.configService.get<string>('PUPPETEER_EXECUTABLE_PATH') || undefined,
          args: CHROMIUM_ARGS,
        })
        .catch((error: unknown) => {
          this.browser = null;
          this.logger.error('Could not launch the browser for the PDF export', error as Error);
          throw new ServiceUnavailableException('PDF export is unavailable');
        });
    }

    const browser = await this.browser;
    // A crashed browser must not poison every later export.
    if (browser.connected) return browser;
    this.browser = null;
    return this.getBrowser();
  }
}

const slugify = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
