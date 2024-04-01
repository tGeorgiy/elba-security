import { env } from '@/env';
import { MicrosoftError } from '@/common/error';

export type DeleteItemParams = {
  itemId: string;
  token: string;
  siteId: string;
  driveId: string;
};

export const deleteItem = async ({
  token,
  siteId,
  driveId,
  itemId,
}: DeleteItemParams): Promise<void> => {
  const url = new URL(`${env.MICROSOFT_API_URL}/sites/${siteId}/drives/${driveId}/items/${itemId}`);

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) return;

    throw new MicrosoftError('Could not delete item', { response });
  }
};
