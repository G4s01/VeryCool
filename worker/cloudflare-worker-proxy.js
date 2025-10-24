/**
 * Cloudflare Worker proxy for VeryCool
 *
 * Behavior:
 * - Handles CORS preflight (OPTIONS) and returns appropriate Access-Control-Allow-* headers.
 * - Forwards other requests to a configured TARGET_URL (recommended), or to an encoded target
 *   passed as query parameter if WORKER_ALLOW_ANY_TARGET=true (not recommended for public use).
 * - Copies response body and headers back to the client, adding CORS headers.
 * - Use worker secrets / environment variables for sensitive values (e.g. tokens).
 *
 * Environment variables (set via wrangler.toml [vars] or Wrangler secrets):
 * - TARGET_URL            (string)  Optional. If set, requests are forwarded to this URL.
 * - WORKER_ALLOW_ANY_TARGET (string) "true" or "false". If true, allow ?target=encodedUrl.
 * - ALLOWED_ORIGINS       (string) comma-separated origins allowed, or "*" for all.
 * - UPSTREAM_AUTH_HEADER  (string) optional, name of a header to inject upstream (e.g. Authorization)
 *   If you want to set a secret token, use `wrangler secret put UPSTREAM_AUTH_TOKEN`, and set
 *   UPSTREAM_AUTH_HEADER to the header name you want (e.g. "Authorization").
 *
 * Usage model:
 * - Deploy the worker and call it from your site:
 *   fetch("https://<your-worker>.workers.dev/", { method: 'POST', body: JSON.stringify(...), headers: {...} })
 *
 * Security note:
 * - Prefer configuring a fixed TARGET_URL and not allowing arbitrary targets.
 * - Restrict ALLOWED_ORIGINS to your domain in production (do not use "*" in prod).
 * - Store sensitive tokens using Wrangler secrets and inject them as headers.
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event));
});

function parseAllowedOrigins(envValue) {
  if (!envValue) return null;
  if (envValue.trim() === '*') return ['*'];
  return envValue.split(',').map(s => s.trim()).filter(Boolean);
}

function originAllowed(origin, allowedOrigins) {
  if (!origin) return false; // no origin header -> not a browser request (or fetch from server)
  if (!allowedOrigins) return true; // no restriction configured -> allow
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
}

function copyHeadersExcept(srcHeaders) {
  const h = {};
  for (const [k, v] of srcHeaders.entries()) {
    const key = k.toLowerCase();
    // remove hop-by-hop headers and other request-specific ones
    if (['connection','keep-alive','proxy-authorization','proxy-authenticate','transfer-encoding','upgrade','host','origin'].includes(key)) continue;
    h[k] = v;
  }
  return h;
}

async function handleRequest(request) {
  const env = {
    TARGET_URL: typeof TARGET_URL !== 'undefined' ? TARGET_URL : null,
    WORKER_ALLOW_ANY_TARGET: typeof WORKER_ALLOW_ANY_TARGET !== 'undefined' ? WORKER_ALLOW_ANY_TARGET : 'false',
    ALLOWED_ORIGINS: typeof ALLOWED_ORIGINS !== 'undefined' ? ALLOWED_ORIGINS : null,
    UPSTREAM_AUTH_HEADER: typeof UPSTREAM_AUTH_HEADER !== 'undefined' ? UPSTREAM_AUTH_HEADER : null,
    // secret token available via secret name UPSTREAM_AUTH_TOKEN (set with wrangler secret put)
  };

  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  const origin = request.headers.get('Origin') || request.headers.get('origin');

  // CORS preflight handling
  if (request.method === 'OPTIONS') {
    // Allow the Origin only if permitted
    if (!originAllowed(origin, allowedOrigins)) {
      return new Response('Origin not allowed', { status: 403 });
    }

    const acrh = request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization';
    const headers = {
      'Access-Control-Allow-Origin': allowedOrigins && allowedOrigins.includes('*') ? '*' : (origin || '*'),
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': acrh,
      'Access-Control-Max-Age': '86400'
    };
    return new Response(null, { status: 204, headers });
  }

  // Validate origin for non-OPTIONS requests
  if (!originAllowed(origin, allowedOrigins)) {
    return new Response('Origin not allowed', { status: 403 });
  }

  // Determine upstream target
  let upstreamUrl = null;
  const reqUrl = new URL(request.url);

  if (env.TARGET_URL) {
    // fixed configured target preferred
    upstreamUrl = env.TARGET_URL;
  } else if (env.WORKER_ALLOW_ANY_TARGET && env.WORKER_ALLOW_ANY_TARGET.toLowerCase() === 'true') {
    // allow encoded 'target' query parameter, e.g. /?target=https%3A%2F%2Fapi.example.com%2Fpath
    const encoded = reqUrl.searchParams.get('target');
    if (encoded) {
      try {
        upstreamUrl = decodeURIComponent(encoded);
      } catch (e) {
        return new Response('Invalid target', { status: 400 });
      }
    }
  }

  if (!upstreamUrl) {
    return new Response('No upstream target configured', { status: 500 });
  }

  // Prepare headers for upstream
  const upstreamHeaders = new Headers(copyHeadersExcept(request.headers));
  // Force Accept
  upstreamHeaders.set('Accept', 'application/json, text/plain, */*');

  // Optionally inject a secret header (set secret with `wrangler secret put UPSTREAM_AUTH_TOKEN`)
  if (env.UPSTREAM_AUTH_HEADER) {
    try {
      // UPSTREAM_AUTH_TOKEN should be configured as a worker secret; in Wrangler it's exposed as a binding
      // when using `wrangler secret put UPSTREAM_AUTH_TOKEN`. We reference it here as global var UPSTREAM_AUTH_TOKEN.
      if (typeof UPSTREAM_AUTH_TOKEN !== 'undefined' && UPSTREAM_AUTH_TOKEN) {
        upstreamHeaders.set(env.UPSTREAM_AUTH_HEADER, UPSTREAM_AUTH_TOKEN);
      }
    } catch (e) {
      // ignore if secret not set
    }
  }

  // Forward the request
  let fetchOptions = {
    method: request.method,
    headers: upstreamHeaders,
    redirect: 'follow'
  };

  // Clone body if present
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // The request.body is a ReadableStream; pass through directly in workers
    fetchOptions.body = request.body;
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, fetchOptions);

    // Copy response headers, excluding hop-by-hop headers
    const respHeaders = new Headers();
    for (const [k, v] of upstreamResponse.headers.entries()) {
      const key = k.toLowerCase();
      if (['connection','keep-alive','proxy-authorization','proxy-authenticate','transfer-encoding','upgrade'].includes(key)) continue;
      respHeaders.set(k, v);
    }

    // Add CORS headers for the client
    respHeaders.set('Access-Control-Allow-Origin', allowedOrigins && allowedOrigins.includes('*') ? '*' : (origin || '*'));
    respHeaders.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Return the upstream body as ArrayBuffer to avoid body lock issues
    const arrayBuffer = await upstreamResponse.arrayBuffer();
    return new Response(arrayBuffer, {
      status: upstreamResponse.status,
      headers: respHeaders
    });
  } catch (err) {
    const errBody = JSON.stringify({ error: 'proxy_error', message: String(err) });
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigins && allowedOrigins.includes('*') ? '*' : (origin || '*')
    };
    return new Response(errBody, { status: 502, headers });
  }
}