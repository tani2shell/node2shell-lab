'use strict';

// PacketLedger Manifest Gateway — node2shell-lab
// Honest black-box surface: no version banner, no stack leaks.
// The br request decode path lives in express@5.3.0/body-parser (bundled brotli).

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.disable('x-powered-by');
app.disable('etag');

const BOOT = Date.now();
const RECEIPT_DIR = '/var/lib/ledger/receipts';
const STARTED = Math.floor(Date.now() / 1000);

// Sealed proof: handed by the supervisor on fd 3 at exec time.
// Read via readSync(3) on the inherited fd — re-opening the path would hit
// /root 0700 for the node user, which is the point.
let SEALED = '<unsealed>';
try {
  const buf = Buffer.alloc(4096);
  const n = fs.readSync(3, buf, 0, 4096, null);
  SEALED = buf.slice(0, n).toString('utf8').trim();
} catch (_e) {
  /* dev fallback */
}

// Honest counters (crash oracle: pid + uptime reset on OOB kill).
let decodedCount = 0;

app.get('/', (_req, res) => {
  res
    .status(200)
    .type('html')
    .end(
      '<html><head><title>PacketLedger Gateway</title></head><body>' +
        '<h1>PacketLedger Manifest Gateway</h1>' +
        '<p>Freight manifest intake for the harbor district.</p>' +
        '<ul>' +
        '<li>POST /api/manifest — submit a manifest (JSON; gzip / deflate / brotli request bodies accepted)</li>' +
        '<li>GET /api/receipt?file=name — fetch a stored receipt</li>' +
        '<li>GET /api/health — liveness</li>' +
        '</ul></body></html>',
    );
});

app.get('/api/health', (_req, res) => {
  let restarts = 0;
  let crashes = 0;
  try {
    const state = JSON.parse(fs.readFileSync('/run/ledger/state.json', 'utf8'));
    restarts = state.restarts || 0;
    crashes = state.crashes || 0;
  } catch (_e) {
    /* first boot */
  }
  res.json({
    status: 'ok',
    runtime: 'node/24',
    pid: process.pid,
    uptime_s: Math.floor((Date.now() - BOOT) / 1000),
    restarts,
    crashes,
    manifests_decoded: decodedCount,
  });
});

app.post(
  '/api/manifest',
  // r1 fix: limit must sit above the 16,777,218 B ring-boundary OOB point
  // (64kb destroyed the inflated stream at ~80KB — engine could never crash).
  express.json({ limit: '20mb', type: 'application/json' }),
  (request, response) => {
    decodedCount += 1;
    const manifest = request.body || {};
    const id = crypto.randomBytes(6).toString('hex');
    const receipt = {
      id,
      vessel: String(manifest.vessel || 'UNKNOWN'),
      containers: Number(manifest.containers || 0),
      received_at: new Date().toISOString(),
      checksum: crypto
        .createHash('sha256')
        .update(JSON.stringify(manifest))
        .digest('hex')
        .slice(0, 16),
    };
    try {
      fs.writeFileSync(
        path.join(RECEIPT_DIR, `receipt-${id}.json`),
        JSON.stringify(receipt, null, 2),
      );
    } catch (_e) {
      /* receipt store best-effort */
    }
    response.status(201).json({ queued: true, id: `receipt-${id}.json` });
  },
);

// Receipt lookup — takes the filename straight from the query, joins it to
// the store directory, and hands the file back. (Yes. That join.)
app.get('/api/receipt', (request, response) => {
  const wanted = request.query.file;
  if (!wanted || typeof wanted !== 'string') {
    return response
      .status(400)
      .json({ error: 'query parameter file required' });
  }
  const target = path.join(RECEIPT_DIR, wanted);
  fs.readFile(target, 'utf8', (error, data) => {
    if (error) {
      return response.status(404).json({ error: 'receipt not found' });
    }
    response.status(200).type('text/plain').end(data);
  });
});

// Harbor attestation desk. Sealed attestations are only unsealed after an
// engine incident has been *demonstrated* — policy: 3 recorded crashes.
app.get('/api/attest', (request, response) => {
  let crashes = 0;
  try {
    crashes = JSON.parse(fs.readFileSync('/run/ledger/state.json', 'utf8')).crashes || 0;
  } catch (_e) {
    /* no ledger yet */
  }
  if (crashes < 3) {
    return response.status(403).json({
      error: 'attestation sealed pending incident verification',
      recorded_crashes: crashes,
      required_crashes: 3,
    });
  }
  return response
    .status(200)
    .type('text/plain')
    .end(SEALED + '\n');
});

// Honest error surface: zlib failures become a short code, never a stack.
app.use((error, _request, response, _next) => {
  const code = String(error.code || error.type || 'bad_request');
  const status = error.status === 413 ? 413 : 400;
  response.status(status).json({ error: code });
});

app.listen(3000, '0.0.0.0');
