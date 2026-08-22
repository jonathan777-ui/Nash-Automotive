# Deploying checkpoint 1 — the auth gate

This session has no way to deploy a Worker, configure Cloudflare Access, or write to Secrets
Store — there's no `wrangler` CLI here, no API token, and the MCP tools available only *read*
Cloudflare account state (D1/KV/R2/Workers listing), not write to Workers/Access/Secrets Store.
So this checkpoint is code-complete but **not deployed or verified** — that's on you, from your
machine, using the CLI-auth pattern the brief asked for (one browser click, no pasted keys).

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

Once that's confirmed, tell me it's live (the URL is enough) and checkpoint 2 — the credential
intake form + Secrets Store writes — picks up from here.
