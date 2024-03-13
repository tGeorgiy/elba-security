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
  createdDateTime: z.string().optional(),
  lastModifiedDateTime: z.string().optional(),
  name: z.string().optional(),
  webUrl: z.string().optional(),
  description: z.string().optional(),
  driveType: z.string().optional(),
  createdBy: z
    .object({
      user: z.object({
        user: z.object({
          email: z.string().optional(),
          id: z.string().optional(),
          displayName: z.string(),
        }),
      }),
    })
    .optional(),
  lastModifiedBy: z
    .object({
      user: z.object({
        email: z.string(),
        id: z.string(),
        displayName: z.string(),
      }),
    })
    .optional(),
  owner: z
    .object({
      group: z.object({
        email: z.string(),
        id: z.string(),
        displayName: z.string(),
      }),
    })
    .optional(),
  quota: z
    .object({
      deleted: z.number(),
      remaining: z.number(),
      state: z.string(),
      total: z.number(),
      used: z.number(),
    })
    .optional(),
});

export type MicrosoftDrive = z.infer<typeof driveSchema>;

export type GetDrivesParams = {
  token: string;
  siteId: string;
  skipToken: string | null;
};

export const getDrives = async ({ token, siteId, skipToken }: GetDrivesParams) => {
  const url = new URL(`${env.MICROSOFT_API_URL}/sites/${siteId}/drives`);
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
    throw new MicrosoftError('Could not retrieve drives', { response });
  }

  const data = (await response.json()) as MicrosoftPaginatedResponse<MicrosoftDrive>;

  const nextSkipToken = getNextSkipTokenFromNextLink(data['@odata.nextLink']);

  return { drives: data.value, nextSkipToken };
};
