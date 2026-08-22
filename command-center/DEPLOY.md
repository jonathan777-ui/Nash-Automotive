# Deploying checkpoints 1 & 2 — auth gate, then the test-credential form

This session has no way to deploy a Worker, configure Cloudflare Access, or write to Secrets
Store — there's no `wrangler` CLI here, no API token, and the MCP tools available only *read*
Cloudflare account state (D1/KV/R2/Workers listing), not write to Workers/Access/Secrets Store.
So both checkpoints below are code-complete but **not deployed or verified** — that's on you,
from your machine, using the CLI-auth pattern the brief asked for (one browser click, no pasted
keys), all in the one session you said you'd do this in.

**Do checkpoint 1 (steps 1-5) fully before checkpoint 2 (steps 6+)** — the form in checkpoint 2
sits behind the same Access gate, so there's nothing to test it against until Access is live.

## 1. Install and authenticate

```
cd command-center
npm install
npx wrangler login   # opens a browser tab — one click, no key to copy/paste
```

## 2. First deploy (will run un-configured — that's expected and safe)

```
npx wrangler deploy
```

This publishes the Worker to a `*.workers.dev` URL (printed in the output) and prints the
Worker's ID — save both. Because `TEAM_DOMAIN`/`POLICY_AUD` in `wrangler.toml` are still
placeholders, the Worker will refuse every request with a 500 explaining why (see
`src/index.ts` — it fails closed on purpose). **Do not skip straight to relaxing that check** —
the next steps make it real instead.

## 3. Enable Cloudflare Access on this Worker

If your account doesn't have Zero Trust enabled yet (one-time, only needed once ever):
dash.cloudflare.com → **Zero Trust** → follow the setup prompt → pick a team name (this becomes
your `TEAM_DOMAIN`, e.g. team name `orbitai` → `orbitai.cloudflareaccess.com`).

Then, easiest path — dashboard:

1. **Workers & Pages** → `orbit-command-center` → **Settings** → **Domains & Routes**
2. Next to the `workers.dev` route, click **Enable Cloudflare Access**
3. Click **Manage Cloudflare Access** and set the policy: **Include** → **Emails ending in** →
   `orbitaiautomation.com` (matches what you asked for — anyone on the Workspace domain, not just
   your own address)
4. Save. On the Access application's **Overview** page, copy the **Application Audience (AUD)
   Tag**.

Equivalent via API, if you'd rather script it (needs an API token with **Zero Trust Access
Edit** permission, created at your Cloudflare profile → API Tokens):

```
curl "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/access/apps" \
  --request POST \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --json '{
    "type": "self_hosted",
    "name": "Orbit Command Center",
    "destinations": [{ "type": "worker", "worker_id": "<the Worker ID from step 2>" }],
    "policies": [{
      "decision": "allow",
      "include": [{ "email_domain": { "domain": "orbitaiautomation.com" } }]
    }]
  }'
```

The response's `aud` field is the same Audience Tag from the dashboard path.

## 4. Wire the real values in and redeploy

Edit `wrangler.toml`:

```toml
[vars]
TEAM_DOMAIN = "orbitai.cloudflareaccess.com"   # your actual Zero Trust team domain
POLICY_AUD = "<the Audience Tag from step 3>"
```

```
npx wrangler deploy
```

## 5. Verify (this is the actual checkpoint — code alone doesn't count)

- Visit the Worker's URL in an incognito window. You should land on a Cloudflare Access login
  page (email + one-time PIN — no separate identity-provider setup needed for this to work),
  **before** ever reaching the Worker.
- Sign in with an `@orbitaiautomation.com` address → you should land on the "You're in" page
  showing your verified email.
- Try an address on a different domain if you have one handy → Access should refuse it before
  the Worker ever sees the request.
- Try hitting the Worker's URL with `curl` (no Access session) → expect a 403 from Access itself,
  not a 500 from the Worker.

## 6. Create the Secrets Store (if it doesn't already exist)

```
npx wrangler secrets-store store create default --remote
```

Save the printed store ID.

## 7. Give the Worker its own bootstrap API token

This is the one credential that has to be pasted rather than CLI-authed — it's the credential
*this Worker* uses to write every other credential into Secrets Store, so it can't live in
Secrets Store itself.

1. Cloudflare dashboard → profile icon → **API Tokens** → **Create Token** → custom token with
   **Account → Secrets Store → Edit** permission, scoped to this account.
2. `cd command-center && npx wrangler secret put CF_API_TOKEN` and paste it when prompted (this
   goes into the Worker's encrypted secret storage, not `wrangler.toml`, and never touches your
   shell history).

## 8. Wire in the account/store IDs and redeploy

Edit `wrangler.toml`:

```toml
CF_ACCOUNT_ID = "<your Cloudflare account ID, from the dashboard URL or `wrangler whoami`>"
CF_SECRETS_STORE_ID = "<the store ID from step 6>"
```

```
npx wrangler deploy
```

## 9. Verify checkpoint 2 — this is where the unverified API guess gets tested

Visit the Worker's URL (through Access, as an `@orbitaiautomation.com` user) and submit a test
value for **Plunk** or **Documenso** — a throwaway string is fine, this is just proving the write
path, not onboarding a real key yet.

- **If it redirects back with a green "Saved ... to Secrets Store" banner and a secret ID**: the
  inferred API shape in `src/secretsStore.ts` was right. Confirm in the dashboard
  (**Secrets Store** → your store) that the secret actually appears, scoped to `workers`.
- **If it redirects back with a red error banner**: that's the raw Cloudflare API error message,
  not a swallowed generic failure — read `src/secretsStore.ts`'s header comment and fix the
  request shape there (most likely: the body needs to be a single object instead of a one-element
  array, or vice versa). Tell me what the error said and I'll fix it from here.

Once both checkpoints are verified, tell me the Worker's URL and that the two test secrets landed
correctly — checkpoint 3 (the full vendor field set, including which vendors get the CLI-auth
path instead of a paste form) picks up from there.
