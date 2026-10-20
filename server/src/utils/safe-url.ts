import { isIP } from 'net';

/**
 * SSRF-safe URL guard for outbound HTTP (webhook-out, integrations).
 * Blocks loopback, private, link-local, and cloud metadata IP addresses.
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

  // Check if it's an IP address (not a hostname)
  const host = url.hostname;
  if (isIP(host)) {
    // Check for loopback addresses
    if (
      host === '127.0.0.1' ||
      host === '::1' ||
      host === 'localhost'
    ) {
      throw new Error('UNSAFE_URL: loopback addresses are not allowed');
    }

    // Check for private IP ranges (RFC 1918)
    if (
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.16.') ||
      host.startsWith('172.17.') ||
      host.startsWith('172.18.') ||
      host.startsWith('172.19.') ||
      host.startsWith('172.20.') ||
      host.startsWith('172.21.') ||
      host.startsWith('172.22.') ||
      host.startsWith('172.23.') ||
      host.startsWith('172.24.') ||
      host.startsWith('172.25.') ||
      host.startsWith('172.26.') ||
      host.startsWith('172.27.') ||
      host.startsWith('172.28.') ||
      host.startsWith('172.29.') ||
      host.startsWith('172.30.') ||
      host.startsWith('172.31.')
    ) {
      throw new Error('UNSAFE_URL: private IP addresses are not allowed');
    }

    // Check for link-local addresses (RFC 3927)
    if (host.startsWith('169.254.')) {
      throw new Error('UNSAFE_URL: link-local addresses are not allowed');
    }

    // Check for cloud metadata addresses
    if (
      host === '169.254.169.254' || // AWS, Azure, GCP, etc.
      host === '100.100.100.100' || // GCP
      host === '169.254.169.250' || // EC2 metadata (v2)
      host === 'fd00:ec2::254' || // AWS IPv6 metadata
      host === 'fe80::' || // Link-local IPv6 (cloud providers may use)
      host.startsWith('169.254.169.') // AWS metadata range
    ) {
      throw new Error('UNSAFE_URL: cloud metadata addresses are not allowed');
    }

    // Additional checks for reserved IP ranges
    if (
      host === '0.0.0.0' || // This host
      host === '255.255.255.255' // Limited broadcast
    ) {
      throw new Error('UNSAFE_URL: reserved IP addresses are not allowed');
    }
  }

  return url;
}