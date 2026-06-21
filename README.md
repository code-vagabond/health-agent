# health-agent

**Read your own Fitbit / Pixel health data from the command line — and let an AI agent drive it.**

A small CLI + Claude Code skill over the [Google Health API](https://developers.google.com/health) (the successor to the Fitbit Web API, which sunsets September 2026). Authenticates with Google OAuth 2.0 and pulls steps, sleep, exercise, body metrics, and profile data as JSON.

## Install

```bash
npm install -g health-agent     # installs the `health-agent` command
# or
pnpm install -g health-agent
```

As a Claude Code plugin (bundles the skill so Claude knows how to drive the CLI):

```bash
/plugin marketplace add code-vagabond/health-agent
/plugin install health-agent@health-agent
```

Local dev:

```bash
cd ~/code/health-agent && npm install && npm run build && npm link
```

## One-time setup

The login is human-in-the-loop by design — no agent can (or should) hold your Google login. ~10 minutes, once. **Tip:** ask Claude Code "set up health-agent" and it'll walk you through this step by step (see `SKILL.md`).

1. **Create a project** → https://console.cloud.google.com/projectcreate — name it, and keep it selected in the top bar for the rest.
2. **Enable the API** → https://console.cloud.google.com/apis/library/health.googleapis.com → **Enable**.
3. **Consent screen** → https://console.cloud.google.com/auth/audience
   - If it says *"Google Auth Platform not configured yet"*, click **Get started** and finish the short wizard (app name → support email → Audience: **External** → contact email → Create).
   - Keep **Publishing status = Testing** (skips the heavyweight restricted-scope verification). Trade-off: refresh tokens expire after 7 days — just `auth:login` again.
   - **Test users → + Add users** → add the **exact Google account your Fitbit/Pixel syncs to** (and that you'll log in with). Save.
4. **OAuth client** → https://console.cloud.google.com/auth/clients → **+ Create client** → Application type: **Desktop app** → Create. Copy the **Client ID** + **Secret**.
   - ⚠️ Must be **Desktop app**, not "Web application" — the CLI uses a `127.0.0.1` loopback redirect, and a Web client gives `redirect_uri_mismatch`.
5. **Configure + log in**:

   ```bash
   health-agent auth:setup --client-id <ID> --client-secret <SECRET>
   health-agent auth:login     # opens browser → Advanced → Go to … (unsafe) → Allow
   health-agent auth:status
   ```

Credentials live in `~/.health-agent/` (mode 600). Tokens refresh automatically.

**Gotcha:** *"Access blocked: … has not completed the Google verification process"* means the account you signed in with isn't on the **Test users** list (step 3) — add the exact account, save, retry. The softer *"Google hasn't verified this app"* warning is expected: click **Advanced → Go to … (unsafe) → Allow**.

## Usage

```bash
health-agent steps                       # reconciled Fitbit/Pixel steps
health-agent sleep
health-agent exercise
health-agent get body-fat --reconcile
health-agent get sleep -w \
  --filter 'sleep.interval.civil_end_time >= "2026-06-01"'
health-agent profile
health-agent raw 'users/me/dataTypes/steps/dataPoints'   # escape hatch
```

JSON goes to stdout, diagnostics to stderr — pipe to `jq` freely.

## Data model notes

- **Reconciled stream** (`--reconcile` / `-w`): deduped data matching what the Fitbit app shows. The plain list returns raw per-source data points.
- **Third-party logs (Hevy, Strava, …)** arrive via **Health Connect** (`dataSource.platform == "HEALTH_CONNECT"`) and are **excluded from the reconciled/wearables stream**. For workouts, use the plain `health-agent get exercise` (not `health-agent exercise`). Hevy stores the full set/rep/weight log as text in `.exercise.notes`.
- Data type ids in the **path** are kebab-case (`body-fat`); in **filter** expressions they're snake_case (`body_fat`).
- Source family for Fitbit/Pixel devices: `users/me/dataSourceFamilies/google-wearables`.
- Full data type + scope reference: https://developers.google.com/health/scopes

## Scopes requested by default (read-only)

`activity_and_fitness`, `sleep`, `health_metrics_and_measurements`, `profile`.
Override with `auth:setup --scopes "<space-separated full scope URLs>"`.

## License

MIT
