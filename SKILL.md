---
name: health-agent
description: Pull your own Fitbit / Pixel health data (steps, sleep, exercise, body metrics, profile) from the Google Health API via the `health-agent` CLI. Use when the user wants to read, export, summarize, or analyze their Fitbit/Google health data.
homepage: https://developers.google.com/health
metadata: {"openclaw":{"emoji":"❤️","requires":{"bins":["health-agent"],"env":[]}}}
---

# health-agent

CLI wrapper around the **Google Health API** (the successor to the Fitbit Web API; legacy API sunsets September 2026). Authenticates with Google OAuth 2.0 and reads the caller's own health data.

| Property | Value |
|----------|-------|
| **name** | health-agent |
| **allowed-tools** | Bash(health-agent:*) |
| **API base** | `https://health.googleapis.com/v4` |

## ⚠️ Hard rules

1. **Auth is required.** Every data command fails without valid credentials. Check with `health-agent auth:status` first.
2. **This reads the authenticated user's OWN data only.** There is no way to pull someone else's data without their separate OAuth consent.
3. **Output is JSON on stdout**, diagnostics on stderr — safe to pipe to `jq`.

## First-time setup — agent onboarding playbook (human-in-the-loop)

If `health-agent auth:status` shows `"configured": false` (or the command isn't on PATH yet), the user has never set this up. **Walk them through the steps below ONE AT A TIME** — give the exact URL for the current step, tell them what to click, then *wait for them to confirm before moving to the next step*. Do NOT paste all steps at once; this flow has subtle gotchas and users get lost in a wall of links. An agent **cannot** do the Google login or the consent click — those are the human's job. Everything else (install, `auth:setup`, reading data) the agent does.

Why this is more involved than a typical CLI login: there is no public Google Health auth server, so the user must own their own Google Cloud OAuth client. This is a ~10-minute one-time setup.

### Step 0 — Install the CLI if it doesn't exist (agent does this)
If the `health-agent` command isn't on PATH, install it globally:
```bash
npm install -g health-agent
# or
pnpm install -g health-agent
```
npm package: https://www.npmjs.com/package/health-agent

### Step 1 — Create / pick a Google Cloud project (user)
→ https://console.cloud.google.com/projectcreate
Name it e.g. `health-agent`, click **Create**, and make sure it's the **selected project** in the top bar for every step after this.

### Step 2 — Enable the Google Health API (user)
→ https://console.cloud.google.com/apis/library/health.googleapis.com
Click **Enable**.

### Step 3 — Configure the consent screen / Google Auth Platform (user)
→ https://console.cloud.google.com/auth/audience
- **NEW console gotcha:** if it says *"Google Auth Platform not configured yet"*, click **Get started** and complete the short wizard first: App name (anything) → User support email → Audience: **External** → Contact email → agree → **Create**.
- Confirm **Publishing status = Testing** (do NOT publish — Testing mode skips the heavyweight restricted-scope verification review).
- Under **Test users** → **+ Add users** → add the user's Google account → **Save**.
- ⚠️ **The test-user account MUST be the exact same Google account whose Fitbit/Pixel data syncs**, and the same account they will sign in with at login. Ask the user which account their Fitbit/Pixel is tied to and confirm it matches.

### Step 4 — Create the OAuth client (user)
→ https://console.cloud.google.com/auth/clients  (in the new console, OAuth clients live here, NOT on the old `/apis/credentials` page)
**+ Create client** → Application type: **Desktop app** → **Create**.
- ⚠️ **It MUST be "Desktop app", NOT "Web application".** The CLI uses a `127.0.0.1` loopback redirect; a Web client without loopback redirects causes `redirect_uri_mismatch`. (Ignore any generic Google guide that says pick "Web Server".)
- Copy the **Client ID** and **Client Secret** (or download the JSON).

### Step 5 — Configure + log in (agent runs setup; user clicks Allow)
```bash
health-agent auth:setup --client-id <ID> --client-secret <SECRET>
health-agent auth:login      # opens the browser
health-agent auth:status     # verify "loggedIn": true
```
At the browser screen, tell the user to:
1. Pick the **test-user account** from Step 3.
2. On the **"Google hasn't verified this app"** warning (normal in Testing mode) → **Advanced** → **Go to health-agent (unsafe)**.
3. Tick the scope boxes → **Allow**.

`auth:login` runs a local loopback server and blocks until the user clicks Allow — run it in the background and watch its output for the `✅ Logged in` line, or have the user run it with a `! ` prefix.

`auth:setup` writes `~/.health-agent/config.json`; `auth:login` writes `~/.health-agent/credentials.json`. Tokens auto-refresh. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env vars override stored config for headless use.

### Setup troubleshooting (decision tree)
- **"Access blocked: health-agent has not completed the Google verification process"** (hard block, no "Advanced" option) → the signing-in account is **not on the Test users list**, or publishing status isn't "Testing". Fix Step 3: add the exact account, Save, wait ~1 min, retry. Most common cause: signing in with a different account than the one added.
- **"Google hasn't verified this app"** (soft warning with an Advanced link) → expected in Testing mode; click **Advanced → Go to … (unsafe) → Allow**.
- **`redirect_uri_mismatch`** → the OAuth client is a "Web" type. Recreate it as **Desktop app** (Step 4).
- **`invalid_grant` / refresh failed later on** → Testing-mode refresh tokens expire after **7 days**. Just re-run `health-agent auth:login`.
- **`403` / scope error on a data command** → that data type's scope wasn't granted at consent. Re-run `auth:setup` with the right `--scopes`, then `auth:login`.

## Reading data

```bash
# Convenience commands — default to the reconciled Fitbit/Pixel stream:
health-agent steps
health-agent sleep
health-agent exercise
health-agent resting-hr     # daily RESTING heart rate (one value/day, calc'd from sleep). Aliases: resting-heart-rate, rhr
health-agent bpm            # raw live heart-rate samples (latest spot reading, NOT resting). Aliases: heart-rate, hr

# Any data type (kebab-case id): steps, sleep, exercise, body-fat, ...
health-agent get steps --wearables --limit 50
health-agent get body-fat --reconcile

# Date filtering uses a Google Health filter string (field names are snake_case per data type):
health-agent get sleep --wearables \
  --filter 'sleep.interval.civil_end_time >= "2026-06-01"'

# Profile and escape hatch for any v4 path:
health-agent profile
health-agent raw 'users/me/dataTypes/steps/dataPoints:dailyRollUp'
```

### Flags (data commands)
- `--reconcile` — deduped stream (what the Fitbit app shows)
- `--wearables` / `-w` — reconcile against `google-wearables` (Fitbit/Pixel) source
- `--source <family>` — restrict to a data source family (implies reconcile)
- `--filter <expr>` / `-f` — Google Health API filter expression
- `--limit <n>` / `-n` — page size; `--page-token` — pagination

## ⚠️ Third-party / Health Connect data (Hevy, Strava, etc.) — READ THIS for any workout question

Data from third-party apps (e.g. **Hevy** strength logs, Strava, MyFitnessPal) reaches the Google Health API through **Health Connect**, NOT through the Fitbit cloud. These records have `dataSource.platform == "HEALTH_CONNECT"` and `dataSource.application.packageName` (e.g. `com.hevy`).

**The reconciled/wearables stream EXCLUDES them.** `--reconcile`, `--wearables`/`-w`, and the convenience commands (`steps`/`sleep`/`exercise`) reconcile against the `google-wearables` (Fitbit/Pixel) source only, so Health Connect sessions are silently dropped.

**Rule: when the user asks about workouts/training/exercise, ALWAYS query the plain (unreconciled) stream so third-party logs are included:**
```bash
health-agent get exercise -n 30          # NOT `health-agent exercise` (that one is wearables-only)
```
Then split by source to see everything:
```bash
# Third-party sessions (Hevy, Strava, …):
health-agent get exercise -n 30 | jq '.dataPoints[] | select(.dataSource.platform=="HEALTH_CONNECT")'
# Fitbit/Pixel auto-detected sessions:
health-agent get exercise -n 30 | jq '.dataPoints[] | select(.dataSource.platform=="FITBIT")'
```

**The full set/rep/weight log is in `.exercise.notes`.** Hevy writes the entire workout (every exercise, set, kg × reps, plus a `hevy.com/workout/<id>` link) as plain text into the `notes` field. `metricsSummary`/`exerciseMetadata` are usually `{}` for these — don't conclude "no detail," read `notes`:
```bash
health-agent get exercise -n 30 | jq -r '.dataPoints[]
  | select(.dataSource.application.packageName=="com.hevy")
  | "\(.exercise.interval.startTime)  (\((.exercise.activeDuration|sub("s";"")|tonumber/60|floor)) min)\n\(.exercise.notes)\n"'
```

A single workout often appears **twice**: once as the third-party log (e.g. Hevy `STRENGTH_TRAINING`, rich `notes`, no biometrics) and once as the Fitbit band's overlapping auto-detected session (e.g. `CARDIO_WORKOUT`, has HR/zones, no set log). Cross-reference by overlapping time window to combine the set log with the heart-rate signature.

## Install

```bash
cd ~/code/health-agent && npm install && npm run build && npm link
# or run without linking: node ~/code/health-agent/dist/index.js <command>
```

## Troubleshooting
For auth / setup errors (`invalid_grant`, `403` scope, `redirect_uri_mismatch`, "Access blocked", "Google hasn't verified this app") see the **Setup troubleshooting (decision tree)** at the end of the First-time setup playbook above.

Data-command notes:
- **Empty `dataPoints`** → no data in range, or the device hasn't synced. Widen the `--filter` window or confirm the Fitbit/Pixel app has synced recently.
- **Exercise field names** → each session's activity is under `.exercise.exerciseType` (enum, e.g. `WALKING`) with a friendly `.exercise.displayName` (e.g. `Walk`); rich metrics live under `.exercise.metricsSummary` (calories, distance, steps, avg HR, active-zone minutes). There is no `activityType` field.
- **`profile`** returns `age`, `membershipStartDate`, and configured walking/running stride lengths from `users/me/profile`.
