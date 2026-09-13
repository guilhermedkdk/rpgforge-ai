import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { cookieHeader, readCookie } from '../../../testing/cookies';
import { createTestApp, resetUsers, type TestApp } from '../../../testing/create-test-app';
import { MailService, type MailMessage } from '../../../shared/mail/mail.service';
import { hashRefreshToken } from '../refresh-token';
import { hashResetToken } from './password-reset-token';

const PASSWORD = 'Senha123!';
const NEW_PASSWORD = 'OutraSenha456!';

let testApp: TestApp;
let sent: MailMessage[] = [];

const http = () => request(testApp.app.getHttpServer());

let emailCounter = 0;

const registerUser = async (): Promise<{ email: string; refreshToken: string }> => {
  emailCounter += 1;
  const email = `reset-case-${emailCounter}@example.com`;

  const response = await http().post('/auth/register').send({ email, password: PASSWORD });
  expect(response.status).toBe(201);

  return { email, refreshToken: readCookie(response, 'refreshToken') as string };
};

/** The token as the user receives it: only its hash is ever stored, so the mail is the only source. */
const requestResetToken = async (email: string): Promise<string> => {
  const before = sent.length;
  const response = await http().post('/auth/password/forgot').send({ email });
  expect(response.status).toBe(202);

  const message = sent[before];
  expect(message, 'no mail was sent').toBeDefined();

  const token = /token=([\w-]+)/.exec(message.text)?.[1];
  expect(token, 'the mail carried no token').toBeDefined();

  return token as string;
};

beforeAll(async () => {
  testApp = await createTestApp();

  // The suite has no SMTP, and would not want one: capturing the message is also the only way to
  // read a token the database only holds hashed.
  vi.spyOn(testApp.app.get(MailService), 'send').mockImplementation(async (message) => {
    sent.push(message);
  });
});

afterAll(async () => {
  await testApp?.close();
});

beforeEach(async () => {
  sent = [];
  await resetUsers(testApp.prisma);
});

describe('POST /auth/password/forgot', () => {
  it('answers the same for an address with no account, and sends nothing', async () => {
    const known = await registerUser();

    const unknown = await http()
      .post('/auth/password/forgot')
      .send({ email: 'nobody-here@example.com' });
    const existing = await http().post('/auth/password/forgot').send({ email: known.email });

    expect(unknown.status).toBe(202);
    expect(existing.status).toBe(202);
    expect(unknown.body.message).toBe(existing.body.message);
    expect(sent.map((message) => message.to)).toEqual([known.email]);
  });

  it('stores the token hashed, never the token itself', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);

    const rows = await testApp.prisma.passwordResetToken.findMany({
      select: { tokenHash: true },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashResetToken(token));
    expect(rows[0].tokenHash).not.toContain(token);
  });

  it('leaves only the newest link alive when asked twice', async () => {
    const { email } = await registerUser();
    const first = await requestResetToken(email);
    const second = await requestResetToken(email);

    const spent = await http()
      .post('/auth/password/reset')
      .send({ token: first, newPassword: NEW_PASSWORD });
    expect(spent.status).toBe(401);

    const current = await http()
      .post('/auth/password/reset')
      .send({ token: second, newPassword: NEW_PASSWORD });
    expect(current.status).toBe(200);
  });
});

describe('POST /auth/password/reset', () => {
  it('replaces the password and signs the user in', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);

    const reset = await http()
      .post('/auth/password/reset')
      .send({ token, newPassword: NEW_PASSWORD });

    expect(reset.status).toBe(200);
    expect(reset.body.user.email).toBe(email);
    expect(readCookie(reset, 'accessToken')).toBeDefined();
    expect(readCookie(reset, 'refreshToken')).toBeDefined();

    const withOld = await http().post('/auth/login').send({ email, password: PASSWORD });
    expect(withOld.status).toBe(401);

    const withNew = await http().post('/auth/login').send({ email, password: NEW_PASSWORD });
    expect(withNew.status).toBe(200);
  });

  it('drops every session the account already had', async () => {
    const session = await registerUser();
    const token = await requestResetToken(session.email);

    await http().post('/auth/password/reset').send({ token, newPassword: NEW_PASSWORD });

    const refresh = await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    expect(refresh.status).toBe(401);
    const survivors = await testApp.prisma.refreshToken.findMany({
      where: { tokenHash: hashRefreshToken(session.refreshToken) },
    });
    expect(survivors).toHaveLength(0);
  });

  it('refuses a token that was already spent', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);

    const first = await http()
      .post('/auth/password/reset')
      .send({ token, newPassword: NEW_PASSWORD });
    expect(first.status).toBe(200);

    const again = await http()
      .post('/auth/password/reset')
      .send({ token, newPassword: 'TerceiraSenha789!' });
    expect(again.status).toBe(401);

    const login = await http().post('/auth/login').send({ email, password: 'TerceiraSenha789!' });
    expect(login.status).toBe(401);
  });

  it('refuses a token past its window', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);

    await testApp.prisma.passwordResetToken.update({
      where: { tokenHash: hashResetToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const reset = await http()
      .post('/auth/password/reset')
      .send({ token, newPassword: NEW_PASSWORD });

    expect(reset.status).toBe(401);
  });

  it('refuses a token nobody issued', async () => {
    await registerUser();

    const reset = await http()
      .post('/auth/password/reset')
      .send({ token: 'not-a-token-anyone-signed', newPassword: NEW_PASSWORD });

    expect(reset.status).toBe(401);
  });

  it('rejects a password shorter than the register route accepts', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);

    const reset = await http().post('/auth/password/reset').send({ token, newPassword: 'curta' });

    expect(reset.status).toBe(400);
  });
});
