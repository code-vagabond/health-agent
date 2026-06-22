#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { Argv } from 'yargs';
import { authSetup, authLogin, authStatus, authLogout } from './commands/auth.js';
import { getData, getRaw, getProfile } from './commands/data.js';

// Common query options shared by the data-reading commands.
const dataOpts = (y: Argv) =>
  y
    .option('reconcile', {
      describe: 'Use the reconciled stream (deduped — matches what the Fitbit app shows)',
      type: 'boolean',
      default: false,
    })
    .option('wearables', {
      alias: 'w',
      describe: 'Shortcut for --reconcile against the google-wearables (Fitbit/Pixel) source',
      type: 'boolean',
      default: false,
    })
    .option('source', {
      describe: 'Restrict to a data source family (implies --reconcile), e.g. users/me/dataSourceFamilies/google-wearables',
      type: 'string',
    })
    .option('filter', {
      alias: 'f',
      describe: 'Google Health filter, e.g. \'sleep.interval.civil_end_time >= "2026-03-03"\'',
      type: 'string',
    })
    .option('limit', { alias: 'n', describe: 'Max data points (pageSize)', type: 'number' })
    .option('page-token', { describe: 'Pagination token from a previous response', type: 'string' })
    .option('local', {
      describe: 'Add <field>Local wall-clock times (UTC + the record\'s UtcOffset) next to each UTC timestamp',
      type: 'boolean',
      default: false,
    });

yargs(hideBin(process.argv))
  .scriptName('health-agent')
  .usage('$0 <command> [options]')

  .command(
    'auth:setup',
    'Store your Google Cloud OAuth client (Desktop app type)',
    (y: Argv) =>
      y
        .option('client-id', { describe: 'OAuth client ID', type: 'string' })
        .option('client-secret', { describe: 'OAuth client secret', type: 'string' })
        .option('scopes', { describe: 'Space/comma separated scope override', type: 'string' }),
    (a) => authSetup({ clientId: a.clientId, clientSecret: a.clientSecret, scopes: a.scopes }),
  )
  .command('auth:login', 'Authorize via browser and store tokens', {}, () => authLogin())
  .command('auth:status', 'Show auth/config status (JSON)', {}, () => authStatus())
  .command('auth:logout', 'Clear stored credentials', {}, () => authLogout())

  .command(
    'get <dataType>',
    'Fetch data points for any data type (e.g. steps, sleep, exercise, body-fat)',
    (y: Argv) =>
      dataOpts(
        y.positional('dataType', {
          describe: 'Data type id (kebab-case), e.g. steps | sleep | exercise | body-fat',
          type: 'string',
        }) as Argv,
      ),
    (a) =>
      getData(a.dataType as string, {
        reconcile: a.reconcile,
        wearables: a.wearables,
        source: a.source,
        filter: a.filter,
        limit: a.limit,
        pageToken: a.pageToken as string | undefined,
        local: a.local,
      }),
  )

  // Convenience wrappers — default to the Fitbit/Pixel reconciled stream.
  .command('steps', 'Fetch step data (reconciled, Fitbit/Pixel)', dataOpts, (a) =>
    getData('steps', { ...(a as any), wearables: a.wearables || (!a.reconcile && !a.source) }),
  )
  .command('sleep', 'Fetch sleep data (reconciled, Fitbit/Pixel)', dataOpts, (a) =>
    getData('sleep', { ...(a as any), wearables: a.wearables || (!a.reconcile && !a.source) }),
  )
  .command('exercise', 'Fetch exercise/activity sessions (reconciled, Fitbit/Pixel)', dataOpts, (a) =>
    getData('exercise', { ...(a as any), wearables: a.wearables || (!a.reconcile && !a.source) }),
  )

  .command('profile', 'Fetch your user profile', {}, () => getProfile())

  .command(
    'raw <path>',
    'GET any path under the v4 base, e.g. "users/me/dataTypes/steps/dataPoints"',
    (y: Argv) =>
      y.positional('path', { describe: 'Path after https://health.googleapis.com/v4/', type: 'string' }),
    (a) => getRaw(a.path as string),
  )

  .demandCommand(1, 'Run a command. Try `health-agent --help`.')
  .strict()
  .help()
  .alias('h', 'help')
  .wrap(Math.min(120, process.stdout.columns ?? 120))
  .parse();
