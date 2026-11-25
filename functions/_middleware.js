// Sends www and http requests to the one canonical address (https, no www) with a 301,
// so Google sees a single copy of each page.
export const onRequest = async ({ request, next }) => {
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  if (url.hostname.startsWith('www.') || proto === 'http') {
    url.hostname = url.hostname.replace(/^www\./, '');
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return next();
};
