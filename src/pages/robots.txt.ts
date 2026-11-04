import { PREVIEW, SITE_URL } from '../lib/site';
export const GET = () =>
  new Response(PREVIEW ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap-index.xml\n`, {
    headers: { 'Content-Type': 'text/plain' },
  });
