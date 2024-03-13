import { expect, test, describe, vi } from 'vitest';
import { createInngestFunctionMock, spyOnElba } from '@elba-security/test-utils';
import { env } from '@/env';
import * as itemsConnector from '@/connectors/share-point/items';
import type { MicrosoftDriveItem } from '@/connectors/share-point/items';
import * as permissionsConnector from '@/connectors/share-point/permissions';
import type { MicrosoftDriveItemPermissions } from '@/connectors/share-point/permissions';
import { encrypt } from '@/common/crypto';
import { syncItems, parseItems, parseDataProtetionItems } from './sync-items';
import type { ItemsWithPermisions } from './sync-items';

const token = 'test-token';

const organisation = {
  id: '45a76301-f1dd-4a77-b12f-9d7d3fca3c90',
  token: await encrypt(token),
  tenantId: 'tenant-id',
  region: 'us',
};
const siteId = 'some-site-id';
const driveId = 'some-drive-id';
const folderId = 'some-folder-id';
const isFirstSync = false;

const itemsCount = 5;

const createTempData = (title: string, i: number): MicrosoftDriveItem => ({
  id: `${title}-id-${i}`,
  name: `${title}-name-${i}`,
  webUrl: `http://${title}-webUrl-${i}.somedomain.net`,
  createdBy: {
    user: {
      email: `${title}-user-email-${i}@someemail.com`,
      id: `${title}-user-id-${i}`,
      displayName: `${title}user-displayName-${i}`,
    },
  },
});

const items: MicrosoftDriveItem[] = Array.from({ length: itemsCount }, (_, i) =>
  createTempData('item', i)
);

const folders: MicrosoftDriveItem[] = Array.from({ length: itemsCount }, (_, i) => ({
  ...createTempData('folder', i),
  folder: { childCount: i },
}));

const groupedItems: MicrosoftDriveItem[] = [...folders, ...items];

const permissions: MicrosoftDriveItemPermissions[] = Array.from({ length: itemsCount }, (_, i) => ({
  id: `permission-id-${i}`,
  roles: ['write'],
  link: { scope: 'users' },
  grantedToV2: {
    user: {
      displayName: `some-display-name-${i}`,
      id: `some-user-id-${i}`,
      email: `some-user-email-${i}`,
    },
  },
  grantedToIdentitiesV2: [
    {
      user: {
        displayName: `some-display-name-${i}`,
        id: `some-user-id-${i}`,
        email: `some-user-email-${i}`,
      },
    },
  ],
}));

const setup = createInngestFunctionMock(syncItems, 'one-drive/items.sync.triggered');

describe('sync-drives', () => {
  test('should continue the sync when there is a next page', async () => {
    const nextSkipToken = 'next-skip-token';
    const skipToken = null;

    vi.spyOn(itemsConnector, 'getItems').mockResolvedValue({
      items: groupedItems,
      nextSkipToken,
    });
    vi.spyOn(permissionsConnector, 'getItemPermissions').mockResolvedValue({
      permissions,
      nextSkipToken: skipToken,
    });

    const [result] = setup({
      token,
      siteId,
      driveId,
      isFirstSync,
      folderId,
      skipToken,
      organisationId: organisation.id,
      organisationRegion: organisation.region,
    });

    await expect(result).resolves.toStrictEqual({ status: 'ongoing' });
  });

  test('should finalize the sync when there is a no next page', async () => {
    const skipToken = null;

    vi.spyOn(itemsConnector, 'getItems').mockResolvedValue({
      items: groupedItems,
      nextSkipToken: skipToken,
    });
    vi.spyOn(permissionsConnector, 'getItemPermissions').mockResolvedValue({
      permissions,
      nextSkipToken: null,
    });

    const [result] = setup({
      token,
      siteId,
      driveId,
      isFirstSync,
      folderId,
      skipToken,
      organisationId: organisation.id,
      organisationRegion: organisation.region,
    });

    await expect(result).resolves.toStrictEqual({ status: 'completed' });
  });

  test('should get items', async () => {
    const nextSkipToken = 'next-skip-token';
    const skipToken = null;

    vi.spyOn(itemsConnector, 'getItems').mockResolvedValue({
      items: groupedItems,
      nextSkipToken,
    });

    const [_, { step }] = setup({
      token,
      siteId,
      driveId,
      isFirstSync,
      folderId,
      skipToken,
      organisationId: organisation.id,
      organisationRegion: organisation.region,
    });

    expect(itemsConnector.getItems).toBeCalledWith({
      token,
      siteId,
      driveId,
      folderId,
      skipToken,
    });

    expect(itemsConnector.getItems).toBeCalledTimes(1);

    await expect(
      itemsConnector.getItems({
        token,
        siteId,
        driveId,
        folderId,
        skipToken,
      })
    ).resolves.toStrictEqual({
      items: groupedItems,
      nextSkipToken,
    });

    expect(step.run).toBeCalledTimes(1);
  });

  test('should send "one-drive/items.sync.triggered" if folders found', async () => {
    const nextSkipToken = 'next-skip-token';
    const skipToken = null;

    vi.spyOn(itemsConnector, 'getItems').mockResolvedValue({
      items: groupedItems,
      nextSkipToken,
    });

    const [_, { step }] = setup({
      token,
      siteId,
      driveId,
      isFirstSync,
      folderId,
      skipToken,
      organisationId: organisation.id,
      organisationRegion: organisation.region,
    });

    await expect(
      itemsConnector.getItems({
        token,
        siteId,
        driveId,
        folderId,
        skipToken,
      })
    ).resolves.toStrictEqual({
      items: groupedItems,
      nextSkipToken,
    });

    const parsedResult = parseItems(groupedItems);

    if (parsedResult.folders.length) {
      for (let i = 0; i < folders.length; i++) {
        expect(step.sendEvent).nthCalledWith(i + 1, 'one-drive-sync-items', {
          name: 'one-drive/items.sync.triggered',
          data: {
            token,
            siteId,
            driveId,
            isFirstSync,
            folderId: folders[i]?.id,
            skipToken: null,
            organisationId: organisation.id,
            organisationRegion: organisation.region,
          },
        });
      }

      expect(step.sendEvent).toBeCalledTimes(parsedResult.folders.length);
    }

    expect(step.run).toBeCalledTimes(1);
  });

  test('should get items permissions', async () => {
    vi.spyOn(permissionsConnector, 'getItemPermissions').mockResolvedValue({
      permissions,
      nextSkipToken: null,
    });

    const [result] = setup({
      token,
      siteId,
      driveId,
      isFirstSync,
      folderId,
      skipToken: null,
      organisationId: organisation.id,
      organisationRegion: organisation.region,
    });

    await result;

    for (let i = 0; i < groupedItems.length; i++) {
      expect(permissionsConnector.getItemPermissions).nthCalledWith(i + 1, {
        token,
        siteId,
        driveId,
        itemId: groupedItems[i]?.id,
        skipToken: null,
      });

      expect(permissionsConnector.getItemPermissions).nthReturnedWith;
    }

    expect(permissionsConnector.getItemPermissions).toBeCalledTimes(groupedItems.length);
  });

  test('should call elba.dataProtection.updateObjects', async () => {
    const elba = spyOnElba();

    vi.spyOn(itemsConnector, 'getItems').mockResolvedValue({
      items: groupedItems,
      nextSkipToken: null,
    });
    vi.spyOn(permissionsConnector, 'getItemPermissions').mockResolvedValue({
      permissions,
      nextSkipToken: null,
    });

    const [result, { step }] = setup({
      token,
      siteId,
      driveId,
      isFirstSync,
      folderId,
      skipToken: null,
      organisationId: organisation.id,
      organisationRegion: organisation.region,
    });

    await result;

    const dataProtectionItems = parseDataProtetionItems(
      groupedItems.map((item) => ({
        item,
        permissions,
      })) as unknown as ItemsWithPermisions[]
    );

    expect(elba).toBeCalledTimes(1);
    expect(elba).toBeCalledWith({
      organisationId: organisation.id,
      region: organisation.region,
      apiKey: env.ELBA_API_KEY,
      baseUrl: env.ELBA_API_BASE_URL,
    });

    const elbaInstance = elba.mock.results[0]?.value;

    expect(elbaInstance?.dataProtection.updateObjects).toBeCalledTimes(1);
    expect(elbaInstance?.dataProtection.updateObjects).toBeCalledWith({
      objects: dataProtectionItems,
    });

    expect(step.run).toBeCalledTimes(3);
  });
});
