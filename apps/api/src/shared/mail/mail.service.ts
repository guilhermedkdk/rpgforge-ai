import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/** Bounded so a slow provider cannot hold the HTTP request that triggered the send. */
const SEND_TIMEOUT_MS = 10_000;

/** One outgoing message. Both bodies are required: a text-only mail scores as spam. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * The only door out for e-mail.
 *
 * Brevo over HTTPS rather than SMTP, because Render blocks outbound traffic to ports 25, 465 and
 * 587 on free instances: an SMTP transport cannot work there at all, whatever the credentials.
 * Nothing here throws, and that is the contract: the flows that send mail must answer the same way
 * whether or not the address exists, so a delivery failure can never become a 500.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(message: MailMessage): Promise<void> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY')?.trim();
    const sender = this.sender();

    if (!apiKey || !sender) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`Mail is not configured: dropped "${message.subject}" to ${message.to}`);
        return;
      }

      // The local setup has no credentials, so the body goes to the log and whatever link it
      // carries stays clickable.
      this.logger.warn(`Mail is not configured. Mail to ${message.to}:\n${message.text}`);
      return;
    }

    try {
      const response = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: sender, name: 'RPGForge AI' },
          to: [{ email: message.to }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        // The body names the reason, and the one that bites is an unvalidated sender.
        this.logger.error(
          `Mail provider refused "${message.subject}" (${response.status}): ${await response.text()}`
        );
      }
    } catch (caught) {
      this.logger.error(`Failed to send "${message.subject}" to ${message.to}`, caught as Error);
    }
  }

  /** The From address, which Brevo only accepts once it has been validated in their dashboard. */
  private sender(): string | undefined {
    return this.configService.get<string>('MAIL_FROM')?.trim() || undefined;
  }
}
