/** The two test credentials for checkpoint 2 ("form + Secrets Store write working for a
 * couple of test credentials"). Both are manual-paste-fallback vendors — neither has a known
 * CLI-auth option, so they exercise the fallback path the brief describes, not the CLI-auth
 * path (which doesn't go through this form at all — see command-center/README.md). The full
 * vendor list from `02 - Launch Checklist` (Oracle, GitHub, Netlify, Claude/Gemini/Grok, Twenty
 * CRM, n8n, Google Drive, backup storage, domain/DNS) is checkpoint 3 scope, not this one. */
export interface VendorDef {
  id: string;
  label: string;
  /** Name the secret is stored under in Secrets Store — matches what downstream services
   * (n8n, the scraper) will look up later. */
  secretName: string;
  hint: string;
}

export const TEST_VENDORS: VendorDef[] = [
  {
    id: 'plunk',
    label: 'Plunk (email sending)',
    secretName: 'PLUNK_API_KEY',
    hint: 'Plunk dashboard → Settings → API Keys → Secret Key',
  },
  {
    id: 'documenso',
    label: 'Documenso (e-sign)',
    secretName: 'DOCUMENSO_API_KEY',
    hint: 'Documenso → Settings → API Tokens → Create Token',
  },
];
