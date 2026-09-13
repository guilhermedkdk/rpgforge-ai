import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { cookieHeader, readCookie } from '../../../testing/cookies';
import { createTestApp, resetUsers, type TestApp } from '../../../testing/create-test-app';
import { oauthCookieSecret } from './oauth.config';
import { OAUTH_PENDING_LINK_COOKIE, type OAuthPendingLink } from './oauth-transaction';

const PASSWORD = 'Senha123!';
const NEW_PASSWORD = 'OutraSenha456!';
const ROUTE = '/auth/oauth/link/reset-password';

let testApp: TestApp;
let jwtService: JwtService;
let pendingLinkSecret: string;

const http = () => request(testApp.app.getHttpServer());

let emailCounter = 0;

const registerUser = async (): Promise<{ email: string; refreshToken: string }> => {
  emailCounter += 1;
  const email = `provider-recovery-${emailCounter}@example.com`;

  const response = await http().post('/auth/register').send({ email, password: PASSWORD });
  expect(response.status).toBe(201);

  return { email, refreshToken: readCookie(response, 'refreshToken') as string };
};

/**
 * The cookie the OAuth callback writes once the provider has verified the address.
 *
 * Forged here rather than driven through a real callback: the provider round trip is what the
 * cookie STANDS FOR, and holding a validly signed one is exactly the state this route trusts.
 */
const pendingLinkCookie = (email: string, secret = pendingLinkSecret): string => {
  const pending: OAuthPendingLink = {
    provider: 'google',
    providerAccountId: `google-sub-${email}`,
    email,
    name: null,
    picture: null,
    redirect: '/sheets',
  };

  return jwtService.sign(pending, { secret, expiresIn: 600 });
};

beforeAll(async () => {
  testApp = await createTestApp();
  jwtService = testApp.app.get(JwtService);
  pendingLinkSecret = oauthCookieSecret(testApp.app.get(ConfigService), 'pending-link');
});

afterAll(async () => {
  await testApp?.close();
});

beforeEach(async () => {
  await resetUsers(testApp.prisma);
});

describe('recovering a password account through a verified provider', () => {
  it('sets a new password, links the provider and signs the user in', async () => {
    const { email } = await registerUser();

    const recovery = await http()
      .post(ROUTE)
      .set('Cookie', cookieHeader({ [OAUTH_PENDING_LINK_COOKIE]: pendingLinkCookie(email) }))
      .send({ newPassword: NEW_PASSWORD });

    expect(recovery.status).toBe(200);
    expect(recovery.body.user.email).toBe(email);
    expect(recovery.body.user.hasPassword).toBe(true);
    expect(recovery.body.user.connections.map((c: { provider: string }) => c.provider)).toEqual([
      'google',
    ]);
    expect(readCookie(recovery, 'accessToken')).toBeDefined();

    const withOld = await http().post('/auth/login').send({ email, password: PASSWORD });
    expect(withOld.status).toBe(401);

    const withNew = await http().post('/auth/login').send({ email, password: NEW_PASSWORD });
    expect(withNew.status).toBe(200);
  });

  it('drops every session the account already had', async () => {
    const session = await registerUser();

    await http()
      .post(ROUTE)
      .set(
        'Cookie',
        cookieHeader({ [OAUTH_PENDING_LINK_COOKIE]: pendingLinkCookie(session.email) })
      )
      .send({ newPassword: NEW_PASSWORD });

    const refresh = await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    expect(refresh.status).toBe(401);
  });

  it('refuses a request with no pending link at all', async () => {
    await registerUser();

    const recovery = await http().post(ROUTE).send({ newPassword: NEW_PASSWORD });

    expect(recovery.status).toBe(401);
  });

  it('refuses a pending link signed with any other key', async () => {
    const { email } = await registerUser();
    const forged = pendingLinkCookie(email, 'not-the-pending-link-secret');

    const recovery = await http()
      .post(ROUTE)
      .set('Cookie', cookieHeader({ [OAUTH_PENDING_LINK_COOKIE]: forged }))
      .send({ newPassword: NEW_PASSWORD });

    expect(recovery.status).toBe(401);

    const login = await http().post('/auth/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it('refuses a pending link for an address with no account', async () => {
    const recovery = await http()
      .post(ROUTE)
      .set(
        'Cookie',
        cookieHeader({ [OAUTH_PENDING_LINK_COOKIE]: pendingLinkCookie('ghost@example.com') })
      )
      .send({ newPassword: NEW_PASSWORD });

    expect(recovery.status).toBe(401);
  });

  it('rejects a password shorter than the register route accepts', async () => {
    const { email } = await registerUser();

    const recovery = await http()
      .post(ROUTE)
      .set('Cookie', cookieHeader({ [OAUTH_PENDING_LINK_COOKIE]: pendingLinkCookie(email) }))
      .send({ newPassword: 'curta' });

    expect(recovery.status).toBe(400);
  });
});
