import { beforeEach } from 'vitest';
import { db } from '@/database/client';
import { organisationsTable, sharePointTable } from '@/database/schema';

// Delete every entries in the database between each tests
beforeEach(async () => {
  await db.delete(sharePointTable);
  await db.delete(organisationsTable);
});
