/**
 * A one-way baton that carries work across the sign-in round trip, and across nothing else.
 *
 * A provider sign-in leaves the site and returns through a callback, so no React state survives it.
 * The scope is deliberately narrow: a draft exists only between the provider click and the return,
 * so nothing stored can outlive an explicit "Descartar ficha". Session-scoped, because a draft
 * should not outlive the tab on a shared machine.
 */

/** Prefixed so a draft is recognizable in devtools and can never collide with another app's key. */
const NAMESPACE = 'rpgforge:draft:';

/** Every key in use, together, so it is obvious what a tab can be holding. */
export const DRAFT_KEYS = {
  /** Which step of the create flow, and the pack and mode chosen there. */
  createStep: 'create:step',
  /** The AI wizard: prompt, questions, answers and the generated result. */
  createAi: 'create:ai',
  /** The character being built by hand, in form shape. */
  createManual: 'create:manual',
} as const;

/**
 * Reads a draft and removes it in one go.
 *
 * Read-once is what keeps the baton from becoming a resume feature: once the work is back in memory
 * the stored copy has no reason to exist, and leaving it behind is what let a discarded sheet come
 * back later.
 */
export const takeSessionDraft = <T>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(NAMESPACE + key);
    if (raw === null) return null;
    window.sessionStorage.removeItem(NAMESPACE + key);
    return JSON.parse(raw) as T;
  } catch {
    // Reading throws outright when site data is blocked, so this is not only a parse guard.
    return null;
  }
};

export const writeSessionDraft = (key: string, value: unknown): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(NAMESPACE + key, JSON.stringify(value));
  } catch {
    // Over quota, or storage blocked. Losing a draft is bad; breaking the editor is worse.
  }
};
