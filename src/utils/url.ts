/**
 * Resolve the port to use for a given URL.
 *
 * Defaults to 443 for https and 80 for http when no explicit port is set.
 */
export function getPortFromUrl(url: URL): number {
  return Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
}
