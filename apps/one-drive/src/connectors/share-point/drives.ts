import { z } from 'zod';
import { env } from '@/env';
import { MicrosoftError } from '../../common/error';
import type { MicrosoftPaginatedResponse } from '../../common/pagination';
import { getNextSkipTokenFromNextLink } from '../../common/pagination';

// 🚀 ~ getDriveId ~ response: {
//   createdDateTime: '2024-02-18T00:25:20Z',
//   description: '',
//   id: 'b!4U30_TpBzkGAf3ZwnJkPzQCmcxAco59GoxgWJ7aOi6Wv5oyywfW_QqgcrdZH3rYt',
//   lastModifiedDateTime: '2024-02-21T16:13:53Z',
//   name: 'Documents',
//   webUrl: 'https://testcomp633.sharepoint.com/sites/TestShared/Shared%20Documents',
//   driveType: 'documentLibrary',
//   createdBy: { user: { displayName: 'System Account' } },
//   lastModifiedBy: {
//     user: {
//       email: 'HeorhiiTonkyi@TestComp633.onmicrosoft.com',
//       id: 'b22da604-53e8-46bc-9fa4-4cad4305bae2',
//       displayName: 'Heorhii Tonkyi'
//     }
//   },
//   owner: {
//     group: {
//       email: 'TestShared@TestComp633.onmicrosoft.com',
//       id: 'b3a6fd07-a9e1-4edc-8ce6-72d79cd7034d',
//       displayName: 'TestShared Owners'
//     }
//   },
//   quota: {
//     deleted: 0,
//     remaining: 27487783753686,
//     state: 'normal',
//     total: 27487790694400,
//     used: 6940714
//   }
// }

const driveSchema = z.object({
  id: z.string(),
});

export type MicrosoftDrive = z.infer<typeof driveSchema>;

export type GetDrivesParams = {
  token: string;
  siteId: string;
  skipToken: string | null;
};

export const getDrives = async ({ token, siteId, skipToken }: GetDrivesParams) => {
  const url = new URL(`${env.MICROSOFT_API_URL}/sites/${siteId}/drives`);
  url.searchParams.append('$top', String(env.MICROSOFT_DATA_PROTECTION_SYNC_CHUNK_SIZE));
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
    throw new MicrosoftError('Could not retrieve drives', { response });
  }

  const data = (await response.json()) as MicrosoftPaginatedResponse<MicrosoftDrive>;

  const nextSkipToken = getNextSkipTokenFromNextLink(data['@odata.nextLink']);

  return { drives: data.value, nextSkipToken };
};
