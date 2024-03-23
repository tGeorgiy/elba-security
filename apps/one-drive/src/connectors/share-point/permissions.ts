import { logger } from '@elba-security/logger';
import { z } from 'zod';
import { env } from '@/env';
import { MicrosoftError } from '../../common/error';
import type { MicrosoftPaginatedResponse } from '../../common/pagination';
import { getNextSkipTokenFromNextLink } from '../../common/pagination';

// 🚀 ~ filePermission: {
//   id: 'VGVzdFNoYXJlZCBNZW1iZXJz',
//   roles: [ 'write' ],
//   shareId: 'VGVzdFNoYXJlZCBNZW1iZXJz',
//   hasPassword: false,
//   grantedToV2: {
//     siteGroup: {
//       displayName: 'TestShared Members',
//       id: '5',
//       loginName: 'TestShared Members'
//     },
//     user: {
//       '@odata.type': '#microsoft.graph.sharePointIdentity',
//       displayName: 'theworldismine771',
//       email: 'theworldismine771@gmail.com',
//       id: '0022a2e1-cd1b-457e-8103-d7512480771b'
//     },
//     siteUser: {
//       displayName: 'theworldismine771',
//       email: 'theworldismine771@gmail.com',
//       id: '13',
//       loginName: 'i:0#.f|membership|theworldismine771_gmail.com#ext#@testcomp633.onmicrosoft.com'
//     },
//     group: {
//       '@odata.type': '#microsoft.graph.sharePointIdentity',
//       displayName: 'TestShared Owners',
//       email: 'TestShared@TestComp633.onmicrosoft.com',
//       id: 'b3a6fd07-a9e1-4edc-8ce6-72d79cd7034d'
//     },
//   },
//   grantedTo: {
//     user: {
//       displayName: 'theworldismine771',
//       email: 'theworldismine771@gmail.com',
//       id: '0022a2e1-cd1b-457e-8103-d7512480771b'
//     }
//   },
//   grantedToIdentitiesV2: [
//     {
//       user: {
//         '@odata.type': '#microsoft.graph.sharePointIdentity',
//         displayName: 'Heorhii Tonkyi',
//         email: 'HeorhiiTonkyi@TestComp633.onmicrosoft.com',
//         id: 'b22da604-53e8-46bc-9fa4-4cad4305bae2'
//       },
//       siteUser: {
//         displayName: 'Heorhii Tonkyi',
//         email: 'HeorhiiTonkyi@TestComp633.onmicrosoft.com',
//         id: '9',
//         loginName: 'i:0#.f|membership|heorhiitonkyi@testcomp633.onmicrosoft.com'
//       }
//     }
//   ],
//   grantedToIdentities: [
//      {
//        user: {
//          displayName: 'Heorhii Tonkyi',
//          email: 'HeorhiiTonkyi@TestComp633.onmicrosoft.com',
//          id: 'b22da604-53e8-46bc-9fa4-4cad4305bae2'
//        }
//      }
//   ],
//   link: {
//     scope: 'organization',
//     type: 'view',
//     webUrl: 'https://testcomp633.sharepoint.com/:i:/s/TestShared/EQofsf_R79ZIuwbKDNGJoj4BnibX5BYZPxMzN-ckgZKnhA',
//     preventsDownload: false
//   }
// }

const grantedUserSchema = z.object({
  displayName: z.string(),
  id: z.string(),
  email: z.string(),
});

const grantedToV2Schema = z.object({
  user: grantedUserSchema,
});

const grantedToIdentitiesV2Schema = z
  .array(
    z.object({
      user: grantedUserSchema.optional(),
    })
  )
  .transform((val, ctx) => {
    const filtered = val.filter((el) => Object.keys(el).length);

    if (!filtered.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No user permissions in array',
      });

      return z.NEVER;
    }

    return filtered;
  });

const basePSchema = z.object({
  id: z.string(),
  roles: z.array(z.string()),
  link: z
    .object({
      scope: z.string().optional(),
    })
    .optional(),
  grantedToV2: grantedToV2Schema.optional(),
  grantedToIdentitiesV2: grantedToIdentitiesV2Schema.optional(),
});

export const validateAndParsePermission = (
  data: z.infer<typeof basePSchema>
):
  | (Omit<z.infer<typeof basePSchema>, 'grantedToV2'> & {
      grantedToV2: z.infer<typeof grantedToV2Schema>;
    })
  | (Omit<z.infer<typeof basePSchema>, 'grantedToIdentitiesV2'> & {
      grantedToIdentitiesV2: z.infer<typeof grantedToIdentitiesV2Schema>;
    })
  | null => {
  const result = basePSchema.safeParse(data);

  if (result.success) {
    const grantedToV2ParseResult = grantedToV2Schema.safeParse(result.data.grantedToV2);
    const grantedToIdentitiesV2ParseResult = grantedToIdentitiesV2Schema.safeParse(
      result.data.grantedToIdentitiesV2
    );
    if (grantedToV2ParseResult.success) {
      return {
        ...result.data,
        grantedToV2: grantedToV2ParseResult.data,
      };
    } else if (grantedToIdentitiesV2ParseResult.success) {
      return {
        ...result.data,
        grantedToIdentitiesV2: grantedToIdentitiesV2ParseResult.data,
      };
    }
    logger.warn('Retrieved permission is invalid, or empty permissions array', result);
  }
  return null;
};

export type MicrosoftDriveItemPermissions = z.infer<typeof basePSchema>;

export type DriveUserSchema = z.infer<typeof grantedUserSchema>;

export type GetPermissionsParams = {
  token: string;
  siteId: string;
  driveId: string;
  itemId: string;
  skipToken: string | null;
};

export const getItemPermissions = async ({
  token,
  siteId,
  driveId,
  itemId,
  skipToken,
}: GetPermissionsParams) => {
  const url = new URL(
    `${env.MICROSOFT_API_URL}/sites/${siteId}/drives/${driveId}/items/${itemId}/permissions`
  );

  url.searchParams.append('$top', String(env.MICROSOFT_DATA_PROTECTION_SYNC_CHUNK_SIZE));

  if (skipToken) {
    url.searchParams.append('$skiptoken', skipToken);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new MicrosoftError('Could not retrieve permissions', { response });
  }

  const data = (await response.json()) as MicrosoftPaginatedResponse<MicrosoftDriveItemPermissions>;

  const nextSkipToken = getNextSkipTokenFromNextLink(data['@odata.nextLink']);
  const permissions = data.value;

  if (nextSkipToken) {
    const nextData = await getItemPermissions({
      token,
      siteId,
      driveId,
      itemId,
      skipToken: nextSkipToken,
    });

    permissions.push(...nextData.permissions);
  }

  const parsedPermissions = permissions.reduce<MicrosoftDriveItemPermissions[]>((acc, el) => {
    const parsedPermission = validateAndParsePermission(el);
    if (parsedPermission !== null) acc.push(parsedPermission);

    return acc;
  }, []);

  return { permissions: parsedPermissions, nextSkipToken };
};
