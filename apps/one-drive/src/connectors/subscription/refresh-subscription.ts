import { addDays } from 'date-fns';
import { env } from '@/env';
import { decrypt } from '@/common/crypto';

export const refreshSubscription = async (encryptToken: string, subscriptionId: string) => {
  const token = await decrypt(encryptToken);

  await fetch(`${env.MICROSOFT_API_URL}/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      expirationDateTime: addDays(new Date(), Number(env.SUBSCRIBE_EXPIRATION_DAYS)).toISOString(),
    }),
  });
};
