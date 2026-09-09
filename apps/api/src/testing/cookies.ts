import type { Response } from 'supertest';

/** The `Set-Cookie` headers of a response, whatever shape supertest handed back. */
const setCookies = (response: Response): string[] => {
  const header = response.headers['set-cookie'];
  if (!header) return [];

  return Array.isArray(header) ? header : [header];
};

/** The value a response assigns to `name`, or undefined when it does not set that cookie. */
export const readCookie = (response: Response, name: string): string | undefined => {
  const match = setCookies(response).find((cookie) => cookie.startsWith(`${name}=`));
  if (!match) return undefined;

  const value = match.split(';')[0].slice(name.length + 1);

  // An empty value is how `clearCookie` deletes one, which is an answer, not a missing cookie.
  return decodeURIComponent(value);
};

/** The attributes of a `Set-Cookie`, lowercased, so a test can assert on HttpOnly and friends. */
export const cookieAttributes = (response: Response, name: string): string[] => {
  const match = setCookies(response).find((cookie) => cookie.startsWith(`${name}=`));
  if (!match) return [];

  return match
    .split(';')
    .slice(1)
    .map((attribute) => attribute.trim().toLowerCase());
};

/** A `Cookie` request header carrying exactly the pairs given. */
export const cookieHeader = (pairs: Record<string, string | undefined>): string =>
  Object.entries(pairs)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
