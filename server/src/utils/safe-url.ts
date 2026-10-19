/**
 * URL guard for outbound HTTP (webhook-out, integrations). Task 10 ships the
 * internal stub: only http(s) absolute URLs pass. Task 16 replaces this with
 * the full SSRF guard (blocks loopback, private ranges, cloud metadata).
 */
export function assertSafeUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('UNSAFE_URL: invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`UNSAFE_URL: protocol "${url.protocol}" is not allowed`);
  }
  return url;
}
