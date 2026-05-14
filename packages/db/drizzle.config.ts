import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for drizzle-kit. See .env.example.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
  // The observations table is partitioned by range on observed_at.
  // Drizzle does not emit the PARTITION BY clause; see drizzle/0001_partition.sql
  // for the hand-rolled migration that converts the generated table to a
  // partitioned one and creates the first set of daily partitions.
});
