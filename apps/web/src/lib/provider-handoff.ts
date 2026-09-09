/**
 * Marks the one page trip this app takes on purpose: the round trip to an identity provider.
 *
 * Two readers, for opposite reasons: the draft storage WRITES, because this is the only exit whose
 * state must come back, and the unsaved-changes guard stays QUIET, because nothing is being lost.
 * Module state rather than React state, since it is read at `pagehide` time and dies with the
 * document.
 */
let handingOff = false;

/** Called the instant a provider button is pressed, before the browser leaves. */
export const armProviderHandoff = (): void => {
  handingOff = true;
};

export const isHandingOffToProvider = (): boolean => handingOff;
