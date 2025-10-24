// proxy.js
// Dev server + proxy con logging dettagliato e fallback porta automatica.
// Serve file statici dalla root del progetto e inoltra POST a VeryMobile.
//
// Uso:
// 1) npm install
// 2) npm start
//
// Note:
// - Risponde alle OPTIONS (preflight) con gli header CORS permissivi (solo per sviluppo).
// - Se la porta specificata è occupata, prova la successiva automaticamente.
// - Ascolta su 0.0.0.0 per evitare problemi di bind IPv6/IPv4 su Windows.

const express = require('express');
const fetch = require('node-fetch'); // v2
const path = require('path');
const bodyParser = require('body-parser');

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 667;
const TARGET = 'https://api.verymobile.it/frontend/crc/WindTre?output=json';
const STATIC_DIR = path.resolve(__dirname);

const app = express();

// Serve static files (index.html, js/, data/, ecc.)
app.use(express.static(STATIC_DIR, { extensions: ['html'] }));

// Detailed request logger for debugging
app.use((req, res, next) => {
  console.log(`[INCOMING] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  // Log minimal headers to avoid huge output but keep useful info
  const h = {
    host: req.headers.host,
    origin: req.headers.origin,
    'user-agent': req.headers['user-agent'],
    accept: req.headers.accept,
    'content-type': req.headers['content-type']
  };
  console.log('  Headers:', h);
  next();
});

// CORS helper (sviluppo)
app.use((req, res, next) => {
  // Permissivi in sviluppo: in produzione non usare questi header
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    console.log('[CORS] Preflight OPTIONS -> 204', req.originalUrl);
    return res.sendStatus(204);
  }
  next();
});

app.use(bodyParser.json({ limit: '1mb' }));

app.post('/api/very', async (req, res) => {
  console.log('[PROXY] Forwarding POST to target', TARGET);
  try {
    // show small preview of body for debug (avoid leaking large payloads)
    const preview = JSON.stringify(req.body).slice(0, 1000);
    console.log('  Body preview:', preview);

    const response = await fetch(TARGET, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    console.log(`[PROXY] Target responded ${response.status} ${response.statusText}`);
    const contentType = response.headers.get('content-type') || 'text/plain';
    const text = await response.text();

    // Forward response
    res.status(response.status).set('Content-Type', contentType).send(text);
  } catch (err) {
    console.error('[PROXY] Error forwarding request:', err && err.stack ? err.stack : err);
    res.status(502).json({ error: 'proxy_error', message: String(err) });
  }
});

// Helper: try to listen on port, if in use try next port
function tryListen(port) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`\nDev server + proxy listening at http://127.0.0.1:${port}/`);
    console.log(`Serving static files from: ${STATIC_DIR}`);
    console.log(`Proxy endpoint: POST http://127.0.0.1:${port}/api/very -> ${TARGET}\n`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      setTimeout(() => tryListen(port + 1), 200);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

tryListen(DEFAULT_PORT);