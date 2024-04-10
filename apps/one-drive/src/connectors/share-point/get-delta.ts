import { z } from 'zod';
import { MicrosoftError } from '@/common/error';
import { getNextSkipTokenFromNextLink, type MicrosoftPaginatedResponse } from '@/common/pagination';
import { getDeltaTokenFromDeltaLink } from '@/common/delta-link';

const siteSchema = z.object({
  id: z.string(),
});

type GetDelta = {
  token: string;
  siteId: string;
  driveId: string;
  isFirstSync: boolean | null;
  skipToken: string | null;
  deltaToken: string | null;
};

export type MicrosoftSite = z.infer<typeof siteSchema>;

export const getDelta = async ({
  token,
  siteId,
  driveId,
  isFirstSync,
  skipToken,
  deltaToken,
}: GetDelta) => {
  // console.log('GET DELTAAAAAA');

  const url = new URL(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root/delta`
  );

  if (isFirstSync) {
    url.searchParams.append('$select', 'id');
    url.searchParams.append('$top', String(1000));
  }
  if (deltaToken) {
    url.searchParams.append('token', deltaToken);
  }
  if (skipToken) {
    url.searchParams.append('$skiptoken', skipToken);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new MicrosoftError('Could not retrieve delta', { response });
  }

  const data = (await response.json()) as MicrosoftPaginatedResponse<MicrosoftSite>;

  const nextSkipToken = getNextSkipTokenFromNextLink(data['@odata.nextLink']);
  const newDeltaToken = getDeltaTokenFromDeltaLink(data['@odata.deltaLink']);

  return { delta: data.value, nextSkipToken, newDeltaToken };
};
