import { http } from 'msw';
import { describe, expect, test, beforeEach } from 'vitest';
import { env } from '@/env';
import { encrypt } from '@/common/crypto';
import { server } from '../../../vitest/setup-msw-handlers';
import { removeSubscription } from './remove-subscription';

const validToken = 'token';
const encryptedToken = await encrypt(validToken);
const invalidToken = 'invalid-token';

const subscriptionId = 'subscription-id';

describe('subscription connector', () => {
  describe('removeSubscription', () => {
    beforeEach(() => {
      server.use(
        http.delete(
          `${env.MICROSOFT_API_URL}/subscriptions/:subscriptionId`,
          ({ request, params }) => {
            if (request.headers.get('Authorization') !== `Bearer ${validToken}`) {
              return new Response(undefined, { status: 401 });
            }

            if (params.subscriptionId !== subscriptionId) {
              return new Response(undefined, { status: 400 });
            }

            return undefined;
          }
        )
      );
    });

    test('should refresh the subscription when the token is valid', async () => {
      await expect(removeSubscription(encryptedToken, subscriptionId)).resolves.toBeUndefined();
    });

    test('should throw when the token is invalid', async () => {
      await expect(removeSubscription(invalidToken, subscriptionId)).rejects.toThrowError();
    });
  });
});
