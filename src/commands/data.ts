import { getDataPoints, rawGet, GOOGLE_WEARABLES, QueryOptions } from '../api.js';

interface GetArgs {
  reconcile?: boolean;
  wearables?: boolean;
  source?: string;
  filter?: string;
  limit?: number;
  pageToken?: string;
}

function toOpts(args: GetArgs): QueryOptions {
  const reconcile = args.reconcile || args.wearables || !!args.source;
  return {
    reconcile,
    dataSourceFamily: args.source ?? (args.wearables ? GOOGLE_WEARABLES : undefined),
    filter: args.filter,
    limit: args.limit,
    pageToken: args.pageToken,
  };
}

function emit(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

export async function getData(dataType: string, args: GetArgs) {
  try {
    emit(await getDataPoints(dataType, toOpts(args)));
  } catch (e) {
    console.error(`❌ ${(e as Error).message}`);
    process.exit(1);
  }
}

export async function getRaw(path: string) {
  try {
    emit(await rawGet(path));
  } catch (e) {
    console.error(`❌ ${(e as Error).message}`);
    process.exit(1);
  }
}

export async function getProfile() {
  // Profile is its own sub-resource of the user (age, stride lengths, membership
  // start). It is NOT `users/me` (404) and NOT a dataType (`profile` is rejected
  // as an invalid data type id).
  await getRaw('users/me/profile');
}
