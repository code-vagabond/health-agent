import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { URL } from 'node:url';

const CONFIG_DIR = path.join(os.homedir(), '.health-agent');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CREDS_FILE = path.join(CONFIG_DIR, 'credentials.json');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// Google Health API restricted scopes — read-only set that covers the common
// Fitbit data (activity/steps, sleep, body metrics, profile).
// Full list: https://developers.google.com/health/scopes
export const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
];

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

export interface Credentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  scope: string;
  tokenType: string;
}

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export function saveConfig(cfg: AppConfig) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function loadConfig(): AppConfig | null {
  // Env vars win, so the same machine can run headless (e.g. in CI / an agent).
  const envId = process.env.GOOGLE_CLIENT_ID;
  const envSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (envId && envSecret) {
    return {
      clientId: envId,
      clientSecret: envSecret,
      scopes: process.env.HEALTH_SCOPES?.split(/[ ,]+/).filter(Boolean) ?? DEFAULT_SCOPES,
    };
  }
  if (!fs.existsSync(CONFIG_FILE)) return null;
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as AppConfig;
}

function saveCreds(creds: Credentials) {
  ensureDir();
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function loadCreds(): Credentials | null {
  if (!fs.existsSync(CREDS_FILE)) return null;
  return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8')) as Credentials;
}

export function clearCreds() {
  if (fs.existsSync(CREDS_FILE)) fs.rmSync(CREDS_FILE);
}

function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function openBrowser(url: string) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  // `start` on Windows needs an empty title arg first; shell:true handles quoting.
  const args = process.platform === 'win32' ? ['', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
}

/**
 * Run the interactive OAuth login: spins up a localhost listener, opens the
 * consent screen in the browser, captures the redirect, and exchanges the code
 * for tokens. Requires an OAuth client of type "Desktop app" / "Web" whose
 * authorized redirect includes the printed loopback URL.
 */
export async function login(): Promise<Credentials> {
  const config = loadConfig();
  if (!config) {
    throw new Error(
      'No OAuth client configured. Run `health-agent auth:setup --client-id <id> --client-secret <secret>` first.',
    );
  }

  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  // The redirect_uri is decided once we know the bound port, and must be sent
  // identically to both the auth request and the token exchange.
  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>(
    (resolve, reject) => {
      const server = http.createServer((req, res) => {
        try {
          const reqUrl = new URL(req.url ?? '/', 'http://localhost');
          if (reqUrl.pathname !== '/callback') {
            res.writeHead(404).end();
            return;
          }
          const returnedState = reqUrl.searchParams.get('state');
          const err = reqUrl.searchParams.get('error');
          const gotCode = reqUrl.searchParams.get('code');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          if (err || !gotCode || returnedState !== state) {
            res.end('<h2>Authorization failed.</h2><p>You can close this tab and check the terminal.</p>');
            server.close();
            reject(new Error(err ?? (returnedState !== state ? 'state mismatch' : 'no code returned')));
            return;
          }
          res.end('<h2>✅ Connected.</h2><p>You can close this tab and return to the terminal.</p>');
          server.close();
          resolve({ code: gotCode, redirectUri: boundRedirectUri });
        } catch (e) {
          reject(e as Error);
        }
      });

      let boundRedirectUri = '';
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('failed to bind local callback server'));
          return;
        }
        boundRedirectUri = `http://127.0.0.1:${addr.port}/callback`;
        const authUrl = new URL(AUTH_ENDPOINT);
        authUrl.searchParams.set('client_id', config.clientId);
        authUrl.searchParams.set('redirect_uri', boundRedirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', config.scopes.join(' '));
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent'); // force a refresh_token every time
        authUrl.searchParams.set('code_challenge', challenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', state);

        console.error('\nOpening your browser to authorize the Google Health API…');
        console.error('If it does not open, paste this URL manually:\n');
        console.error(authUrl.toString() + '\n');
        openBrowser(authUrl.toString());
      });

      server.on('error', reject);
    },
  );

  return exchangeCode(config, code, verifier, redirectUri);
}

async function exchangeCode(
  config: AppConfig,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<Credentials> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Token exchange failed (${resp.status}): ${await resp.text()}`);
  }
  const json = (await resp.json()) as any;
  const creds: Credentials = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    scope: json.scope ?? config.scopes.join(' '),
    tokenType: json.token_type ?? 'Bearer',
  };
  saveCreds(creds);
  return creds;
}

async function refresh(config: AppConfig, creds: Credentials): Promise<Credentials> {
  if (!creds.refreshToken) {
    throw new Error('Access token expired and no refresh token available. Run `health-agent auth:login` again.');
  }
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    throw new Error(
      `Token refresh failed (${resp.status}): ${await resp.text()}\n` +
        'In OAuth "Testing" mode refresh tokens expire after 7 days — just run `health-agent auth:login` again.',
    );
  }
  const json = (await resp.json()) as any;
  const updated: Credentials = {
    ...creds,
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    scope: json.scope ?? creds.scope,
    // Google does not return a new refresh_token on refresh; keep the old one.
    refreshToken: json.refresh_token ?? creds.refreshToken,
  };
  saveCreds(updated);
  return updated;
}

/** Return a valid access token, refreshing transparently when needed. */
export async function getAccessToken(): Promise<string> {
  const config = loadConfig();
  if (!config) throw new Error('Not configured. Run `health-agent auth:setup` first.');
  let creds = loadCreds();
  if (!creds) throw new Error('Not logged in. Run `health-agent auth:login` first.');
  if (Date.now() >= creds.expiresAt - 60_000) {
    creds = await refresh(config, creds);
  }
  return creds.accessToken;
}
