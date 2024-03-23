import { z } from 'zod';
import { env } from '@/env';
import { MicrosoftError } from '../../common/error';
import type { MicrosoftPaginatedResponse } from '../../common/pagination';
import { getNextSkipTokenFromNextLink } from '../../common/pagination';

// 🚀 ~ getFolderId ~ response: {
//   '@microsoft.graph.downloadUrl': 'https://testcomp633.sharepoint.com/sites/TestShared/_layouts/15/download.aspx?UniqueId=52d354e5-b136-4d6f-991b-88460e081f5a&Translate=false&tempauth=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIwMDAwMDAwMy0wMDAwLTBmZjEtY2UwMC0wMDAwMDAwMDAwMDAvdGVzdGNvbXA2MzMuc2hhcmVwb2ludC5jb21AYjc4MzYyNmMtZDVmNS00MGE1LTk0OTAtOTBhOTQ3ZTQ0ZTYzIiwiaXNzIjoiMDAwMDAwMDMtMDAwMC0wZmYxLWNlMDAtMDAwMDAwMDAwMDAwIiwibmJmIjoiMTcwODg5MjA0OSIsImV4cCI6IjE3MDg4OTU2NDkiLCJlbmRwb2ludHVybCI6InNQRE9OendLcDJTY2FVaG1zeDd1VnBCWkdiN3NWcWNYWTM0T2M4c0dzM1k9IiwiZW5kcG9pbnR1cmxMZW5ndGgiOiIxMzkiLCJpc2xvb3BiYWNrIjoiVHJ1ZSIsImNpZCI6Im9ROUJRbk1BQUlBbHd4em84YXozcUE9PSIsInZlciI6Imhhc2hlZHByb29mdG9rZW4iLCJzaXRlaWQiOiJabVJtTkRSa1pURXROREV6WVMwME1XTmxMVGd3TjJZdE56WTNNRGxqT1Rrd1ptTmsiLCJhcHBfZGlzcGxheW5hbWUiOiJtdWx0aSIsIm5hbWVpZCI6IjdhMDM2NWY5LTAwZWMtNDBiMS05NTVhLWM0ZmMxOGU1YzI1MEBiNzgzNjI2Yy1kNWY1LTQwYTUtOTQ5MC05MGE5NDdlNDRlNjMiLCJyb2xlcyI6ImFsbHNpdGVzLnJlYWQgYWxsc2l0ZXMud3JpdGUgYWxsZmlsZXMud3JpdGUgYWxsZmlsZXMucmVhZCBhbGxwcm9maWxlcy53cml0ZSIsInR0IjoiMSIsImlwYWRkciI6IjQwLjEyNi41My4yNSJ9.IMWPjNdTBVXNHGgREN4UPgw4pAIF0mV-QVhdxs0Aa_4&ApiVersion=2.0',
//   createdDateTime: '2024-02-25T20:12:04Z',
//   eTag: '"{52D354E5-B136-4D6F-991B-88460E081F5A},1"',
//   id: '01FCBFCHPFKTJVENVRN5GZSG4IIYHAQH22',
//   lastModifiedDateTime: '2024-02-25T20:12:04Z',
//   name: 'fortetsyapoltava_13092016.doc',
//   webUrl: 'https://testcomp633.sharepoint.com/sites/TestShared/_layouts/15/Doc.aspx?sourcedoc=%7B52D354E5-B136-4D6F-991B-88460E081F5A%7D&file=fortetsyapoltava_13092016.doc&action=default&mobileredirect=true',
//   cTag: '"c:{52D354E5-B136-4D6F-991B-88460E081F5A},1"',
//   size: 96256,
//   createdBy: {
//     user: {
//       email: 'HeorhiiTonkyi@TestComp633.onmicrosoft.com',
//       id: 'b22da604-53e8-46bc-9fa4-4cad4305bae2',
//       displayName: 'Heorhii Tonkyi'
//     }
//   },
//   lastModifiedBy: {
//     user: {
//       email: 'HeorhiiTonkyi@TestComp633.onmicrosoft.com',
//       id: 'b22da604-53e8-46bc-9fa4-4cad4305bae2',
//       displayName: 'Heorhii Tonkyi'
//     }
//   },
//   parentReference: {
//     driveType: 'documentLibrary',
//     driveId: 'b!4U30_TpBzkGAf3ZwnJkPzQCmcxAco59GoxgWJ7aOi6Wv5oyywfW_QqgcrdZH3rYt',
//     id: '01FCBFCHPH7DEW7M3NOVHIHC2VDH7MJKTM',
//     name: 'SharedFolder',
//     path: '/drives/b!4U30_TpBzkGAf3ZwnJkPzQCmcxAco59GoxgWJ7aOi6Wv5oyywfW_QqgcrdZH3rYt/root:/SharedFolder',
//     siteId: 'fdf44de1-413a-41ce-807f-76709c990fcd'
//   },
//   file: {
//     mimeType: 'application/msword',
//     hashes: { quickXorHash: 'Kk2c+1jBfxCBY5wqA9eb/4uT5BM=' }
//   },
//   fileSystemInfo: {
//     createdDateTime: '2024-02-25T20:12:04Z',
//     lastModifiedDateTime: '2024-02-25T20:12:04Z'
//   },
//   shared: { scope: 'users' }
// }

const driveItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  webUrl: z.string(),
  createdBy: z.object({
    user: z.object({
      email: z.string().optional(),
      id: z.string().optional(),
      displayName: z.string(),
    }),
  }),
  folder: z
    .object({
      childCount: z.number(),
    })
    .optional(),
});

export type MicrosoftDriveItem = z.infer<typeof driveItemSchema>;

export type GetItemsParams = {
  token: string;
  siteId: string;
  driveId: string;
  folderId: string | null;
  skipToken: string | null;
};

export const getItems = async ({ token, siteId, driveId, folderId, skipToken }: GetItemsParams) => {
  const urlEnding = folderId ? `items/${folderId}/children` : 'root/children';

  const url = new URL(`${env.MICROSOFT_API_URL}/sites/${siteId}/drives/${driveId}/${urlEnding}`);
  url.searchParams.append('$top', String(env.MICROSOFT_DATA_PROTECTION_ITEM_SYNC_SIZE));
  url.searchParams.append('$select', 'id,folder,name,webUrl,createdBy');

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

  const data = (await response.json()) as MicrosoftPaginatedResponse<MicrosoftDriveItem>;

  const nextSkipToken = getNextSkipTokenFromNextLink(data['@odata.nextLink']);

  return { items: data.value, nextSkipToken };
};
