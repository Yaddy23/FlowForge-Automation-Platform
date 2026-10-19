import { registerAction, type ActionHandler } from './registry';
import { assertSafeUrl } from '../utils/safe-url';

/**
 * action.webhook — outbound HTTP call. The URL passes the safe-URL guard
 * (http(s) only in Task 10; full SSRF blocklist in Task 16). The body is
 * JSON-serialized; the response body is intentionally not echoed into the
 * output beyond size-capped text so huge payloads can't bloat node runs.
 */
const webhookOutAction: ActionHandler = async (config) => {
  const url = assertSafeUrl(String(config.url ?? ''));
  const method = String(config.method ?? 'POST').toUpperCase();
  const headers = (config.headers ?? {}) as Record<string, string>;

  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (config.body !== undefined && method !== 'GET') {
    init.body = typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
  }

  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const text = await res.text().catch(() => '');
  return {
    output: {
      status: res.status,
      ok: res.ok,
      body: text.length > 2048 ? `${text.slice(0, 2048)}…` : text,
    },
  };
};

export function registerWebhookOutAction(): void {
  registerAction('action.webhook', webhookOutAction);
}
