import { expect, test, describe, vi } from 'vitest';
import { createInngestFunctionMock } from '@elba-security/test-utils';
import * as drivesConnector from '@/connectors/share-point/drives';
import type { MicrosoftDrive } from '@/connectors/share-point/drives';
import { syncDrives } from './sync-drives';

const token = 'test-token';
const organisation = {
  id: '45a76301-f1dd-4a77-b12f-9d7d3fca3c90',
  region: 'us',
};
const siteId = 'some-site-id';
const isFirstSync = false;

const driveCount = 5;

const drives: MicrosoftDrive[] = Array.from({ length: driveCount }, (_, i) => ({
  id: `drive-id-${i}`,
}));

const setup = createInngestFunctionMock(syncDrives, 'one-drive/drives.sync.triggered');

describe('sync-drives', () => {
  test('should send "one-drive/items.sync.triggered" when drives found', async () => {
    vi.spyOn(drivesConnector, 'getDrives').mockResolvedValue({
      nextSkipToken: null,
      drives,
    });

    const [result, { step }] = setup({
      token,
      siteId,
      organisationId: organisation.id,
      organisationRegion: organisation.region,
      isFirstSync: false,
      skipToken: null,
    });

    expect(drivesConnector.getDrives).toBeCalledTimes(1);

    await result;

    for (let i = 0; i < driveCount; i++) {
      expect(step.sendEvent).nthCalledWith(i + 1, 'one-drive-sync-drives', {
        name: 'one-drive/items.sync.triggered',
        data: {
          token,
          siteId,
          driveId: drives[i]?.id,
          isFirstSync,
          folderId: null,
          skipToken: null,
          organisationId: organisation.id,
          organisationRegion: organisation.region,
        },
      });
    }

    expect(step.sendEvent).toBeCalledTimes(driveCount);
  });

  test('should continue the sync when there is a next page', async () => {
    const nextSkipToken = 'next-skip-token';
    const skipToken = null;
    vi.spyOn(drivesConnector, 'getDrives').mockResolvedValue({
      nextSkipToken,
      drives,
    });
    const [result, { step }] = setup({
      token,
      siteId,
      organisationId: organisation.id,
      organisationRegion: organisation.region,
      isFirstSync: false,
      skipToken,
    });

    expect(drivesConnector.getDrives).toBeCalledTimes(1);
    expect(drivesConnector.getDrives).toBeCalledWith({
      token,
      siteId,
      skipToken,
    });

    await expect(result).resolves.toStrictEqual({ status: 'ongoing' });

    // check that the function continue the pagination process
    expect(step.sendEvent).nthCalledWith(driveCount + 1, 'sync-next-drives-page', {
      name: 'one-drive/drives.sync.triggered',
      data: {
        organisationId: organisation.id,
        organisationRegion: organisation.region,
        isFirstSync: false,
        token,
        siteId,
        skipToken: nextSkipToken,
      },
    });

    expect(step.sendEvent).toBeCalledTimes(driveCount + 1);
  });

  test('should finalize the sync when there is a no next page', async () => {
    const nextSkipToken = null;
    const skipToken = 'skip-token';
    vi.spyOn(drivesConnector, 'getDrives').mockResolvedValue({
      nextSkipToken,
      drives,
    });

    const [result, { step }] = setup({
      token,
      siteId,
      organisationId: organisation.id,
      organisationRegion: organisation.region,
      isFirstSync: false,
      skipToken,
    });

    await expect(result).resolves.toStrictEqual({ status: 'completed' });

    expect(drivesConnector.getDrives).toBeCalledTimes(1);
    expect(drivesConnector.getDrives).toBeCalledWith({
      token,
      siteId,
      skipToken,
    });

    // check that the function sends only "one-drive/items.sync.triggered" events when drives found
    expect(step.sendEvent).toBeCalledTimes(driveCount);
  });
});
