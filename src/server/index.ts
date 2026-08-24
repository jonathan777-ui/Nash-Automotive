import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { parseNicheAtlas } from '../kb/atlasParser.js';
import { loadStaticKbContext } from '../unifiedKb/loadStaticContext.js';
import { handleGenerateDemo } from './handleGenerateDemo.js';
import type { GenerateDemoDeps } from './generateDemo.js';

/** Checkpoint 5's actual transport: "standalone Node/TS app called via HTTP/webhook from n8n" per
 * the brief. n8n handles trigger timing and Demo Dashboard/CRM updates on the result; this process
 * only does generation. Not run automatically by `npm test` — start it with `npm run serve`. */

const PORT = Number(process.env.PORT ?? 8787);
const KB_SOURCE_DIR = process.env.KB_SOURCE_DIR ?? path.join(import.meta.dirname, '..', '..', 'kb-source');

/** Same env var name as the Command Center wizard's Secrets Store key for this vendor
 * (command-center/src/vendors.ts's `CLAUDE_API_KEY`), so a deploy that wires the wizard's output
 * straight into this process's environment needs no renaming. */
const ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY ?? 'PLACEHOLDER_CLAUDE_API_KEY';
/** No Secrets Store entry exists for this yet — the Command Center's `google-cloud` vendor row
 * covers CLI login only, not minting/storing this specific restricted API key. Worth adding an
 * explicit field for it once this service actually gets deployed. */
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? 'PLACEHOLDER_GOOGLE_PLACES_API_KEY';

const atlas = parseNicheAtlas(readFileSync(path.join(KB_SOURCE_DIR, 'niche-atlas.md'), 'utf8'));
/** Loaded once at startup, not per-request — it's the same static content for every request
 * regardless of vertical/niche, so re-reading it from disk on every call would be pure waste. */
const staticContext = loadStaticKbContext(KB_SOURCE_DIR);

const deps: GenerateDemoDeps = {
  atlas,
  kbSourceDir: KB_SOURCE_DIR,
  placesApiKey: GOOGLE_PLACES_API_KEY,
  anthropicApiKey: ANTHROPIC_API_KEY,
  staticContext,
};

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, {
      ok: true,
      anthropicKeyConfigured: ANTHROPIC_API_KEY !== 'PLACEHOLDER_CLAUDE_API_KEY',
      placesKeyConfigured: GOOGLE_PLACES_API_KEY !== 'PLACEHOLDER_GOOGLE_PLACES_API_KEY',
    });
  }

  if (req.method === 'POST' && req.url === '/generate-demo') {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      return send(res, 400, { ok: false, reason: 'Request body is not valid JSON.' });
    }

    if (ANTHROPIC_API_KEY === 'PLACEHOLDER_CLAUDE_API_KEY') {
      return send(res, 503, {
        ok: false,
        reason: 'CLAUDE_API_KEY is not configured on this server (still the named placeholder value).',
      });
    }

    const result = await handleGenerateDemo(body, deps);
    return send(res, result.status, result.body);
  }

  send(res, 404, { ok: false, reason: 'Not found. POST /generate-demo or GET /health.' });
});

server.listen(PORT, () => {
  console.log(`Demo generator listening on :${PORT}`);
});
