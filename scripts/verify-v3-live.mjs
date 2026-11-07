import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {LAYOUT, PROFILES, VERSION} from '../v3/instrument.mjs';
import {deploymentFixture} from './v3-fixture.mjs';

export const SURVEY_ORIGIN = 'https://pulse-conjoint-survey.tom-tamlander.workers.dev';
export const DUMMY_SITE_KEY = '1x00000000000000000000AA';

export async function getV2Config(fetcher = fetch) {
  const response = await fetcher(`${SURVEY_ORIGIN}/api/v2/config`, {cache: 'no-store', signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`The existing live v2 configuration returned HTTP ${response.status}.`);
  const config = await response.json();
  if (typeof config.instrument_version !== 'string' || typeof config.collection_enabled !== 'boolean') {
    throw new Error('The existing live v2 configuration could not be verified.');
  }
  return config;
}

export async function verifyV3(root, {collection, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'public/v3/survey.json'), 'utf8'));
  let config, lastError;
  const deadline = Date.now() + 90000;
  for (let attempt = 0; attempt < 18 && Date.now() < deadline; attempt++) {
    try {
      const response = await fetcher(`${SURVEY_ORIGIN}/api/v3/config?check=${Date.now()}`, {
        cache: 'no-store', signal: AbortSignal.timeout(Math.min(10000, Math.max(1, deadline - Date.now())))
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from the configuration endpoint`);
      const candidate = await response.json();
      if (candidate.instrument_version !== VERSION || candidate.instrument_content_sha256 !== data.meta.content_sha256 ||
          candidate.layout_version !== LAYOUT || !PROFILES.every(profile => candidate.capabilities?.option_c_profiles?.includes(profile))) {
        throw new Error('The edge is serving a different instrument or layout');
      }
      if (candidate.collection_enabled !== collection || (collection && !candidate.storage_ready)) {
        throw new Error('The expected v3 test collection state is still unavailable');
      }
      config = candidate;
      break;
    } catch (error) { lastError = error.message; }
    await sleep(1800);
  }
  if (!config) throw new Error(`Cloudflare published the Worker, but v3 readiness is unverified: ${lastError}. Rerun the installer to verify.`);

  const url = `${SURVEY_ORIGIN}/v3/`;
  const page = await fetcher(url, {cache: 'no-store', signal: AbortSignal.timeout(15000)});
  if (!page.ok || !(await page.text()).includes('Survey v3 test')) throw new Error('The v3 respondent page did not return its expected HTML.');
  const ready = {url, instrument_version: VERSION, layout_version: LAYOUT,
    collection_enabled: config.collection_enabled, storage_ready: config.storage_ready};
  if (!collection || config.turnstile_site_key !== DUMMY_SITE_KEY) return ready;

  const engine = await import(pathToFileURL(path.join(root, 'public/v3/engine.mjs')));
  const payload = deploymentFixture(data, engine);
  const response = await fetcher(`${SURVEY_ORIGIN}/api/v3/submissions`, {
    method: 'POST', headers: {origin: SURVEY_ORIGIN, 'content-type': 'application/json'},
    body: JSON.stringify({payload, turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX'}), signal: AbortSignal.timeout(25000)
  });
  const receipt = await response.json();
  if (!response.ok || receipt.receipt_id !== payload.session_id || receipt.instrument_version !== VERSION) {
    throw new Error(receipt.message || 'A labelled v3 deployment check could not be saved.');
  }
  return {...ready, receipt: receipt.receipt_id};
}
