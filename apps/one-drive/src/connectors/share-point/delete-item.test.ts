import { http } from 'msw';
import { describe, expect, test, beforeEach } from 'vitest';
import { env } from '@/env';
import { server } from '../../../vitest/setup-msw-handlers';
import { MicrosoftError } from '../../common/error';
import { deleteItem } from './delete-item';

const validToken = 'token-1234';

const siteId = 'some-site-id';
const driveId = 'some-drive-id';
const itemId = 'some-item-id';

describe('delete-item connector', () => {
  describe('deleteItem', () => {
    // mock token API endpoint using msw
    beforeEach(() => {
      server.use(
        http.delete(
          `${env.MICROSOFT_API_URL}/sites/:siteId/drives/:driveId/items/:itemId`,
          ({ request, params }) => {
            if (
              request.headers.get('Authorization') !== `Bearer ${validToken}` ||
              params.siteId !== siteId ||
              params.driveId !== driveId
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
      expect(deleteItem({ token: validToken, siteId, driveId, itemId })).resolves;
    });

    test('should throws when the token is invalid', async () => {
      await expect(
        deleteItem({ token: 'invalid-token', siteId, driveId, itemId })
      ).rejects.toBeInstanceOf(MicrosoftError);
    });

    test('should throws when the siteId is invalid', async () => {
      await expect(
        deleteItem({
          token: validToken,
          siteId: 'invalid-siteId',
          driveId,
          itemId,
        })
      ).rejects.toBeInstanceOf(MicrosoftError);
    });

    test('should throws when the driveId is invalid', async () => {
      await expect(
        deleteItem({
          token: validToken,
          siteId,
          driveId: 'invalid-driveId',
          itemId,
        })
      ).rejects.toBeInstanceOf(MicrosoftError);
    });

    test('should return when the itemId is invalid and not to throw error', async () => {
      await expect(
        deleteItem({
          token: validToken,
          siteId,
          driveId,
          itemId: 'invalid-itemId',
        })
      ).resolves.not.toBeInstanceOf(MicrosoftError);

      await expect(
        deleteItem({
          token: validToken,
          siteId,
          driveId,
          itemId: 'invalid-itemId',
        })
      ).resolves.toStrictEqual(undefined);
    });
  });
});
