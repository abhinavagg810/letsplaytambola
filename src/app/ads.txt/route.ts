import { ADSENSE_CLIENT, ADS_ON } from '@/lib/ads';

/** /ads.txt — tells advertisers that Google is allowed to sell ads on this site. 404 while ads are off. */
export function GET(): Response {
  if (!ADS_ON) return new Response('Not found', { status: 404 });
  const pub = ADSENSE_CLIENT.replace(/^ca-/, '');
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
