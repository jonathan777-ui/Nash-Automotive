export type AuthMode = 'cli' | 'manual';

export interface CredentialField {
  /** Short key used in the form and as the Secrets Store name suffix. */
  key: string;
  label: string;
  secretName: string;
}

export interface VendorDef {
  id: string;
  label: string;
  authMode: AuthMode;
  /** authMode 'cli' only — the command Jonathan runs locally (likely inside a live Claude Code
   * session, per the brief) to authenticate. Claude Code handles the follow-up (key generation,
   * webhook config, the eventual Secrets Store write) from there — outside this web form. */
  cliCommand?: string;
  /** authMode 'manual' only — one or more values this form actually collects and writes to
   * Secrets Store itself. */
  fields?: CredentialField[];
  hint: string;
  /** Set when I could not confirm this vendor actually has the CLI-auth flow I've assumed (or
   * lack of one) — surfaced in the UI rather than silently guessed. Check before relying on it. */
  uncertain?: boolean;
}

export const VENDORS: VendorDef[] = [
  // --- CLI-auth path: run locally, Claude Code takes it from there, then mark connected here ---
  {
    id: 'github',
    label: 'GitHub',
    authMode: 'cli',
    cliCommand: 'gh auth login',
    hint: 'Repo access for the codebase, per the Launch Checklist.',
  },
  {
    id: 'netlify',
    label: 'Netlify',
    authMode: 'cli',
    cliCommand: 'netlify login',
    hint: 'Demo sites, client sites, and the demo generator’s output all deploy here.',
  },
  {
    id: 'oracle',
    label: 'Oracle Cloud',
    authMode: 'cli',
    cliCommand: 'oci setup config',
    hint: 'The persistent VM running n8n, the scraper, and (later) self-hosted Twenty CRM.',
    uncertain: true, // oci setup config is an interactive key-upload wizard, not a pure browser-click OAuth flow like the others — confirm it fits the "one click" pattern before relying on it matching gh/netlify/wrangler exactly.
  },
  {
    id: 'google-cloud',
    label: 'Google Cloud (Drive API + Places API)',
    authMode: 'cli',
    cliCommand: 'gcloud auth application-default login',
    hint:
      'Drive API for per-client folder auto-creation, and Places API (New) for the demo generator’s ' +
      'GBP-link ingestion (src/gbp/ at the repo root) — both need enabling on the same project, plus ' +
      'an API key minted for Places specifically (`gcloud services enable places-backend.googleapis.com` ' +
      'then `gcloud services api-keys create`, restricted to the Places API).',
    uncertain: true, // confirmed gcloud itself has real CLI OAuth login; NOT confirmed that this alone is sufficient — enabling both APIs and minting the right credentials (OAuth client/service account for Drive, a restricted API key for Places) is follow-up scripting Claude Code would still need to do, not something the login step alone produces.
  },

  // --- Manual-paste fallback: no CLI-auth path found for these ---
  {
    id: 'claude-api',
    label: 'Anthropic Console (Claude API)',
    authMode: 'manual',
    fields: [{ key: 'key', label: 'API key', secretName: 'CLAUDE_API_KEY' }],
    hint: 'console.anthropic.com → API Keys. No CLI-auth path found for key issuance.',
  },
  {
    id: 'gemini-api',
    label: 'Google AI Studio (Gemini API)',
    authMode: 'manual',
    fields: [{ key: 'key', label: 'API key', secretName: 'GEMINI_API_KEY' }],
    hint: 'aistudio.google.com → Get API key.',
    uncertain: true, // if this ends up routed through Vertex AI instead of plain AI Studio, gcloud's CLI-auth (see google-cloud row above) may cover it too — worth checking before assuming this has to stay manual-paste.
  },
  {
    id: 'grok-api',
    label: 'xAI Console (Grok API)',
    authMode: 'manual',
    fields: [{ key: 'key', label: 'API key', secretName: 'GROK_API_KEY' }],
    hint: 'console.x.ai → API Keys. No CLI-auth path found.',
  },
  {
    id: 'twenty-crm',
    label: 'Twenty CRM',
    authMode: 'manual',
    fields: [{ key: 'key', label: 'API token', secretName: 'TWENTY_CRM_API_KEY' }],
    hint: 'Twenty → Settings → API & Webhooks. Cloud Pro tier per the brief.',
  },
  {
    id: 'plunk',
    label: 'Plunk (email sending)',
    authMode: 'manual',
    fields: [{ key: 'key', label: 'API key', secretName: 'PLUNK_API_KEY' }],
    hint: 'Plunk dashboard → Settings → API Keys → Secret Key.',
  },
  {
    id: 'documenso',
    label: 'Documenso (e-sign)',
    authMode: 'manual',
    fields: [{ key: 'key', label: 'API token', secretName: 'DOCUMENSO_API_KEY' }],
    hint: 'Documenso → Settings → API Tokens → Create Token.',
  },
  {
    id: 'n8n',
    label: 'n8n',
    authMode: 'manual',
    fields: [
      { key: 'url', label: 'Instance URL', secretName: 'N8N_INSTANCE_URL' },
      { key: 'key', label: 'API key', secretName: 'N8N_API_KEY' },
    ],
    hint: 'Already self-hosted on the Oracle box — this just needs current access, not a new account.',
  },
];

/** The original checkpoint-2 pair, kept as a stable export in case anything still imports it. */
export const TEST_VENDORS: VendorDef[] = VENDORS.filter((v) => v.id === 'plunk' || v.id === 'documenso');
