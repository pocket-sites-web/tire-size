// cartiresizes.com, bought by Jon on Cloudflare 2026-11-04. Change SITE_URL and SITE_NAME, then set PREVIEW to false to let Google in.
export const SITE_URL = 'https://cartiresizes.com';
export const SITE_NAME = 'Car Tire Sizes';
// While true: every page is noindex, robots.txt blocks crawlers, and a banner says the data may be sample data.
export const PREVIEW = true;

export const AMAZON_TAG = 'booforgen-20';
export const amazonUrl = (q: string) =>
  `https://www.amazon.com/s?k=${encodeURIComponent(q)}${AMAZON_TAG ? `&tag=${AMAZON_TAG}` : ''}`;
// SimpleTire affiliate deep links go here once Jon is approved (5% per sale). Until then, plain size search.
export const SIMPLETIRE_AFFILIATE = '';
