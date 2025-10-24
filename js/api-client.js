// js/api-client.js
// Network layer: POST helper, tolerant parser and optional public-proxy fallbacks.
// Exposed as window.ApiClient.

(function(){
  const parseJsonFlexible = async (res) => {
    const text = await res.text();
    try { return JSON.parse(text); } catch(e) { return text; }
  };

  // Performs a single POST and returns parsed body. Throws on non-2xx with body attached.
  async function tryOne(url, req){
    const r = await fetch(url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });
    const parsed = await parseJsonFlexible(r);
    if (!r.ok) {
      const err = new Error('HTTP ' + r.status);
      err.status = r.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  }

  // Try primary URL; if it fails and url is non-local, try public proxies (best-effort).
  async function tryFetchWithFallback(req){
    const isLocal = req.url.startsWith('http://127.0.0.1') || req.url.startsWith('http://localhost') || req.url.startsWith('http://[::1]');
    try {
      return await tryOne(req.url, req);
    } catch (e1) {
      if (isLocal) {
        // Surface the local error, do not try public proxies
        throw e1;
      }
      const proxies = [
        (u)=> 'https://cors.isomorphic-git.org/' + u,
        (u)=> 'https://corsproxy.io/?' + encodeURIComponent(u)
      ];
      for (const build of proxies){
        try {
          const proxyUrl = build(req.url);
          return await tryOne(proxyUrl, req);
        } catch (e2) {
          // try next
        }
      }
      throw e1;
    }
  }

  window.ApiClient = {
    tryOne,
    tryFetchWithFallback,
    parseJsonFlexible
  };
})();