import { MicrosoftError } from '@/common/error';
import type { MicrosoftPaginatedResponse } from '@/common/pagination';
import { getTokenFromDeltaLinks } from '@/common/delta-links-parse';
import { env } from '@/env';
import type { MicrosoftDriveItem } from '../share-point/items';

type GetDelta = {
  token: string;
  siteId: string;
  driveId: string;
  isFirstSync: boolean | null;
  skipToken: string | null;
  deltaToken: string | null;
};

export type Delta = {
  deleted?: { state: string } | null;
} & MicrosoftDriveItem;

export const getDelta = async ({
  token,
  siteId,
  driveId,
  isFirstSync,
  skipToken,
  deltaToken,
}: GetDelta) => {
  const url = new URL(`${env.MICROSOFT_API_URL}/sites/${siteId}/drives/${driveId}/root/delta`);

  if (isFirstSync) {
    url.searchParams.append('$select', 'id');
    url.searchParams.append('$top', String(1000));
  } else {
    url.searchParams.append('$top', String(env.MICROSOFT_DATA_PROTECTION_SYNC_CHUNK_SIZE));
  }
  if (skipToken) {
    url.searchParams.append('token', skipToken);
  }
  if (deltaToken) {
    url.searchParams.append('token', deltaToken);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new MicrosoftError('Could not retrieve delta', { response });
  }

  const data = (await response.json()) as MicrosoftPaginatedResponse<Delta>;

  const nextSkipToken = getTokenFromDeltaLinks(data['@odata.nextLink']);
  const newDeltaToken = getTokenFromDeltaLinks(data['@odata.deltaLink']);

  return { delta: data.value, nextSkipToken, newDeltaToken };
};
