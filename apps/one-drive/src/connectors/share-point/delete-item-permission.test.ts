import { http } from 'msw';
import { describe, expect, test, beforeEach } from 'vitest';
import { env } from '@/env';
import { MicrosoftError } from '@/common/error';
import { server } from '../../../vitest/setup-msw-handlers';
import { deleteItemPermission } from './delete-item-permission';

const validToken = 'token-1234';

const siteId = 'some-site-id';
const driveId = 'some-drive-id';
const itemId = 'some-item-id';
const permissionId = 'permission-id';

describe('delete-item-permission connector', () => {
  describe('deleteItemPermission', () => {
    // mock token API endpoint using msw
    beforeEach(() => {
      server.use(
        http.delete(
          `${env.MICROSOFT_API_URL}/sites/:siteId/drives/:driveId/items/:itemId/permissions/:permissionId`,
          ({ request, params }) => {
            if (
              request.headers.get('Authorization') !== `Bearer ${validToken}` ||
              params.siteId !== siteId ||
              params.driveId !== driveId ||
              params.permissionId !== permissionId
            ) {
              return new Response(undefined, { status: 401 });
            } else if (params.itemId !== itemId) {
              return new Response(undefined, { status: 404 });
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- convenience
            return Response.json({ status: 200 });
          }
        )
      );
    });

    test('should resolves when the token and data is valid', () => {
      expect(deleteItemPermission({ token: validToken, siteId, driveId, itemId, permissionId }))
        .resolves;
    });

    test('should throws when the token is invalid', async () => {
      await expect(
        deleteItemPermission({ token: 'invalid-token', siteId, driveId, itemId, permissionId })
      ).rejects.toBeInstanceOf(MicrosoftError);
    });

    test('should throws when the siteId is invalid', async () => {
      await expect(
        deleteItemPermission({
          token: validToken,
          siteId: 'invalid-siteId',
          driveId,
          itemId,
          permissionId,
        })
      ).rejects.toBeInstanceOf(MicrosoftError);
    });

    test('should throws when the driveId is invalid', async () => {
      await expect(
        deleteItemPermission({
          token: validToken,
          siteId,
          driveId: 'invalid-driveId',
          itemId,
          permissionId,
        })
      ).rejects.toBeInstanceOf(MicrosoftError);
    });

    test('should return when the itemId is invalid and not to throw error', async () => {
      await expect(
        deleteItemPermission({
          token: validToken,
          siteId,
          driveId,
          itemId: 'invalid-itemId',
          permissionId,
        })
      ).resolves.not.toBeInstanceOf(MicrosoftError);

      await expect(
        deleteItemPermission({
          token: validToken,
          siteId,
          driveId,
          itemId: 'invalid-itemId',
          permissionId,
        })
      ).resolves.toStrictEqual(undefined);
    });

    test('should throws when the permissionId is invalid', async () => {
      await expect(
        deleteItemPermission({
          token: validToken,
          siteId,
          driveId,
          itemId,
          permissionId: 'invalid-permission-id',
        })
      ).rejects.toBeInstanceOf(MicrosoftError);
    });
  });
});
