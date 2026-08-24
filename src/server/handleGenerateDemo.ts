import { generateDemo, type GenerateDemoDeps, type GenerateDemoRequest } from './generateDemo.js';

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function isValidBody(body: unknown): body is GenerateDemoRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if (typeof b.vertical !== 'string' || !b.vertical.trim()) return false;
  if (typeof b.niche !== 'string' || !b.niche.trim()) return false;
  if (b.gbpUrl !== undefined && typeof b.gbpUrl !== 'string') return false;
  if (b.websiteUrl !== undefined && typeof b.websiteUrl !== 'string') return false;
  if (b.manualForm !== undefined) {
    if (typeof b.manualForm !== 'object' || b.manualForm === null) return false;
    const m = b.manualForm as Record<string, unknown>;
    if (typeof m.companyName !== 'string' || typeof m.city !== 'string' || typeof m.state !== 'string') {
      return false;
    }
  }
  return true;
}

/** Maps generateDemo's result to an HTTP status — the transport-agnostic seam that both
 * src/server/index.ts (real node:http server) and tests exercise, so the request-handling logic
 * itself never has to know it's running over HTTP. */
export async function handleGenerateDemo(rawBody: unknown, deps: GenerateDemoDeps): Promise<HttpResult> {
  if (!isValidBody(rawBody)) {
    return {
      status: 400,
      body: {
        ok: false,
        reason:
          'Invalid request body — required: {vertical: string, niche: string}, plus at least one of ' +
          '{gbpUrl: string}, {websiteUrl: string}, {manualForm: {companyName, city, state}}.',
      },
    };
  }

  const result = await generateDemo(rawBody, deps);
  if (result.ok) {
    return { status: 200, body: { ok: true, unifiedKb: result.unifiedKb, stepUsed: result.stepUsed } };
  }

  const status = result.stage === 'validation' ? 400 : result.stage === 'cascade' ? 422 : 502;
  return {
    status,
    body: { ok: false, stage: result.stage, reason: result.reason, attempts: result.attempts },
  };
}
