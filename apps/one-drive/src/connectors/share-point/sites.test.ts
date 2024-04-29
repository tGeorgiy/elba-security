import { http } from 'msw';
import { describe, expect, test, beforeEach } from 'vitest';
import { server } from '@elba-security/test-utils';
import { env } from '@/env';
import { MicrosoftError } from '@/common/error';
import type { MicrosoftSite } from './sites';
import { getSites } from './sites';

const validToken = 'token-1234';
const startSkipToken = 'start-skip-token';
const endSkipToken = 'end-skip-token';
const nextSkipToken = 'next-skip-token';

const sites: MicrosoftSite[] = Array.from({ length: env.SITES_SYNC_BATCH_SIZE }, (_, i) => ({
  id: `site-id-${i}`,
}));

describe('sites connector', () => {
  describe('getSites', () => {
    // mock token API endpoint using msw
    beforeEach(() => {
      server.use(
        http.get(`${env.MICROSOFT_API_URL}/sites`, ({ request }) => {
          if (request.headers.get('Authorization') !== `Bearer ${validToken}`) {
            return new Response(undefined, { status: 401 });
          }
          const url = new URL(request.url);
          const select = url.searchParams.get('$select');
          const top = url.searchParams.get('$top');
          const skipToken = url.searchParams.get('$skiptoken');

          const selectedKeys = select?.split(',') || ([] as unknown as (keyof MicrosoftSite)[]);

          const formatedSites = sites.map((site) =>
            selectedKeys.reduce<Partial<MicrosoftSite>>((acc, key: keyof MicrosoftSite) => {
              acc[key] = site[key];
              return acc;
            }, {})
          );

          const nextPageUrl = new URL(url);
          nextPageUrl.searchParams.set('$skiptoken', nextSkipToken);

          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- convenience
          return Response.json({
            '@odata.nextLink':
              skipToken === endSkipToken ? null : decodeURIComponent(nextPageUrl.toString()),
            value: formatedSites.slice(0, top ? Number(top) : 0),
          });
        })
      );
    });

    test('should return sites and nextSkipToken when the token is valid and their is another page', async () => {
      await expect(
        getSites({ token: validToken, skipToken: startSkipToken })
      ).resolves.toStrictEqual({
        sites,
        nextSkipToken,
      });
    });

    test('should return sites and no nextSkipToken when the token is valid and their is no other page', async () => {
      await expect(getSites({ token: validToken, skipToken: endSkipToken })).resolves.toStrictEqual(
        {
          sites,
          nextSkipToken: null,
        }
      );
    });

    test('should throws when the token is invalid', async () => {
      await expect(
        getSites({ token: 'invalid-token', skipToken: endSkipToken })
      ).rejects.toBeInstanceOf(MicrosoftError);
    });
  });
});
