// HTTP transport helpers shared across providers.
// Files prefixed with _ are never loaded as providers by scan.mjs.

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; career-ops/1.3)';
const DEFAULT_RETRIES = 3; // up to 3 retries (4 total attempts: 0, 1, 2, 3)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry on: timeout/network (no .status), 429 rate-limit, 5xx server error.
// Do NOT retry on: 4xx (except 429) — a 404 is a dead slug, not transient.
function isRetryable(err) {
  if (!err.status) return true;           // AbortError (timeout) or TypeError (network)
  if (err.status === 429) return true;    // rate-limited
  if (err.status >= 500) return true;     // server error
  return false;                           // 4xx client error — do not retry
}

async function fetchWithRetry(url, opts = {}, maxRetries = DEFAULT_RETRIES) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // exponential backoff + jitter: 500ms, 1500ms, 3500ms (+0-499ms jitter each)
      const backoff = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);
      await sleep(backoff);
    }
    try {
      return await fetchWithTimeout(url, opts);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) throw err; // immediate rethrow for client errors
    }
  }
  throw lastErr;
}

async function fetchWithTimeout(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, method = 'GET', body = null, redirect = 'follow' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'user-agent': DEFAULT_USER_AGENT, ...headers },
      body,
      redirect,
      signal: controller.signal,
    });
    if (!res.ok) {
      const responseText = await res.text().catch(() => '');
      const snippet = responseText.replace(/\s+/g, ' ').trim().slice(0, 300);
      const err = new Error(snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`);
      err.status = res.status;
      err.body = responseText;
      throw err;
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  return await res.json();
}

export async function fetchText(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  return await res.text();
}

export function makeHttpCtx() {
  return {
    transport: 'http',
    fetchJson,
    fetchText,
  };
}
