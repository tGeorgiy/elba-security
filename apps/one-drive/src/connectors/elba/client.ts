import { Elba } from '@elba-security/sdk';
import { env } from '@/env';

export const getElbaClient = ({
  organisationId,
  region,
}: {
  organisationId: string;
  region: string;
}) => {
  return new Elba({
    organisationId,
    apiKey: env.ELBA_API_KEY,
    baseUrl: env.ELBA_API_BASE_URL,
    region,
  });
};
