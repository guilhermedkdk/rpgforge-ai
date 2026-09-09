import 'reflect-metadata';
import { testDatabaseUrl } from './test-database';

// Set inside the worker, before anything constructs a PrismaClient: the client reads DATABASE_URL
// once, at construction, and PrismaService takes no override. Pointing this at the development
// database would let the truncation between cases delete real data.
process.env.DATABASE_URL = testDatabaseUrl();
