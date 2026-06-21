import {
  saveConfig,
  loadConfig,
  loadCreds,
  clearCreds,
  login,
  DEFAULT_SCOPES,
} from '../auth.js';

export function authSetup(args: { clientId?: string; clientSecret?: string; scopes?: string }) {
  if (!args.clientId || !args.clientSecret) {
    console.error('❌ --client-id and --client-secret are required.');
    console.error('   Create an OAuth "Desktop app" client in your Google Cloud project:');
    console.error('   https://developers.google.com/health/setup');
    process.exit(1);
  }
  const scopes = args.scopes ? args.scopes.split(/[ ,]+/).filter(Boolean) : DEFAULT_SCOPES;
  saveConfig({ clientId: args.clientId, clientSecret: args.clientSecret, scopes });
  console.error('✅ OAuth client saved to ~/.health-agent/config.json');
  console.error(`   Scopes: ${scopes.length} requested.`);
  console.error('   Next: health-agent auth:login');
}

export async function authLogin() {
  const config = loadConfig();
  if (!config) {
    console.error('❌ Not configured. Run `health-agent auth:setup` first.');
    process.exit(1);
  }
  try {
    const creds = await login();
    console.error('\n✅ Logged in. Token stored in ~/.health-agent/credentials.json');
    console.error(`   Granted scopes: ${creds.scope}`);
  } catch (e) {
    console.error(`\n❌ Login failed: ${(e as Error).message}`);
    process.exit(1);
  }
}

export function authStatus() {
  const config = loadConfig();
  const creds = loadCreds();
  const status = {
    configured: !!config,
    clientId: config?.clientId ? config.clientId.replace(/(.{8}).*/, '$1…') : null,
    loggedIn: !!creds,
    scope: creds?.scope ?? null,
    expiresAt: creds ? new Date(creds.expiresAt).toISOString() : null,
    expired: creds ? Date.now() >= creds.expiresAt : null,
    hasRefreshToken: !!creds?.refreshToken,
  };
  console.log(JSON.stringify(status, null, 2));
}

export function authLogout() {
  clearCreds();
  console.error('✅ Credentials cleared (OAuth client config kept).');
}
