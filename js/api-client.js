// js/api-client.js
// Network layer: tryFetchWithFallback implementing:
// - priority: direct -> worker -> public fallbacks
// - sticky per sessione (sessionStorage)
// - blacklist temporanea (localStorage) con TTL
// - circuit breaker (error counts -> quarantine)
// - health-check asincrono per ripristino proxy
// - timeouts e retry limits
// - non invia dati sensibili a proxy pubblici
// Exposes window.ApiClient

(function(){
  // Configuration: override worker URL at runtime by setting window.VC_WORKER_URL BEFORE this script loads,
  // or call Api._diagnostics.setWorkerUrl(url) at runtime.
  const DEFAULT_WORKER_PLACEHOLDER = 'https://<your-worker>.workers.dev/';
  const WORKER_URL = (typeof window !== 'undefined' && window.VC_WORKER_URL) ? window.VC_WORKER_URL : DEFAULT_WORKER_PLACEHOLDER;

  // Proxy priority: direct -> worker -> public proxies
  // In production you can remove public proxies or keep only for debug.
  const PROXIES = [
    { name: 'direct', url: null, type: 'direct' },
    { name: 'worker', url: WORKER_URL, type: 'private' },
    { name: 'corsproxy', url: 'https://corsproxy.io/?', type: 'public' },
    { name: 'isomorphic', url: 'https://cors.isomorphic-git.org/', type: 'public' }
  ];

  // Tunables: adjust to taste
  const TIMEOUT_DIRECT_MS = 12000;
  const TIMEOUT_PROXY_MS = 9000;
  const BLACKLIST_TTL_SEC = 120;         // single failure -> blacklisted for 120s
  const CIRCUIT_THRESHOLD = 3;           // errors to open circuit
  const CIRCUIT_QUARANTINE_SEC = 600;    // quarantine after threshold reached
  const HEALTH_CHECK_INTERVAL_MS = 30 * 1000; // run background probe every 30s
  const MAX_TOTAL_ATTEMPTS = 3;          // overall attempts cap

  // Storage keys
  const BLACKLIST_KEY = 'vc_proxy_blacklist';   // { name: retryUntilTimestamp }
  const CIRCUIT_KEY = 'vc_proxy_circuit';       // { name: { failCount, quarantineUntil } }
  const STICKY_KEY = 'vc_proxy_sticky';         // sessionStorage: name
  const METRICS_KEY = 'vc_proxy_metrics';       // optional telemetry in localStorage

  // util: safe JSON parse
  function safeParse(s) { try { return JSON.parse(s); } catch(e) { return null; } }

  // Blacklist helpers
  function _readLocal(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) { return {}; }
  }
  function _writeLocal(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch(e) {}
  }

  function getBlacklist() {
    const map = _readLocal(BLACKLIST_KEY);
    // cleanup expired
    const now = Date.now();
    let changed = false;
    for (const k in map) {
      if (map[k] <= now) { delete map[k]; changed = true; }
    }
    if (changed) _writeLocal(BLACKLIST_KEY, map);
    return map;
  }
  function markFailed(name, ttlSeconds = BLACKLIST_TTL_SEC) {
    const map = getBlacklist();
    map[name] = Date.now() + ttlSeconds * 1000;
    _writeLocal(BLACKLIST_KEY, map);
  }
  function isBlacklisted(name) {
    const map = getBlacklist();
    return !!map[name] && Date.now() <= map[name];
  }

  // Circuit breaker helpers
  function getCircuits() { return _readLocal(CIRCUIT_KEY); }
  function setCircuits(c) { _writeLocal(CIRCUIT_KEY, c); }
  function registerFailure(name) {
    const circuits = getCircuits();
    const entry = circuits[name] || { failCount: 0, quarantineUntil: 0 };
    entry.failCount = (entry.failCount || 0) + 1;
    if (entry.failCount >= CIRCUIT_THRESHOLD) {
      entry.quarantineUntil = Date.now() + CIRCUIT_QUARANTINE_SEC * 1000;
      entry.failCount = 0; // reset counter after opening circuit
    }
    circuits[name] = entry;
    setCircuits(circuits);
  }
  function isQuarantined(name) {
    const circuits = getCircuits();
    const e = circuits[name];
    if (!e) return false;
    if (e.quarantineUntil && Date.now() <= e.quarantineUntil) return true;
    // expired
    delete circuits[name];
    setCircuits(circuits);
    return false;
  }
  function clearCircuit(name) {
    const circuits = getCircuits();
    if (circuits[name]) { delete circuits[name]; setCircuits(circuits); }
  }

  // Sticky helpers
  function setSticky(name) {
    try { sessionStorage.setItem(STICKY_KEY, name); } catch(e) {}
  }
  function getSticky() {
    try { return sessionStorage.getItem(STICKY_KEY); } catch(e) { return null; }
  }
  function clearSticky() { try { sessionStorage.removeItem(STICKY_KEY); } catch(e) {} }

  // Telemetry (basic)
  function recordMetric(proxyName, durationMs, ok) {
    try {
      const m = _readLocal(METRICS_KEY);
      const stats = m[proxyName] || { attempts: 0, successes: 0, totalTime: 0 };
      stats.attempts = (stats.attempts || 0) + 1;
      if (ok) stats.successes = (stats.successes || 0) + 1;
      stats.totalTime = (stats.totalTime || 0) + (durationMs || 0);
      m[proxyName] = stats;
      _writeLocal(METRICS_KEY, m);
    } catch(e) {}
  }
  function getMetrics() { return _readLocal(METRICS_KEY); }

  // Get candidate proxies order: sticky first (if healthy), then configured order skipping blacklisted/quarantined.
  function getCandidateProxies() {
    const sticky = getSticky();
    const list = [];
    if (sticky) {
      const st = PROXIES.find(p => p.name === sticky);
      if (st && !isBlacklisted(st.name) && !isQuarantined(st.name)) list.push(st);
    }
    for (const p of PROXIES) {
      if (p.name === sticky) continue;
      if (isBlacklisted(p.name) || isQuarantined(p.name)) continue;
      list.push(p);
    }
    return list;
  }

  // fetch with timeout
  function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const opts = { ...options, signal: controller.signal };
    return fetch(url, opts)
      .finally(() => clearTimeout(id));
  }

  // parse flexible JSON/text
  async function parseJsonFlexible(res) {
    const text = await res.text();
    try { return JSON.parse(text); } catch(e) { return text; }
  }

  // internal single attempt (doesn't apply sticky logic)
  async function singleAttempt(proxy, targetUrl, req) {
    let callUrl;
    const headers = { ...(req.headers || {}) };
    // For public proxies, strip Authorization and other sensitive headers
    if (proxy.type === 'public') {
      delete headers['Authorization'];
      delete headers['authorization'];
    }

    if (proxy.name === 'direct') {
      callUrl = targetUrl;
    } else if (proxy.name === 'worker') {
      if (!proxy.url || proxy.url.includes('<your-worker>')) {
        throw new Error('Worker not configured');
      }
      // Worker is expected to forward to server-side TARGET_URL; we POST directly to worker root
      callUrl = proxy.url;
    } else {
      // public proxy expects encoded target in query
      // ensure trailing slash or query format expected by proxy
      callUrl = proxy.url + encodeURIComponent(targetUrl);
    }

    const timeout = (proxy.name === 'direct') ? TIMEOUT_DIRECT_MS : TIMEOUT_PROXY_MS;
    const start = Date.now();
    const resp = await fetchWithTimeout(callUrl, {
      method: 'POST',
      headers,
      body: (req.body && typeof req.body === 'object') ? JSON.stringify(req.body) : req.body,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }, timeout);

    const duration = Date.now() - start;
    // parse and throw on non-ok with parsed body attached
    const parsed = await parseJsonFlexible(resp);
    recordMetric(proxy.name, duration, resp.ok);
    if (!resp.ok) {
      const err = new Error('HTTP ' + resp.status);
      err.status = resp.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  }

  // Public method: tryFetchWithFallback(req) where req = { url, headers, body }
  async function tryFetchWithFallback(req) {
    const targetUrl = req.url;
    // local endpoints short-circuit: do not try public proxies for local dev
    const isLocal = targetUrl.startsWith('http://127.0.0.1') || targetUrl.startsWith('http://localhost') || targetUrl.startsWith('http://[::1]');

    const candidates = getCandidateProxies();
    let lastErr = null;
    let attempts = 0;

    for (const p of candidates) {
      if (attempts >= MAX_TOTAL_ATTEMPTS) break;
      attempts++;
      try {
        // attempt
        console.info(`[ApiClient] trying ${p.name} -> ${p.url || 'direct'}`);
        const res = await singleAttempt(p, targetUrl, req);
        // success: set sticky and clear circuit for this proxy
        setSticky(p.name);
        clearCircuit(p.name);
        return res;
      } catch (err) {
        lastErr = err;
        console.warn(`[ApiClient] ${p.name} failed:`, err && err.message ? err.message : err);

        // register failure in circuit breaker
        registerFailure(p.name);
        // mark failed to blacklist briefly
        markFailed(p.name, BLACKLIST_TTL_SEC);

        // If is local, don't try public proxies
        if (isLocal && p.name !== 'direct') break;

        // continue to next candidate
      }
    }

    // After trying candidates, maybe try to fall back to any proxy that is not blacklisted but was skipped
    // (optional): for brevity we throw last error
    throw lastErr || new Error('All proxies failed');
  }

  // Health check: periodically try lightweight probes to clear blacklist/quarantine
  async function runHealthChecks() {
    const candidates = PROXIES;
    for (const p of candidates) {
      // only probe those currently blacklisted or quarantined
      if (!isBlacklisted(p.name) && !isQuarantined(p.name)) continue;

      // skip probing direct
      if (p.name === 'direct') {
        // attempt a simple HEAD to target to see if direct becomes available is tricky (cross-origin); skip
        continue;
      }

      const probeUrl = (p.name === 'worker') ? (p.url) : (p.url); // for public proxies hitting root is ok
      try {
        const controller = new AbortController();
        const id = setTimeout(()=>controller.abort(), 5000);
        const resp = await fetch(probeUrl, { method: 'OPTIONS', signal: controller.signal });
        clearTimeout(id);
        if (resp && (resp.status === 204 || resp.status < 500)) {
          // clear blacklist/quarantine
          console.info(`[ApiClient][health] probe success ${p.name}`);
          // remove blacklist entry
          const bl = getBlacklist(); if (bl[p.name]) { delete bl[p.name]; localStorage.setItem(BLACKLIST_KEY, JSON.stringify(bl)); }
          clearCircuit(p.name);
        }
      } catch (e) {
        // still down
      }
    }
  }

  // start periodic health checks (best-effort)
  try {
    setInterval(runHealthChecks, HEALTH_CHECK_INTERVAL_MS);
  } catch (e) {}

  // Expose API and diagnostics
  window.ApiClient = {
    tryOne: async function(url, req) {
      // convenience to call singleAttempt with direct target
      return singleAttempt({ name: 'direct', url: null, type: 'direct' }, url, req);
    },
    tryFetchWithFallback,
    parseJsonFlexible,
    _diagnostics: {
      getSticky: () => getSticky(),
      getBlacklist: () => getBlacklist(),
      getCircuits: () => getCircuits(),
      getMetrics: () => getMetrics(),
      setWorkerUrl: (url) => {
        // update in-memory PROXIES entry and window.VC_WORKER_URL for persistence
        for (let p of PROXIES) {
          if (p.name === 'worker') p.url = url;
        }
        if (typeof window !== 'undefined') window.VC_WORKER_URL = url;
      },
      // manual health check trigger
      runHealthChecks: () => runHealthChecks()
    }
  };
})();
