import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from './client';
import { onSessionExpired } from './session-events';

// Two adapters, because the refresh deliberately does NOT go through `apiClient`: routing it back
// through the instance whose interceptor is handling a 401 is how that interceptor recurses.
let api: MockAdapter;
let bare: MockAdapter;

const refreshCalls = () => bare.history.post.filter((call) => call.url?.includes('/auth/refresh'));

beforeEach(() => {
  api = new MockAdapter(apiClient);
  bare = new MockAdapter(axios);
});

afterEach(() => {
  api.restore();
  bare.restore();
});

describe('401 handling', () => {
  it('refreshes once and replays the original request', async () => {
    api.onGet('/auth/me').replyOnce(401).onGet('/auth/me').replyOnce(200, { user: { id: 'u1' } });
    bare.onPost(/\/auth\/refresh$/).reply(200, {});

    const response = await apiClient.get('/auth/me');

    expect(response.status).toBe(200);
    expect(response.data.user.id).toBe('u1');
    expect(refreshCalls()).toHaveLength(1);
  });

  it('refreshes only once for the requests that fail together', async () => {
    // The per-tab mutex. Several calls racing into the same 401 must not each spend a rotation,
    // which on the server would burn through the grace window for no reason.
    api.onGet('/auth/me').replyOnce(401).onGet('/auth/me').reply(200, { user: { id: 'u1' } });
    api.onGet('/sheets').replyOnce(401).onGet('/sheets').reply(200, []);
    bare.onPost(/\/auth\/refresh$/).reply(200, {});

    await Promise.all([apiClient.get('/auth/me'), apiClient.get('/sheets')]);

    expect(refreshCalls()).toHaveLength(1);
  });

  it('gives up after one refresh instead of looping', async () => {
    api.onGet('/auth/me').reply(401);
    bare.onPost(/\/auth\/refresh$/).reply(200, {});

    await expect(apiClient.get('/auth/me')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(refreshCalls()).toHaveLength(1);
  });

  it('does not try to refresh a rejected login', async () => {
    // A 401 here means "wrong password", and answering it with a refresh would swallow the message
    // the form has to show.
    api.onPost('/auth/login').reply(401, { message: 'Invalid credentials' });

    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(refreshCalls()).toHaveLength(0);
  });
});

describe('failures that are not a 401', () => {
  it('never refreshes on a network error', async () => {
    api.onGet('/sheets').networkError();

    await expect(apiClient.get('/sheets')).rejects.toBeInstanceOf(Error);
    expect(refreshCalls()).toHaveLength(0);
  });

  it('never refreshes on a 500', async () => {
    api.onGet('/sheets').reply(500);

    await expect(apiClient.get('/sheets')).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(refreshCalls()).toHaveLength(0);
  });
});

describe('reporting an expired session', () => {
  it('reports it when the refresh is refused', async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);

    api.onGet('/auth/me').reply(401);
    bare.onPost(/\/auth\/refresh$/).reply(401);

    await expect(apiClient.get('/auth/me')).rejects.toBeDefined();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stays quiet when the refresh merely could not be delivered', async () => {
    // The regression guard for the bug that started all of this: a refresh that never reached the
    // API says nothing about the session, and tearing it down over that is what signed people out
    // of a perfectly good session while the API was still starting.
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);

    api.onGet('/auth/me').reply(401);
    bare.onPost(/\/auth\/refresh$/).networkError();

    await expect(apiClient.get('/auth/me')).rejects.toBeDefined();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('stops calling a listener that unsubscribed', async () => {
    const listener = vi.fn();
    onSessionExpired(listener)();

    api.onGet('/auth/me').reply(401);
    bare.onPost(/\/auth\/refresh$/).reply(401);

    await expect(apiClient.get('/auth/me')).rejects.toBeDefined();

    expect(listener).not.toHaveBeenCalled();
  });
});
