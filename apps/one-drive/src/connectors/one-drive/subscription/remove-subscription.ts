import { env } from '@/common/env';
import { decrypt } from '@/common/crypto';

export const removeSubscription = async (encryptToken: string, subscriptionId: string) => {
  const token = await decrypt(encryptToken);

  await fetch(`${env.MICROSOFT_API_URL}/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
};
