import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

/**
 * A sibling of the development database, same server and credentials, different name.
 *
 * Derived rather than configured so there is nothing to keep in step and no connection string to
 * copy into the repository: whoever can run the app can run the suite. The tests truncate between
 * cases, which is also why they must never be pointed at the development database.
 */
export const testDatabaseUrl = (): string => {
  const developmentUrl = process.env.DATABASE_URL;
  if (!developmentUrl) {
    throw new Error('DATABASE_URL is required to derive the test database URL');
  }

  const url = new URL(developmentUrl);
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`;

  return url.toString();
};

/** The `postgres` maintenance database on the same server: the only place CREATE DATABASE can run. */
export const maintenanceDatabaseUrl = (): string => {
  const url = new URL(testDatabaseUrl());
  url.pathname = 'postgres';

  return url.toString();
};

/** The name CREATE/DROP DATABASE needs, without the rest of the connection string. */
export const testDatabaseName = (): string =>
  decodeURIComponent(new URL(testDatabaseUrl()).pathname.replace(/^\//, ''));
