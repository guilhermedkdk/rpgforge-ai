import axios from 'axios';

/**
 * Whether the API actually answered "you are not authenticated".
 *
 * The distinction is the whole point: a request that never landed (API still booting, network
 * blip, 502 mid-deploy) carries no `response` at all, and treating that as a signed-out answer is
 * how a two-second hiccup logs everyone out of a page they never left.
 */
export const isAuthFailure = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 401;
