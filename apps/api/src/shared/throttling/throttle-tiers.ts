const seconds = (n: number) => n * 1000;
const minutes = (n: number) => seconds(n * 60);
const hours = (n: number) => minutes(n * 60);

/**
 * Buckets every route gets: a burst guard plus a sustained one. Generous on purpose, normal
 * browsing must never reach them.
 */
export const DEFAULT_THROTTLERS = [
  { name: 'short', ttl: seconds(10), limit: 40 },
  { name: 'long', ttl: minutes(1), limit: 200 },
];

/** Login and register: the brute-force surface. Tracked per IP, since there is no token yet. */
export const AUTH_THROTTLE = {
  short: { ttl: minutes(1), limit: 10 },
  long: { ttl: minutes(15), limit: 30 },
};

/**
 * Password reset requests: each one spends an e-mail from a sender with a daily cap, and the route
 * takes an address from anyone. Tight on purpose, since nobody needs a third link in five minutes.
 */
export const PASSWORD_RESET_THROTTLE = {
  short: { ttl: minutes(5), limit: 3 },
  long: { ttl: hours(1), limit: 10 },
};

/** AI generation: every call spends OpenAI credit (~US$0.01 per finished draft). */
export const GENERATION_THROTTLE = {
  short: { ttl: minutes(1), limit: 5 },
  long: { ttl: hours(1), limit: 30 },
};

/** PDF export: each one drives a headless browser, which costs real CPU and memory. */
export const EXPORT_THROTTLE = {
  short: { ttl: minutes(1), limit: 6 },
  long: { ttl: hours(1), limit: 60 },
};

/** Semantic search: one OpenAI embedding per query. Cheap, not free. */
export const SEARCH_THROTTLE = {
  short: { ttl: minutes(1), limit: 20 },
  long: { ttl: hours(1), limit: 200 },
};
