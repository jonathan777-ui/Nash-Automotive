export type AuthMode = 'cli' | 'manual';

/** Where a field's value needs to actually be DELIVERED, beyond just sitting in Cloudflare Secrets
 * Store as the system of record — this is the "push it to the component that needs it" half of the
 * wizard, wired up in `index.ts`'s `handleSecretsSubmit`. Both are best-effort and independently
 * optional: a field can push to neither, either, or both. See `src/pushTargets/*.ts` for the actual
 * calls and their own "scope limit" notes on what CAN'T be pushed this way (n8n workflows reading a
 * raw `$env.SOMETHING` instead of a named credential object have no remote-settable target at all). */
export interface PushTarget {
  /** Creates/updates a real n8n Credential object via n8n's REST API, matching the exact name every
   * workflow already references it by. Only meaningful for values n8n reads through a named
   * credential (`credentials: {...}` node parameter) — never a `$env.X` reference. */
  n8nCredential?: {
    name: string;
    type: 'httpBearerAuth' | 'httpHeaderAuth';
    /** Builds the credential's `data` object from this field's submitted value - e.g. Twenty CRM's
     * httpBearerAuth credential just wants {token: value}, while Telnyx's httpHeaderAuth credential
     * wants {name: 'Authorization', value: 'Bearer ' + value}. Kept as a function (not a static
     * template) so each field controls its own exact shape rather than a shared guess. */
    buildData: (value: string) => Record<string, string>;
  };
  /** Sets a Netlify site environment variable via Netlify's REST API, under this exact key name -
   * same names `portal/README.md`'s own env var table already documents. */
  netlifyEnvVar?: string;
}

export interface CredentialField {
  /** Short key used in the form and as the Secrets Store name suffix. */
  key: string;
  label: string;
  secretName: string;
  /** See `PushTarget` above - omit for a field that only needs to land in Secrets Store. */
  pushTargets?: PushTarget;
  /** True for the handful of fields Command Center's OWN outbound calls need to read back later
   * (currently: n8n's API key, Netlify's access token/site identifiers) - these get bound directly
   * onto this Worker's own script via `cfWorkerSecrets.ts`, in ADDITION to the normal Secrets Store
   * write, so `env.<secretName>` becomes readable by this Worker's own push logic on its next
   * request. Everything else only ever needs the Secrets Store write. */
  selfBind?: boolean;
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
    fields: [
      {
        key: 'key',
        label: 'API key',
        secretName: 'CLAUDE_API_KEY',
        pushTargets: {
          n8nCredential: { name: 'Claude API', type: 'httpHeaderAuth', buildData: (value) => ({ name: 'x-api-key', value }) },
        },
      },
    ],
    hint:
      'console.anthropic.com → API Keys. No CLI-auth path found for key issuance. Saving this also ' +
      'pushes it into n8n as the "Claude API" credential every Claude-calling workflow references, ' +
      'once n8n is connected below.',
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
    fields: [
      {
        key: 'baseUrl',
        label: 'Base URL (e.g. https://api.twenty.com)',
        secretName: 'TWENTY_CRM_BASE_URL',
        pushTargets: { netlifyEnvVar: 'TWENTY_CRM_BASE_URL' },
      },
      {
        key: 'key',
        label: 'API token',
        secretName: 'TWENTY_CRM_API_KEY',
        pushTargets: {
          n8nCredential: { name: 'Twenty CRM API', type: 'httpBearerAuth', buildData: (value) => ({ token: value }) },
          netlifyEnvVar: 'TWENTY_CRM_API_KEY',
        },
      },
    ],
    hint:
      'Twenty → Settings → API & Webhooks. Cloud Pro tier per the brief. Base URL is new this pass — ' +
      'every workflow/function in this repo reads TWENTY_CRM_BASE_URL, but nothing ever collected it ' +
      'before now. Saving either field pushes it to n8n (the API token, as the "Twenty CRM API" ' +
      'credential) and/or the portal on Netlify (both fields, as plain env vars) once those are ' +
      'connected below — no more manual copy-paste between the three.',
  },
  {
    id: 'plunk',
    label: 'Plunk (email sending)',
    authMode: 'manual',
    fields: [{ key: 'key', label: 'API key', secretName: 'PLUNK_API_KEY' }],
    hint: 'Plunk dashboard → Settings → API Keys → Secret Key.',
  },
  {
    id: 'stripe',
    label: 'Stripe',
    authMode: 'manual',
    fields: [
      { key: 'publishableKey', label: 'Publishable key', secretName: 'STRIPE_PUBLISHABLE_KEY' },
      {
        key: 'secretKey',
        label: 'Secret key',
        secretName: 'STRIPE_SECRET_KEY',
        pushTargets: { netlifyEnvVar: 'STRIPE_SECRET_KEY' },
      },
      { key: 'webhookSecret', label: 'Webhook signing secret', secretName: 'STRIPE_WEBHOOK_SECRET' },
    ],
    hint:
      'dashboard.stripe.com → Developers → API keys, plus a webhook endpoint signing secret. Per the ' +
      'brief (v2): account creation has no verification-queue blocker like Telnyx, so Phase 1 builds ' +
      'the whole payment-link + webhook + CRM stage-advance flow now against placeholder values ' +
      '(PLACEHOLDER_STRIPE_PUBLISHABLE_KEY etc.) — it activates the moment real keys land here. Only ' +
      'the Secret key can be pushed automatically (to the portal on Netlify, once connected below) — ' +
      'n8n reads the Webhook signing secret as its own $env.STRIPE_WEBHOOK_SECRET rather than through ' +
      'a named credential, which has no remote-settable target (see this Worker calling out to n8n\'s ' +
      'REST API only ever manages named CREDENTIAL objects, never n8n\'s own runtime environment ' +
      'variables) — that one still needs adding to n8n\'s environment directly (Docker Compose env / ' +
      'systemd unit on the Oracle box). The Publishable key has no automated consumer anywhere in ' +
      'this repo yet either — stored for reference.',
  },
  {
    id: 'n8n',
    label: 'n8n',
    authMode: 'manual',
    fields: [
      {
        key: 'key',
        label: 'API key',
        secretName: 'N8N_API_KEY',
        selfBind: true,
      },
    ],
    hint:
      'Already self-hosted on the Oracle box — this just needs current access, not a new account. ' +
      'Only the API key is collected here — n8n\'s own Instance URL is a plain (non-secret) setting ' +
      'in this Worker\'s own wrangler.toml ([vars] N8N_INSTANCE_URL), edited once and redeployed, ' +
      'not something this form can write for you (an earlier version of this wizard tried to write ' +
      'it to Secrets Store, which nothing ever actually read — fixed this pass; see DEPLOY.md). ' +
      'Saving the API key here binds it directly onto this Worker (not just Secrets Store) so it can ' +
      'push OTHER credentials — Claude, Twenty CRM, Telnyx — into n8n as you save them below.',
  },
  {
    id: 'netlify-api',
    label: 'Netlify (API access, for auto-pushing env vars)',
    authMode: 'manual',
    fields: [
      { key: 'accessToken', label: 'Personal access token', secretName: 'NETLIFY_ACCESS_TOKEN', selfBind: true },
      { key: 'accountSlug', label: 'Account slug', secretName: 'NETLIFY_ACCOUNT_SLUG', selfBind: true },
      { key: 'siteId', label: 'Site ID (the portal site)', secretName: 'NETLIFY_SITE_ID', selfBind: true },
    ],
    hint:
      'Distinct from the "Netlify" CLI-auth row above — that one is for YOU to deploy the portal from ' +
      'a terminal (netlify login), this one is a Personal Access Token this Worker uses to push env ' +
      'vars into the portal\'s Netlify site on your behalf (app.netlify.com → User settings → ' +
      'Applications → New access token). Account slug and Site ID are both on the site\'s own ' +
      'Site settings → General page. All three get bound directly onto this Worker (not just ' +
      'Secrets Store) so Twenty CRM/Stripe values you save above start reaching the portal ' +
      'automatically instead of a manual copy into Netlify\'s own dashboard.',
    uncertain: true, // Netlify's account-scoped env var API shape (PATCH /accounts/{slug}/env/{key}) is real and documented but unverified against a live account from this sandbox - see src/pushTargets/netlifyEnv.ts's own header.
  },
  {
    id: 'telnyx',
    label: 'Telnyx',
    authMode: 'manual',
    fields: [
      {
        key: 'apiKey',
        label: 'API key (v2)',
        secretName: 'TELNYX_API_KEY',
        pushTargets: {
          n8nCredential: { name: 'Telnyx API', type: 'httpHeaderAuth', buildData: (value) => ({ name: 'Authorization', value: `Bearer ${value}` }) },
        },
      },
      { key: 'connectionId', label: 'Call Control connection ID', secretName: 'TELNYX_CONNECTION_ID' },
      { key: 'sipDomain', label: 'SIP domain (for rep extensions)', secretName: 'TELNYX_SIP_DOMAIN' },
      { key: 'defaultFromNumber', label: 'Default outbound number (E.164)', secretName: 'TELNYX_DEFAULT_FROM_NUMBER' },
      { key: 'demoLineNumber', label: 'Shared demo-line number (E.164)', secretName: 'TELNYX_DEMO_LINE_NUMBER' },
    ],
    hint:
      'Phase 5 — the one deliberately-deferred piece per the brief\'s own "genuine reason to wait" ' +
      '(SIP trunk / number verification queues). portal.telnyx.com → API Keys for the v2 key, Call ' +
      'Control → Connections for the connection ID, Voice → SIP Connections for the SIP domain reps ' +
      'dial their internal extensions through. All five values are placeholders ' +
      '(PLACEHOLDER_TELNYX_...) in every Phase 5 workflow until set here — dialer-place-call.workflow.json, ' +
      'telnyx-call-events-webhook.workflow.json, and demo-extension-auto-assign.workflow.json are ' +
      'built and waiting, not blocked on anything but this. Only the API key pushes automatically ' +
      '(to n8n, as the "Telnyx API" credential, once n8n is connected above) — the other four are ' +
      'read by workflows as n8n\'s own $env.TELNYX_... variables, not a named credential, so they ' +
      'have no remote-settable target the same way STRIPE_WEBHOOK_SECRET doesn\'t; add them to n8n\'s ' +
      'own environment directly (Docker Compose env / systemd unit on the Oracle box).',
    uncertain: true, // no CLI-auth path found for Telnyx (manual API key + portal-configured Call Control connection/SIP domain), and the exact number of setup steps in the Telnyx portal (SIP trunk creation, Call Control app, number search/ordering) isn't independently confirmed from this sandbox.
  },
];

/** The original checkpoint-2 pair, kept as a stable export in case anything still imports it.
 * Was (plunk, documenso) — swapped documenso for stripe when Documenso dropped out of the Phase 1
 * launch checklist (brief v2: "optional later upgrade, not an MVP dependency"). */
export const TEST_VENDORS: VendorDef[] = VENDORS.filter((v) => v.id === 'plunk' || v.id === 'stripe');

/** Documenso is NOT in `VENDORS` — brief v2 / `02 - Launch Checklist` v2 explicitly moved it out of
 * the Phase 1 credential set ("Deliberately NOT in this checklist... optional upgrade later, not
 * required for MVP e-sign"). MVP e-sign is the lightweight inline capture built directly into the
 * portal (typed name + checkbox + timestamp + IP) - no vendor account, so nothing to gather here.
 * Re-add a `documenso` VendorDef here if/when that upgrade path is actually pursued. */
