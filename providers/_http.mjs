// HTTP transport helpers shared across providers.
// Files prefixed with _ are never loaded as providers by scan.mjs.

import { getFeedCache, setFeedCacheStatus } from '../db.mjs';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; career-ops/1.3)';
const DEFAULT_RETRIES = 3; // up to 3 retries (4 total attempts: 0, 1, 2, 3)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry on: timeout/network (no .status), 429 rate-limit, 5xx server error.
// Do NOT retry on: 4xx (except 429) — a 404 is a dead slug, not transient.
function isRetryable(err) {
  if (err.code === 'BAD_JSON') return false; // anti-bot gateway returns HTML on 200; retrying won't help
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

function withDefaultHeaders(headers) {
  if (headers instanceof Headers) {
    const out = new Headers(headers);
    if (!out.has('user-agent')) out.set('user-agent', DEFAULT_USER_AGENT);
    return out;
  }
  return { 'user-agent': DEFAULT_USER_AGENT, ...(headers || {}) };
}

async function rawFetchWithTimeout(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, method = 'GET', body = null, redirect = 'follow' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      headers: withDefaultHeaders(headers),
      body,
      redirect,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function httpError(res, status = res.status) {
  const responseText = await res.text().catch(() => '');
  const snippet = responseText.replace(/\s+/g, ' ').trim().slice(0, 300);
  const err = new Error(snippet ? `HTTP ${status}: ${snippet}` : `HTTP ${status}`);
  err.status = status;
  err.body = responseText;
  return err;
}

async function fetchWithTimeout(url, opts = {}) {
  const res = await rawFetchWithTimeout(url, opts);
  if (!res.ok) {
    throw await httpError(res);
  }
  return res;
}

function hasHeader(headers, name) {
  const target = name.toLowerCase();
  if (headers instanceof Headers) return headers.has(name);
  return Object.keys(headers || {}).some(k => k.toLowerCase() === target);
}

function setHeader(headers, name, value) {
  if (headers instanceof Headers) {
    headers.set(name, value);
    return;
  }
  headers[name] = value;
}

function withConditionalHeaders(headers, cache) {
  const out = headers instanceof Headers ? new Headers(headers) : { ...(headers || {}) };
  if (cache?.etag && !hasHeader(out, 'If-None-Match')) {
    setHeader(out, 'If-None-Match', cache.etag);
  }
  if (cache?.last_modified && !hasHeader(out, 'If-Modified-Since')) {
    setHeader(out, 'If-Modified-Since', cache.last_modified);
  }
  return out;
}

export async function fetchWithCache(url, opts = {}, cacheKey) {
  const getStatus = (res) => Number.isFinite(res?.status) ? res.status : (res?.ok ? 200 : 500);
  const requestOpts = { ...opts };
  if (cacheKey) {
    requestOpts.headers = withConditionalHeaders(opts.headers, getFeedCache(cacheKey));
  }

  let lastErr;
  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);
      await sleep(backoff);
    }
    try {
      const res = await rawFetchWithTimeout(url, requestOpts);
      const status = getStatus(res);
      if (status === 304) {
        if (cacheKey) setFeedCacheStatus(cacheKey, status);
        return { status: 304, json: async () => null, text: async () => null, headers: res.headers };
      }
      if (!res.ok) {
        if (cacheKey && Number.isFinite(status)) setFeedCacheStatus(cacheKey, status);
        throw await httpError(res, status);
      }
      if (cacheKey ? status === 200 : res.ok) {
        return {
          status: 200,
          json: () => res.json(),
          text: () => res.text(),
          headers: res.headers,
        };
      }
      if (cacheKey && Number.isFinite(status)) setFeedCacheStatus(cacheKey, status);
      throw await httpError(res, status);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) throw err;
    }
  }
  throw lastErr;
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error(`Bad JSON from ${url}: ${text.slice(0, 200).replace(/\s+/g, ' ').trim()}`);
    err.code = 'BAD_JSON';
    err.status = res.status;
    err.cause = e;
    throw err;
  }
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
    fetchWithCache,
  };
}
