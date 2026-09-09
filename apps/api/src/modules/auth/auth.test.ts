import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cookieAttributes, cookieHeader, readCookie } from '../../testing/cookies';
import { createTestApp, resetUsers, type TestApp } from '../../testing/create-test-app';
import { hashRefreshToken, ROTATION_GRACE_SECONDS } from './refresh-token';

const PASSWORD = 'Senha123!';

let testApp: TestApp;

const http = () => request(testApp.app.getHttpServer());

interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
}

let emailCounter = 0;

const registerUser = async (): Promise<Session> => {
  emailCounter += 1;
  const email = `auth-case-${emailCounter}@example.com`;

  const response = await http().post('/auth/register').send({ email, password: PASSWORD });
  expect(response.status).toBe(201);

  return {
    email,
    accessToken: readCookie(response, 'accessToken') as string,
    refreshToken: readCookie(response, 'refreshToken') as string,
  };
};

/** Ages a token's rotation stamp so the grace window has demonstrably passed. */
const backdateRotation = async (refreshToken: string, secondsAgo: number): Promise<void> => {
  await testApp.prisma.refreshToken.update({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    data: { usedAt: new Date(Date.now() - secondsAgo * 1000) },
  });
};

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp?.close();
});

beforeEach(async () => {
  await resetUsers(testApp.prisma);
});

describe('session cookies', () => {
  it('issues an httpOnly pair on register and accepts it on /auth/me', async () => {
    const session = await registerUser();

    const me = await http()
      .get('/auth/me')
      .set('Cookie', cookieHeader({ accessToken: session.accessToken }));

    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(session.email);
  });

  it('keeps both cookies out of reach of scripts and of other sites', async () => {
    emailCounter += 1;
    const response = await http()
      .post('/auth/register')
      .send({ email: `flags-${emailCounter}@example.com`, password: PASSWORD });

    for (const name of ['accessToken', 'refreshToken']) {
      const attributes = cookieAttributes(response, name);
      expect(attributes).toContain('httponly');
      expect(attributes).toContain('samesite=lax');
      expect(attributes).toContain('path=/');
    }
  });

  it('refuses /auth/me with no cookie at all', async () => {
    const response = await http().get('/auth/me');

    expect(response.status).toBe(401);
  });

  it('refuses /auth/me when only the refresh cookie survived', async () => {
    const session = await registerUser();

    const response = await http()
      .get('/auth/me')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    // The access token is what authenticates a request. This 401 is the signal the web client
    // turns into a refresh, so it has to stay a 401 and not become a redirect or a 403.
    expect(response.status).toBe(401);
  });

  it('refuses a login with the wrong password', async () => {
    const session = await registerUser();

    const response = await http()
      .post('/auth/login')
      .send({ email: session.email, password: 'senha-errada' });

    expect(response.status).toBe(401);
    expect(readCookie(response, 'accessToken')).toBeUndefined();
  });
});

describe('refresh token storage', () => {
  it('never stores the token itself', async () => {
    const session = await registerUser();

    const stored = await testApp.prisma.refreshToken.findMany();
    expect(stored).toHaveLength(1);

    const columns = Object.values(stored[0]);
    expect(columns).not.toContain(session.refreshToken);
    expect(stored[0].tokenHash).toBe(hashRefreshToken(session.refreshToken));
  });
});

describe('refresh', () => {
  it('rotates the pair and leaves the session usable', async () => {
    const session = await registerUser();

    const refreshed = await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    expect(refreshed.status).toBe(200);

    const rotated = readCookie(refreshed, 'refreshToken') as string;
    expect(rotated).not.toBe(session.refreshToken);

    const me = await http()
      .get('/auth/me')
      .set('Cookie', cookieHeader({ accessToken: readCookie(refreshed, 'accessToken') }));

    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(session.email);
  });

  it('serves every tab that presents the same cookie at once', async () => {
    const session = await registerUser();

    // The regression guard for the multi-tab logout: each tab holds its own refresh mutex, so they
    // all arrive with the same cookie the moment the access token expires. Before the grace window
    // the first won and the rest were signed out.
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        http()
          .post('/auth/refresh')
          .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }))
      )
    );

    expect(attempts.map((attempt) => attempt.status)).toEqual([200, 200, 200, 200, 200]);

    for (const attempt of attempts) {
      const accessToken = readCookie(attempt, 'accessToken');
      const me = await http().get('/auth/me').set('Cookie', cookieHeader({ accessToken }));
      expect(me.status).toBe(200);
    }
  });

  it('anchors the grace window to the first use, so replaying cannot extend it', async () => {
    const session = await registerUser();

    await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    const firstUse = await testApp.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(session.refreshToken) },
    });

    await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    const afterReplay = await testApp.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(session.refreshToken) },
    });

    expect(afterReplay?.usedAt?.getTime()).toBe(firstUse?.usedAt?.getTime());
  });

  it('drops every session of the user when a spent token comes back too late', async () => {
    const session = await registerUser();

    const secondDevice = await http()
      .post('/auth/login')
      .send({ email: session.email, password: PASSWORD });
    expect(secondDevice.status).toBe(200);

    await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    await backdateRotation(session.refreshToken, ROTATION_GRACE_SECONDS + 5);

    const replay = await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    expect(replay.status).toBe(401);

    // Past the window the only explanation is a copy someone else kept, so the other device goes
    // too: that is the whole point of rotating.
    const survivors = await testApp.prisma.refreshToken.count();
    expect(survivors).toBe(0);

    const stillValid = await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: readCookie(secondDevice, 'refreshToken') }));
    expect(stillValid.status).toBe(401);
  });

  it('refuses a refresh token that has expired', async () => {
    const session = await registerUser();

    await testApp.prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(session.refreshToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    expect(response.status).toBe(401);
  });

  it('refuses a refresh with no cookie', async () => {
    const response = await http().post('/auth/refresh');

    expect(response.status).toBe(401);
  });
});

describe('logout', () => {
  it('invalidates the refresh token and clears both cookies', async () => {
    const session = await registerUser();

    const response = await http()
      .post('/auth/logout')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    expect(response.status).toBe(200);
    expect(readCookie(response, 'accessToken')).toBe('');
    expect(readCookie(response, 'refreshToken')).toBe('');

    const reuse = await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));
    expect(reuse.status).toBe(401);
  });

  it('leaves the other devices signed in', async () => {
    const session = await registerUser();
    const secondDevice = await http()
      .post('/auth/login')
      .send({ email: session.email, password: PASSWORD });

    await http()
      .post('/auth/logout')
      .set('Cookie', cookieHeader({ refreshToken: session.refreshToken }));

    const other = await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: readCookie(secondDevice, 'refreshToken') }));

    expect(other.status).toBe(200);
  });
});

describe('password change', () => {
  it('locks out the other sessions but keeps the caller signed in', async () => {
    const session = await registerUser();
    const otherDevice = await http()
      .post('/auth/login')
      .send({ email: session.email, password: PASSWORD });

    const changed = await http()
      .post('/users/me/password')
      .set('Cookie', cookieHeader({ accessToken: session.accessToken }))
      .send({ currentPassword: PASSWORD, newPassword: 'OutraSenha456!' });

    expect(changed.status).toBe(204);

    const lockedOut = await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: readCookie(otherDevice, 'refreshToken') }));
    expect(lockedOut.status).toBe(401);

    // Without a reissued pair the person who just changed their password would be signed out by
    // their own action, the moment their access token ran out.
    const caller = await http()
      .post('/auth/refresh')
      .set('Cookie', cookieHeader({ refreshToken: readCookie(changed, 'refreshToken') }));
    expect(caller.status).toBe(200);
  });

  it('refuses a change that does not know the current password', async () => {
    const session = await registerUser();

    const response = await http()
      .post('/users/me/password')
      .set('Cookie', cookieHeader({ accessToken: session.accessToken }))
      .send({ currentPassword: 'senha-errada', newPassword: 'OutraSenha456!' });

    expect(response.status).toBe(401);
  });
});
