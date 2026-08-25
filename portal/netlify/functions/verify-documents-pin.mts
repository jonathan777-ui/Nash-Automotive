import type { Context, Config } from '@netlify/functions';
import { verifyDocumentsPin } from './lib/verifyDocumentsPin.js';

export default async (req: Request, _context: Context): Promise<Response> => {
  let body: { opportunityId?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await verifyDocumentsPin(
    { opportunityId: body.opportunityId ?? '', pin: body.pin ?? '' },
    {
      twentyCrmBaseUrl: process.env.TWENTY_CRM_BASE_URL ?? '',
      twentyCrmApiKey: process.env.TWENTY_CRM_API_KEY ?? 'PLACEHOLDER_TWENTY_CRM_API_KEY',
    },
  );

  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, reason: result.reason }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true, driveFolderUrl: result.driveFolderUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/api/verify-documents-pin',
};
