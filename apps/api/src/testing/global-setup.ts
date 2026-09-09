import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { maintenanceDatabaseUrl, testDatabaseName, testDatabaseUrl } from './test-database';

// PostgreSQL's "database already exists". Racing suites are not an error worth failing on.
const DUPLICATE_DATABASE = '42P04';

const createTestDatabaseIfMissing = async (): Promise<void> => {
  const admin = new PrismaClient({ datasources: { db: { url: maintenanceDatabaseUrl() } } });

  try {
    // CREATE DATABASE takes no parameters and cannot run inside a transaction, so the name is
    // interpolated. It comes from DATABASE_URL, not from user input, and is quoted as an identifier.
    await admin.$executeRawUnsafe(`CREATE DATABASE "${testDatabaseName()}"`);
  } catch (error) {
    if ((error as { meta?: { code?: string } })?.meta?.code !== DUPLICATE_DATABASE) throw error;
  } finally {
    await admin.$disconnect();
  }
};

/**
 * Brings the test database up to the same migrations as production before any suite runs.
 *
 * `migrate deploy` rather than `db push`: the suite then also proves the migrations themselves
 * apply cleanly, which is the half of the schema that never gets exercised by running the app.
 */
export default async function setup(): Promise<void> {
  await createTestDatabaseIfMissing();

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
