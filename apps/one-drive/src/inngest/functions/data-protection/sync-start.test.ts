import { expect, test, describe, vi } from 'vitest';
import { createInngestFunctionMock } from '@elba-security/test-utils';
import { NonRetriableError } from 'inngest';
import * as sitesConnector from '@/connectors/share-point/sites';
import type { MicrosoftSite } from '@/connectors/share-point/sites';
import { organisationsTable } from '@/database/schema';
import { encrypt } from '@/common/crypto';
import { db } from '@/database/client';
import { syncStart } from './sync-start';

const token = 'test-token';

const organisation = {
  id: '45a76301-f1dd-4a77-b12f-9d7d3fca3c90',
  token: await encrypt(token),
  tenantId: 'tenant-id',
  region: 'us',
};

const syncStartedAt = Date.now();
const isFirstSync = false;
const siteCount = 5;

const sites: MicrosoftSite[] = Array.from({ length: siteCount }, (_, i) => ({
  id: `site-id-${i}`,
}));

const setup = createInngestFunctionMock(syncStart, 'one-drive/data_protection.sync.requested');

describe('sync-data-protection', () => {
  test('should abort sync when organisation is not registered', async () => {
    vi.spyOn(sitesConnector, 'getSites').mockResolvedValue({
      nextSkipToken: null,
      sites: [],
    });

    const [result, { step }] = setup({
      organisationId: organisation.id,
      isFirstSync: false,
      syncStartedAt: Date.now(),
      skipToken: null,
    });

    await expect(result).rejects.toBeInstanceOf(NonRetriableError);

    expect(sitesConnector.getSites).toBeCalledTimes(0);

    expect(step.sendEvent).toBeCalledTimes(0);
  });

  test('should send "one-drive/drives.sync.triggered" when sites found', async () => {
    await db.insert(organisationsTable).values(organisation);
    vi.spyOn(sitesConnector, 'getSites').mockResolvedValue({
      nextSkipToken: null,
      sites,
    });

    const [result, { step }] = setup({
      organisationId: organisation.id,
      isFirstSync: false,
      syncStartedAt: Date.now(),
      skipToken: null,
    });

    await result;

    expect(sitesConnector.getSites).toBeCalledTimes(1);

    for (let i = 0; i < siteCount; i++) {
      expect(step.sendEvent).nthCalledWith(i + 1, 'drives-sync-triggered', {
        name: 'one-drive/drives.sync.triggered',
        data: {
          token,
          siteId: sites[i]?.id,
          isFirstSync,
          skipToken: null,
          organisationId: organisation.id,
          organisationRegion: organisation.region,
        },
      });
    }

    expect(step.sendEvent).toBeCalledTimes(siteCount);
  });

  test('should continue the sync when there is a next page', async () => {
    const nextSkipToken = 'next-skip-token';
    const skipToken = null;
    await db.insert(organisationsTable).values(organisation);
    vi.spyOn(sitesConnector, 'getSites').mockResolvedValue({
      nextSkipToken,
      sites,
    });
    const [result, { step }] = setup({
      organisationId: organisation.id,
      isFirstSync: false,
      skipToken,
      syncStartedAt,
    });

    await expect(result).resolves.toStrictEqual({ status: 'ongoing' });

    expect(sitesConnector.getSites).toBeCalledTimes(1);
    expect(sitesConnector.getSites).toBeCalledWith({
      token,
      skipToken,
    });

    // check that the function continue the pagination process
    expect(step.sendEvent).nthCalledWith(siteCount + 1, 'sync-next-sites-page', {
      name: 'one-drive/data_protection.sync.requested',
      data: {
        organisationId: organisation.id,
        isFirstSync: false,
        syncStartedAt,
        skipToken: nextSkipToken,
      },
    });

    expect(step.sendEvent).toBeCalledTimes(siteCount + 1);
  });

  test('should finalize the sync when there is a no next page', async () => {
    const nextSkipToken = null;
    const skipToken = 'skip-token';
    await db.insert(organisationsTable).values(organisation);
    vi.spyOn(sitesConnector, 'getSites').mockResolvedValue({
      nextSkipToken,
      sites,
    });
    const [result, { step }] = setup({
      organisationId: organisation.id,
      isFirstSync: false,
      skipToken,
      syncStartedAt,
    });

    await expect(result).resolves.toStrictEqual({ status: 'completed' });

    expect(sitesConnector.getSites).toBeCalledTimes(1);
    expect(sitesConnector.getSites).toBeCalledWith({
      token,
      skipToken,
    });

    // check that the function does not continue the pagination process
    expect(step.sendEvent).toBeCalledTimes(siteCount);
  });
});
