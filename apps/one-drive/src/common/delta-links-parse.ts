import { z } from 'zod';

const tokenFromDeltaLinksSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return null;

  const deltaLinkUrl = new URL(value);
  return deltaLinkUrl.searchParams.get('token');
}, z.coerce.string().nullable());

// eslint-disable-next-line @typescript-eslint/unbound-method -- convenience
export const getTokenFromDeltaLinks = tokenFromDeltaLinksSchema.parse;
