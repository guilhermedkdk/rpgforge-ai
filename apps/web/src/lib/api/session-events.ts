type SessionExpiredListener = () => void;

const listeners = new Set<SessionExpiredListener>();

/**
 * Subscribes to "the session is definitively gone", and returns the unsubscribe.
 *
 * The API client cannot answer an expired session on its own: what should happen depends on the
 * route, and only React knows that. It used to guess with `window.location.href`, a full page load
 * that threw away the unsaved character the sign-in dialog exists to protect. So the client only
 * reports, and `AuthProvider` decides.
 */
export const onSessionExpired = (listener: SessionExpiredListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Reports that refreshing failed and the person is no longer authenticated. */
export const notifySessionExpired = (): void => {
  listeners.forEach((listener) => listener());
};
