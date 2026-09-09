import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';
import { notifySessionExpired } from '@/lib/api/session-events';

const me = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/auth', () => ({ authApi: { me } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));

const authError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status },
  });

/** A request that never reached the API: an axios error with no `response` at all. */
const networkError = () => Object.assign(new Error('Network Error'), { isAxiosError: true });

const Probe = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <p>carregando</p>;
  return <p>{user ? `sessao:${user.username}` : 'sem sessao'}</p>;
};

const renderProbe = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

const session = { user: { id: 'u1', username: 'dk', email: 'dk@example.com' } };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  me.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the session probe at boot', () => {
  it('shows the session once the API answers', async () => {
    me.mockResolvedValue(session);

    renderProbe();

    expect(await screen.findByText('sessao:dk')).toBeDefined();
  });

  it('reports no session on a 401, without retrying', async () => {
    me.mockRejectedValue(authError(401));

    renderProbe();

    expect(await screen.findByText('sem sessao')).toBeDefined();
    expect(me).toHaveBeenCalledTimes(1);
  });

  it('keeps trying while the API is unreachable, then signs in', async () => {
    // The Docker-just-started case. The first answer is not an answer at all, and giving up on it
    // is what opened the app signed out with a valid cookie in the jar.
    me.mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue(session);

    renderProbe();

    await vi.advanceTimersByTimeAsync(5000);

    expect(await screen.findByText('sessao:dk')).toBeDefined();
    expect(me).toHaveBeenCalledTimes(3);
  });

  it('holds the loading state while it retries, instead of claiming no session', async () => {
    me.mockRejectedValue(networkError());

    renderProbe();

    await vi.advanceTimersByTimeAsync(200);
    expect(screen.getByText('carregando')).toBeDefined();
  });

  it('gives up after the backoff runs out', async () => {
    me.mockRejectedValue(networkError());

    renderProbe();

    await vi.advanceTimersByTimeAsync(10_000);

    await waitFor(() => expect(screen.getByText('sem sessao')).toBeDefined());
    // Four attempts: the first plus one per backoff step.
    expect(me).toHaveBeenCalledTimes(4);
  });
});

describe('an expired session reported by the API client', () => {
  it('drops the user', async () => {
    me.mockResolvedValue(session);

    renderProbe();
    expect(await screen.findByText('sessao:dk')).toBeDefined();

    notifySessionExpired();

    expect(await screen.findByText('sem sessao')).toBeDefined();
  });
});

describe('the re-check when the tab regains focus', () => {
  it('does not spend a request on every alt-tab', async () => {
    me.mockResolvedValue(session);

    renderProbe();
    expect(await screen.findByText('sessao:dk')).toBeDefined();
    me.mockClear();

    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));

    expect(me).not.toHaveBeenCalled();
  });

  it('re-checks once the session is stale enough', async () => {
    me.mockResolvedValue(session);

    renderProbe();
    expect(await screen.findByText('sessao:dk')).toBeDefined();
    me.mockClear();

    await vi.advanceTimersByTimeAsync(61_000);
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(me).toHaveBeenCalledTimes(1));
  });

  it('signs out when the re-check comes back 401', async () => {
    me.mockResolvedValue(session);

    renderProbe();
    expect(await screen.findByText('sessao:dk')).toBeDefined();

    me.mockRejectedValue(authError(401));
    await vi.advanceTimersByTimeAsync(61_000);
    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByText('sem sessao')).toBeDefined();
  });

  it('keeps the user when the re-check cannot reach the API', async () => {
    // Coming back to a laptop whose wifi has not reconnected yet. Nothing was learned about the
    // session, so nothing should change.
    me.mockResolvedValue(session);

    renderProbe();
    expect(await screen.findByText('sessao:dk')).toBeDefined();

    me.mockRejectedValue(networkError());
    await vi.advanceTimersByTimeAsync(61_000);
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(me).toHaveBeenCalled());
    expect(screen.getByText('sessao:dk')).toBeDefined();
  });
});
