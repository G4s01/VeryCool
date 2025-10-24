# VeryCool — Cloudflare Worker proxy (README)

This document explains how to create, configure and deploy the Cloudflare Worker proxy for VeryCool.

Purpose
- Allow the GitHub Pages site (or any static host) to POST to the VeryMobile API without browser CORS errors.
- Optionally inject secrets (server-side) when required by the upstream API.
- Control allowed origins and limit exposure.

Files provided
- `cloudflare-worker-proxy.js` — the Worker source code.
- `wrangler.toml` — sample Wrangler configuration (edit `account_id` and variables).

Quick Steps (Cloudflare dashboard)
1. Create a Cloudflare account (if you don't have one).
2. Go to Workers -> Create a Worker.
3. Replace the default script with the contents of `cloudflare-worker-proxy.js`.
4. Open "Settings" (or "Variables" / "Secrets") and set:
   - `TARGET_URL` to `https://api.verymobile.it/frontend/crc/WindTre?output=json`
   - `ALLOWED_ORIGINS` to `https://g4s01.github.io` (or your domain). Do NOT use `*` in production unless acceptable.
   - Optionally set `UPSTREAM_AUTH_HEADER` to the header name you want (e.g. `Authorization`) and add a Worker secret `UPSTREAM_AUTH_TOKEN` (via Dashboard UI -> "Secrets" or via wrangler).
5. Save and deploy the Worker. Note the worker URL like:
   `https://<your-worker-name>.<your-subdomain>.workers.dev`

Quick Steps (Wrangler CLI)
1. Install Wrangler:
   ```bash
   npm install -g wrangler
   ```
2. Authenticate:
   ```bash
   wrangler login
   ```
   or configure with API token following Cloudflare docs.
3. Initialize a worker project (or use the files provided):
   ```bash
   wrangler init verycool-proxy --yes
   ```
   Replace the generated `index.js` with `cloudflare-worker-proxy.js` and update `wrangler.toml`.
4. Set your Cloudflare account_id in `wrangler.toml`.
5. (Optional) Add secret token:
   ```bash
   wrangler secret put UPSTREAM_AUTH_TOKEN
   ```
6. Publish:
   ```bash
   wrangler publish
   ```
7. Worker will be available at the workers_dev URL shown by Wrangler.

Client integration (recommended)
- Instead of calling the VeryMobile API directly, call your worker endpoint:
  - Example POST to worker:
    ```js
    const workerUrl = 'https://<your-worker>.workers.dev/';
    const resp = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await resp.json();
    ```
- In production prefer to:
  - Use a fixed `TARGET_URL` in the worker (configured server-side).
  - Restrict `ALLOWED_ORIGINS` to your public domain.
  - Use Worker secrets to inject any upstream auth tokens.

Testing locally
- Use `wrangler dev` to run a local development server that proxies to Cloudflare's environment:
  ```bash
  wrangler dev cloudflare-worker-proxy.js
  ```
  Then call the dev URL (e.g. http://127.0.0.1:8787/) from your client.

Security notes
- Do not allow arbitrary targets in production (`WORKER_ALLOW_ANY_TARGET = true`) unless you have full control and rate limiting.
- Use `ALLOWED_ORIGINS` to whitelist your site(s); avoid `*` in production if you can.
- Store secrets via Wrangler secrets or Cloudflare Dashboard Secrets.
- Add rate-limiting and logging if the worker will be publicly used.

Next steps
1. Deploy the worker following one of the flows above.
2. Update client code (in your repo) to call the worker URL instead of the API directly (I'll provide the client-side patch/snippet if you want).
3. Test from your GitHub Pages / Cloudflare Pages site and verify CORS preflight OPTIONS responds successfully.
4. When working, commit the worker support files to your repo (e.g. `wrangler.toml`, README). Do not commit secrets.

If you want, I'll:
- generate a client patch for `api-client.js` to switch the proxy order to prefer the worker and include sticky + blacklist behavior; or
- prepare a small PR with `cloudflare-worker-proxy.js` and `wrangler.toml` in your repo.