import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { cookieHeader, readCookie } from '../../testing/cookies';
import { createTestApp, resetUsers, type TestApp } from '../../testing/create-test-app';

const PASSWORD = 'Senha123!';

let testApp: TestApp;
let packId: string;
let emailCounter = 0;

const http = () => request(testApp.app.getHttpServer());

const registerUser = async (): Promise<{ accessToken: string; userId: string }> => {
  emailCounter += 1;
  const email = `ai-notes-case-${emailCounter}@example.com`;
  const response = await http().post('/auth/register').send({ email, password: PASSWORD });
  expect(response.status).toBe(201);
  return {
    accessToken: readCookie(response, 'accessToken') as string,
    userId: response.body.user.id as string,
  };
};

// The sheet's own payload is irrelevant here: the route reads the generation log, never `data`.
const createSheet = async (userId: string): Promise<string> => {
  const row = await testApp.prisma.characterSheet.create({
    data: { userId, packId, name: 'Brunna', data: {} as Prisma.InputJsonValue },
  });
  return row.id;
};

const createRun = async (
  userId: string,
  characterSheetId: string,
  meta: unknown
): Promise<void> => {
  await testApp.prisma.generationRun.create({
    data: {
      userId,
      packId,
      characterSheetId,
      prompt: 'uma caçadora das montanhas',
      note: 'interpretação',
      questions: [] as unknown as Prisma.InputJsonValue,
      meta: meta as Prisma.InputJsonValue,
      model: 'test-model',
    },
  });
};

// Shaped like a real row: the areas and the note fields are what production writes.
const REAL_META = {
  name: 'Brunna Cinza-forja',
  summary: 'Uma caçadora anã.',
  decisions: [
    { area: 'identity', points: ['Anã das colinas pelo conceito de montanha.'] },
    { area: 'attributes', points: ['Sabedoria alta para rastrear.', 'Força secundária.'] },
  ],
  spellNotes: [{ spell: 'Pass without Trace', reason: 'perseguição furtiva.' }],
  adjustments: [],
};

beforeAll(async () => {
  testApp = await createTestApp();
  const pack = await testApp.prisma.pack.upsert({
    where: { slug: 'dnd-srd-5-2' },
    update: {},
    create: {
      slug: 'dnd-srd-5-2',
      name: 'D&D SRD 5.2',
      version: '5.2',
      systemName: 'dnd5e',
      licenseType: 'CC-BY-4.0',
      attributionText: 'SRD 5.2 CC BY 4.0',
    },
  });
  packId = pack.id;
});

afterAll(async () => {
  await testApp?.close();
});

beforeEach(async () => {
  await resetUsers(testApp.prisma);
});

describe('GET /character-sheets/:id/ai-notes', () => {
  it('answers the AI justifications stored for the sheet', async () => {
    const owner = await registerUser();
    const sheetId = await createSheet(owner.userId);
    await createRun(owner.userId, sheetId, REAL_META);

    const response = await http()
      .get(`/character-sheets/${sheetId}/ai-notes`)
      .set('Cookie', cookieHeader({ accessToken: owner.accessToken }));

    expect(response.status).toBe(200);
    expect(response.body.decisions).toEqual(REAL_META.decisions);
    expect(response.body.spellNotes).toEqual(REAL_META.spellNotes);
  });

  it('answers empty for a sheet that was never generated', async () => {
    const owner = await registerUser();
    const sheetId = await createSheet(owner.userId);

    const response = await http()
      .get(`/character-sheets/${sheetId}/ai-notes`)
      .set('Cookie', cookieHeader({ accessToken: owner.accessToken }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ decisions: [], spellNotes: [] });
  });

  // A log written before a shape change must not take the sheet's page down with it.
  it('drops malformed entries instead of failing', async () => {
    const owner = await registerUser();
    const sheetId = await createSheet(owner.userId);
    await createRun(owner.userId, sheetId, {
      decisions: [{ area: 'skills', points: ['   ', 'Sobrevivência.'] }, { area: 'skills' }, 42],
      spellNotes: [{ spell: 'Aid' }, { spell: 'Bless', reason: 'apoio.' }],
    });

    const response = await http()
      .get(`/character-sheets/${sheetId}/ai-notes`)
      .set('Cookie', cookieHeader({ accessToken: owner.accessToken }));

    expect(response.status).toBe(200);
    expect(response.body.decisions).toEqual([{ area: 'skills', points: ['Sobrevivência.'] }]);
    expect(response.body.spellNotes).toEqual([{ spell: 'Bless', reason: 'apoio.' }]);
  });

  it('refuses a sheet that belongs to someone else', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const sheetId = await createSheet(owner.userId);
    await createRun(owner.userId, sheetId, REAL_META);

    const response = await http()
      .get(`/character-sheets/${sheetId}/ai-notes`)
      .set('Cookie', cookieHeader({ accessToken: stranger.accessToken }));

    expect(response.status).toBe(403);
  });

  it('refuses a request with no session', async () => {
    const owner = await registerUser();
    const sheetId = await createSheet(owner.userId);

    const response = await http().get(`/character-sheets/${sheetId}/ai-notes`);

    expect(response.status).toBe(401);
  });
});

describe('GET /character-sheets/:id/with-rules', () => {
  it('reports whether the sheet has AI notes to offer', async () => {
    const owner = await registerUser();
    const generated = await createSheet(owner.userId);
    const handmade = await createSheet(owner.userId);
    await createRun(owner.userId, generated, REAL_META);

    const cookie = cookieHeader({ accessToken: owner.accessToken });
    const [withRun, withoutRun] = await Promise.all([
      http().get(`/character-sheets/${generated}/with-rules`).set('Cookie', cookie),
      http().get(`/character-sheets/${handmade}/with-rules`).set('Cookie', cookie),
    ]);

    expect(withRun.status).toBe(200);
    expect(withRun.body.hasAiNotes).toBe(true);
    expect(withoutRun.body.hasAiNotes).toBe(false);
  });
});
