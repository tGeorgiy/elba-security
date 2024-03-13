import { z } from 'zod';
import { env } from '@/env';
import { MicrosoftError } from '../../common/error';
import {
  getNextSkipTokenFromNextLink,
  type MicrosoftPaginatedResponse,
} from '../../common/pagination';

// Responce on /sites?search=*
// {
//   createdDateTime: '2024-02-19T07:41:40Z',
//   id: 'testcomp633.sharepoint.com,01a63770-aff9-42b8-831d-46b05ff02b5c,166a5d4b-4220-4844-8979-a76ad03d4337',
//   lastModifiedDateTime: '2024-02-18T00:24:14Z',
//   name: 'testcomp633.sharepoint.com',
//   webUrl: 'https://testcomp633.sharepoint.com',
//   displayName: 'Communication site',
//   root: {},
//   siteCollection: [Object]
// }

// Responce on /sites
// const siteSchema = z.object({
//   id: z.string(),
//   name: z.string().optional(),
//   webUrl: z.string().optional(),
//   displayName: z.string().optional(),
//   isPersonalSite: z.boolean(),
//   siteCollection: z.object({ hostname: z.string() }).optional(),
//   root: z.object({}).optional(),
// });

const siteSchema = z.object({
  id: z.string(),
  createdDateTime: z.string().optional(),
  lastModifiedDateTime: z.string().optional(),
  name: z.string().optional(),
  webUrl: z.string().optional(),
  displayName: z.string().optional(),
  root: z.object({}).optional(),
  siteCollection: z.object({ hostname: z.string() }).optional(),
});

export type MicrosoftSite = z.infer<typeof siteSchema>;

export type GetSitesParams = {
  token: string;
  skipToken: string | null;
};

export const getSites = async ({ token, skipToken }: GetSitesParams) => {
  const url = new URL(`${env.MICROSOFT_API_URL}/sites`);
  url.searchParams.append('search', '*');
  url.searchParams.append('$top', String(env.SITES_SYNC_BATCH_SIZE));
  url.searchParams.append('$select', 'id');

  if (skipToken) {
    url.searchParams.append('$skiptoken', skipToken);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new MicrosoftError('Could not retrieve users', { response });
  }

  const data = (await response.json()) as MicrosoftPaginatedResponse<MicrosoftSite>;

  const nextSkipToken = getNextSkipTokenFromNextLink(data['@odata.nextLink']);

  return { sites: data.value, nextSkipToken };
};
