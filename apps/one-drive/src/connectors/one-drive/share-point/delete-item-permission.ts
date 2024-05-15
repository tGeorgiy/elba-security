import { env } from '@/common/env';
import { MicrosoftError } from '@/common/error';

type DeleteItemPermissionParams = {
  itemId: string;
  token: string;
  siteId: string;
  driveId: string;
  permissionId: string;
};

export const deleteItemPermission = async ({
  token,
  siteId,
  driveId,
  itemId,
  permissionId,
}: DeleteItemPermissionParams): Promise<void> => {
  const url = new URL(
    `${env.MICROSOFT_API_URL}/sites/${siteId}/drives/${driveId}/items/${itemId}/permissions/${permissionId}`
  );

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new MicrosoftError('Could not delete item permission', { response });
  }
};
