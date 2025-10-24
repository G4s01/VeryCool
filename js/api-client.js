// js/api-client.js
// Network layer: POST helper, tolerant parser and proxy fallback with sticky + blacklist.
// Exposed as window.ApiClient.

(function(){
  // Configuration: set WORKER URL by defining window.VC_WORKER_URL before this script runs,
  // or edit the default below:
  const WORKER_URL = (typeof window !== 'undefined' && window.VC_WORKER_URL) ? window.VC_WORKER_URL : 'https://<your-worker>.workers.dev/';

  // Proxy list priority: direct -> worker -> public proxies
  const PROXIES = [
    { name: 'direct', url: null },
    { name: 'worker', url: WORKER_URL },
    { name: 'corsproxy', url: 'https://corsproxy.io/?' },
    { name: 'isomorphic', url: 'https://cors.isomorphic-git.org/' }
  ];

  // Storage keys
  const BLACKLIST_KEY = 'vc_proxy_blacklist'; // localStorage: { proxyName: retryUntilTimestamp }
  const STICKY_KEY = 'vc_proxy_sticky';       // sessionStorage: proxyName

  // util: parse response as JSON when possible
  const parseJsonFlexible = async (res) => {
    const text = await res.text();
    try { return JSON.parse(text); } catch(e) { return text; }
  };

  // util: blacklisting and sticky management
  function getBlacklist() {
    try { return JSON.parse(localStorage.getItem(BLACKLIST_KEY) || '{}'); } catch(e){ return {}; }
  }
  function setBlacklist(map) { try { localStorage.setItem(BLACKLIST_KEY, JSON.stringify(map)); } catch(e){} }
  function markFailed(name, ttlSeconds = 60) {
    const map = getBlacklist();
    map[name] = Date.now() + ttlSeconds * 1000;
    setBlacklist(map);
  }
  function isBlacklisted(name) {
    const map = getBlacklist();
    const t = map[name];
    if (!t) return false;
    if (Date.now() > t) {
      delete map[name];
      setBlacklist(map);
      return false;
    }
    return true;
  }
  function setSticky(name) {
    try { sessionStorage.setItem(STICKY_KEY, name); } catch(e) {}
  }
  function getSticky() {
    try { return sessionStorage.getItem(STICKY_KEY); } catch(e) { return null; }
  }

  function getCandidateProxies() {
    const sticky = getSticky();
    const list = [];
    if (sticky) {
      const st = PROXIES.find(p => p.name === sticky);
      if (st && !isBlacklisted(st.name)) list.push(st);
    }
    for (const p of PROXIES) {
      if (p.name === sticky) continue;
      if (!isBlacklisted(p.name)) list.push(p);
    }
    return list;
  }

  // fetch with timeout helper
  function fetchWithTimeout(resource, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const { signal } = controller;
    const opts = { ...options, signal };
    const p = fetch(resource, opts);
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    return p.finally(() => clearTimeout(timeoutId));
  }

  // Performs a single POST and returns parsed body. Throws on non-2xx with body attached.
  async function tryOne(url, req){
    // req: { url, headers, body } where body is JS object
    const headers = req.headers || {};
    // ensure content-type if body present
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    const fetchOpts = {
      method: 'POST',
      headers,
      body: (req.body && typeof req.body === 'object') ? JSON.stringify(req.body) : req.body,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    };

    const r = await fetch(url, fetchOpts);
    const parsed = await parseJsonFlexible(r);
    if (!r.ok) {
      const err = new Error('HTTP ' + r.status);
      err.status = r.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  }

  // Try primary URL; if it fails and url is non-local, try proxies in priority order.
  // Accepts req { url, headers, body } and returns parsed response (object or text).
  async function tryFetchWithFallback(req){
    const targetUrl = req.url;
    const isLocal = targetUrl.startsWith('http://127.0.0.1') || targetUrl.startsWith('http://localhost') || targetUrl.startsWith('http://[::1]');

    // Build candidates taking sticky and blacklist into account
    const candidates = getCandidateProxies();
    let lastErr = null;

    for (const p of candidates) {
      try {
        let callUrl;
        let callReq = { ...req, headers: { ...(req.headers || {}) } };

        if (p.name === 'direct') {
          callUrl = targetUrl;
        } else if (p.name === 'worker') {
          // If worker URL is not configured properly, skip it
          if (!p.url || p.url.includes('<your-worker>')) {
            throw new Error('Worker not configured');
          }
          // Worker is expected to have TARGET_URL configured server-side (recommended).
          // We POST the payload to the worker root and let it forward to configured upstream.
          callUrl = p.url;
        } else {
          // public proxy that expects the target encoded in query
          callUrl = p.url + encodeURIComponent(targetUrl);
        }

        // timeout tuning: direct may have longer timeout
        const timeout = (p.name === 'direct') ? 12000 : 8000;

        const parsed = await (async () => {
          const resp = await fetchWithTimeout(callUrl, {
            method: 'POST',
            headers: callReq.headers,
            body: (callReq.body && typeof callReq.body === 'object') ? JSON.stringify(callReq.body) : callReq.body,
            mode: 'cors',
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
          }, timeout);

          // parse flexible
          const parsedResp = await parseJsonFlexible(resp);
          if (!resp.ok) {
            const err = new Error('HTTP ' + resp.status);
            err.status = resp.status;
            err.body = parsedResp;
            throw err;
          }
          return parsedResp;
        })();

        // success: make sticky for session
        try { setSticky(p.name); } catch (e) {}
        return parsed;
      } catch (err) {
        lastErr = err;
        // if local target and initial direct failed, do not try proxies
        if (isLocal && p.name !== 'direct') {
          break;
        }
        // blacklist failing proxy for a while
        const ttl = (p.name === 'direct') ? 30 : 120; // seconds
        try { markFailed(p.name, ttl); } catch(e) {}
        console.warn(`[ApiClient] proxy ${p.name} failed:`, err && err.message ? err.message : err);
        // continue to next
      }
    }

    // If we get here, nothing succeeded
    throw lastErr || new Error('All proxies failed');
  }

  // Expose API
  window.ApiClient = {
    tryOne,
    tryFetchWithFallback,
    parseJsonFlexible,
    // helper to inspect current sticky and blacklist (useful for debugging)
    _diagnostics: {
      getSticky: () => getSticky(),
      getBlacklist: () => getBlacklist(),
      setWorkerUrl: (url) => {
        // convenience for runtime: set worker url and update PROXIES entry
        for (let p of PROXIES) {
          if (p.name === 'worker') p.url = url;
        }
        if (typeof window !== 'undefined') window.VC_WORKER_URL = url;
      }
    }
  };
})();