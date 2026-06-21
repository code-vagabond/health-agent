import { getAccessToken } from './auth.js';

const BASE_URL = 'https://health.googleapis.com/v4';

// "google-wearables" is the data source family that holds Fitbit/Pixel device data.
// https://developers.google.com/health/endpoints
export const GOOGLE_WEARABLES = 'users/me/dataSourceFamilies/google-wearables';

export interface QueryOptions {
  /** Use the reconcile endpoint (deduped, "what the Fitbit app shows") instead of the raw list. */
  reconcile?: boolean;
  /** Restrict reconcile to a data source family, e.g. GOOGLE_WEARABLES. */
  dataSourceFamily?: string;
  /** A Google Health API filter string, e.g. `sleep.interval.civil_end_time >= "2026-03-03"`. */
  filter?: string;
  /** Page size (maps to the API `pageSize` param). */
  limit?: number;
  pageToken?: string;
  /** Any extra raw query params, passed through verbatim. */
  extra?: Record<string, string>;
}

async function authedGet(pathAndQuery: string): Promise<any> {
  const token = await getAccessToken();
  const url = `${BASE_URL}/${pathAndQuery}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Google Health API ${resp.status} for ${url}\n${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Fetch data points for a data type. Data type identifiers are kebab-case in the
 * path (e.g. `body-fat`); filter field names are snake_case (e.g. `body_fat`).
 */
export async function getDataPoints(dataType: string, opts: QueryOptions = {}): Promise<any> {
  const params = new URLSearchParams();
  if (opts.filter) params.set('filter', opts.filter);
  if (opts.limit) params.set('pageSize', String(opts.limit));
  if (opts.pageToken) params.set('pageToken', opts.pageToken);
  if (opts.reconcile && opts.dataSourceFamily) params.set('dataSourceFamily', opts.dataSourceFamily);
  for (const [k, v] of Object.entries(opts.extra ?? {})) params.set(k, v);

  const verb = opts.reconcile ? 'dataPoints:reconcile' : 'dataPoints';
  const qs = params.toString();
  return authedGet(`users/me/dataTypes/${dataType}/${verb}${qs ? `?${qs}` : ''}`);
}

/** Escape hatch: GET any path under the v4 base, e.g. `users/me`. */
export async function rawGet(pathAndQuery: string): Promise<any> {
  return authedGet(pathAndQuery.replace(/^\/+/, ''));
}
