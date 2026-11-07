import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildV3, writeBuild} from '../scripts/build-v3.mjs';
import {installationPlan, verifyExistingV2} from '../scripts/install-v3.mjs';
import {completeFixture, deploymentFixture} from '../scripts/v3-fixture.mjs';
import {DUMMY_SITE_KEY, SURVEY_ORIGIN, verifyV3} from '../scripts/verify-v3-live.mjs';
import v2 from '../public/v2/survey.json' with {type:'json'};

const root = fs.mkdtempSync(fileURLToPath(new URL('../.guard-test-v3-', import.meta.url)));
const {data, files} = buildV3();
writeBuild(root, files);
after(() => fs.rmSync(root, {recursive: true, force: true}));
const engine = await import(pathToFileURL(path.join(root,'public/v3/engine.mjs')));
const {presentationPath} = await import(pathToFileURL(path.join(root,'public/v3/layout.mjs')));
const {createV3Handler, validatePayload} = await import(pathToFileURL(path.join(root,'worker/v3-handler.mjs')));
const complete = (answers, settings, seed) => completeFixture(data, engine, answers, settings, seed);
const shown = state => engine.pathFor(data, state).flatMap(step => step.question_ids || []);
const tasks = state => engine.pathFor(data, state).filter(step => step.kind === 'choice');
const route = state => engine.derive(state.answers, state);
const demo = () => deploymentFixture(data, engine);

const nonDriver = {'A-MOB-01':[1,3], 'A-MOB-PRIMARY':3, 'R-DRIVE-01':2, 'A-JRN-02':3, 'A-VEH-01':1};
const noHousehold = {'A-VEH-ACCESS-01':3, 'A-FUT-ROLE':2};

test('build retains all v2 DCE tasks, scales, technology eligibility and outcome IDs', () => {
  assert.deepEqual(data.tasks, v2.tasks);
  assert.deepEqual(data.benefits, v2.benefits);
  for (const q of v2.questions.filter(q => /^[EFG]-/.test(q.id))) assert.deepEqual(data.questions.find(x => x.id === q.id), q);
  assert.deepEqual(engine.validateInstrument(data), []);
  assert.equal(data.meta.parent_content_sha256, v2.meta.content_sha256);
  assert.notEqual(data.meta.content_sha256, v2.meta.content_sha256);
});

test('core and expanded modes preserve the same task choice sequence and expose their own items', () => {
  const core = complete({}, {technology_override:'wpt'});
  const long = complete({}, engine.settingsFromURL('?profile=extended&technology=wpt'));
  assert.deepEqual(tasks(core), tasks(long));
  assert.equal(tasks(core).length, 12);
  assert.equal(shown(core).filter(id => id.startsWith('M3-') && id !== 'M3-BAR-01').length, 9);
  assert(!shown(core).includes('M3-ACCESS-01'));
  assert(shown(long).includes('M3-ACCESS-01'));
  assert(shown(long).includes('F3-WPT-STOP-01'));
  assert(!shown(long).some(id => id.startsWith('C-PCAP-')));
  assert(presentationPath(engine.pathFor(data, core), core).find(s => s.id === 'page-C3-planning').matrix);
  assert(presentationPath(engine.pathFor(data, core), core).length < engine.pathFor(data, core).length);
});

test('public, non-car future and informed household roles stay distinct', () => {
  const publicState = complete({...nonDriver, ...noHousehold, 'A-JRN-01':97, 'B-TRIP-CONTEXT':97});
  assert(route(publicState).publicRoute);
  assert(!shown(publicState).includes('A3-DRV-PT-01'));
  assert(!shown(publicState).some(id => id.startsWith('C-HAB-')));
  assert(shown(publicState).includes('M3-PSYC-01'));
  assert(shown(publicState).includes('M3-BAR-01'));
  assert(shown(publicState).includes('G-PUB-SUPPORT-POST-01'));
  assert.equal(tasks(publicState).length, 0);

  const future = complete({...nonDriver, ...noHousehold, 'A-FUT-ROLE':1, 'F-EVAL-W':1, 'F-EVAL-V':2});
  assert(route(future).privateRoute);
  assert.equal(route(future).technology, 'wpt');
  assert.equal(tasks(future).length, 12);
  assert(!shown(future).some(id => id.startsWith('D3-')));

  const known = complete({...nonDriver, 'A-CHG-ROLE':2, 'D3-CHG-HANDS-01':2}, {technology_override:'v2g', option_c_extended:true, review_both_dce:true});
  assert.equal(route(known).optionC.chargingExperience, 'arrangement_known');
  assert(!shown(known).includes('D3-EXPERIENCE-01'));
  assert(shown(known).includes('F3-V2G-CONN-01'));
  assert.equal(route(known).secondaryTechnology, null);
});

test('ICE, mixed powertrain, non-charging PHEV and work-only routes use distinct question sets', () => {
  const ice = complete({'A-HH-PT-01':[4], 'A3-DRV-PT-01':[4]});
  assert(shown(ice).includes('D3-ICE-01'));
  assert(!shown(ice).includes('D3-EXPERIENCE-01'));
  const mixed = complete({'A-HH-PT-01':[1,4], 'A3-DRV-PT-01':[1,4]}, {review_both_dce:true});
  assert(route(mixed).optionC.personalPlugDriving && route(mixed).optionC.personalNonPlugDriving);
  assert.equal(tasks(mixed).length, 19);
  assert(shown(mixed).includes('D3-EXPERIENCE-01'));
  assert(!shown(mixed).includes('D3-ICE-01'));
  const phev = complete({'A-HH-PT-01':[2], 'A3-DRV-PT-01':[2], 'A-CHG-ROLE':4});
  assert(!shown(phev).some(id => id.startsWith('D3-')));
  const professional = complete({...nonDriver, 'A-PRO-DRIVE-01':1, 'A-PRO-PT-01':[1], 'A3-DRV-PT-01':[97]}, {review_both_dce:true});
  assert(route(professional).optionC.professionalDriving);
  assert(!route(professional).optionC.personalDriving);
  assert.equal(route(professional).secondaryTechnology, null);
});

test('changing roles or the journey removes stale answers and preserves unrelated items', () => {
  let state = complete({}, {technology_override:'wpt', review_both_dce:true});
  state = engine.updateAnswer(data,state,'A-CHG-ROLE',4);
  assert.equal(state.answers['D3-CHG-HANDS-01'],undefined);
  assert.equal(state.answers['D3-EXPERIENCE-01'],undefined);
  state = engine.updateAnswer(data,state,'A-JRN-01',97);
  assert.equal(state.answers['C-HAB-01'],undefined);
  assert.equal(state.answers['C-INT-01'],undefined);
  assert.equal(state.answers['M3-PSYC-01'],1);
  state = engine.updateAnswer(data,state,'A3-DRV-PT-01',[97]);
  assert(!Object.keys(state.choices).some(id => data.tasks.find(t => t.id === id)?.block === 'v2g'));
});

test('maintenance and conditional intention retain their own behavioural references', () => {
  const maintenance = complete({...nonDriver, 'C-ALT-01':6, 'C-ALT-USED':4});
  assert.equal(route(maintenance).combTarget,'maintenance');
  const infeasible = complete({'C-ALT-01':97, 'C-ALT-02':97});
  assert(!shown(infeasible).includes('C-INT-01'));
  assert(shown(infeasible).includes('M3-BAR-01'));
  const conditional = complete({'C-ALT-01':97, 'C-ALT-02':4, 'C-COND-01':[1,4]});
  assert.equal(route(conditional).combTarget,'defined_conditional');
  assert(shown(conditional).includes('C-INT-01'));
});

test('server rejects wrong versions, unconsented, stale and forged answers and offers', () => {
  const payload = demo();
  assert.equal(validatePayload(data,payload).route.diagnostics.wpt,'shown');
  assert.throws(() => validatePayload(data,{...payload, instrument_version:v2.meta.version}), /unsupported/);
  assert.throws(() => validatePayload(data,{...payload, answers:{...payload.answers,'TEST-CONSENT-01':2}}), /consent/);
  assert.throws(() => validatePayload(data,{...payload, answers:{...payload.answers,'F3-V2G-CONN-01':1}}), /earlier or invalid route/);
  const bad = structuredClone(payload);
  bad.choices.find(c => c.status === 'answered').alternatives[0].label = 'forged offer';
  assert.throws(() => validatePayload(data,bad), /displayed offers/);
});

test('v3 API persists one labelled row in SQLite, isolates legacy tables and guards retries', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE submissions (id TEXT PRIMARY KEY); INSERT INTO submissions VALUES (\'legacy\');');
    sqlite.exec(fs.readFileSync(new URL('../migrations/0002_survey_v2_test.sql',import.meta.url),'utf8'));
    sqlite.exec(files['migrations/0003_survey_v3_test.sql']);
    const d1 = {prepare: sql => ({bind: (...args) => ({
      first: async () => sqlite.prepare(sql).get(...args),
      run: async () => ({meta:{changes:sqlite.prepare(sql).run(...args).changes}})
    })})};
    const env = {DB:d1, ENVIRONMENT:'development', TURNSTILE_SITE_KEY:DUMMY_SITE_KEY,
      SURVEY_V2_TURNSTILE_SECRET:'simulated-v2-dummy-secret', SURVEY_V3_COLLECTION_ENABLED:'true', SURVEY_V3_DAILY_CAP:'1'};
    const handler = createV3Handler(data, {fetcher:async (url, init) => {
      assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      const {secret,response} = JSON.parse(init.body);
      assert.equal(secret,env.SURVEY_V2_TURNSTILE_SECRET);
      return Response.json({success:response==='valid-test'});
    }});
    const send = (payload, token = 'valid-test', origin = SURVEY_ORIGIN) => handler(new Request(`${SURVEY_ORIGIN}/api/v3/submissions`, {
      method:'POST', headers:{origin,'content-type':'application/json'}, body:JSON.stringify({payload,turnstile_token:token})
    }),env);
    assert.equal(await handler(new Request(`${SURVEY_ORIGIN}/api/v2/config`),env),null);
    const cfg = await handler(new Request(`${SURVEY_ORIGIN}/api/v3/config`),env);
    assert((await cfg.json()).collection_enabled);
    const payload = {...demo(),local_comments:{test:'local only'}};
    assert.equal((await send(payload,'invalid')).status,403);
    assert.equal((await send(payload,'valid-test','https://other.example')).status,403);
    const saved = await send(payload);
    assert.equal(saved.status,201);
    assert.equal((await saved.json()).receipt_id,payload.session_id);
    assert.equal((await (await send(payload)).json()).duplicate,true);
    assert.equal((await send({...payload, answers:{...payload.answers,'M3-PSYC-01':2}})).status,409);
    assert.equal((await send({...payload,session_id:crypto.randomUUID()})).status,429);
    const row = sqlite.prepare('SELECT id, payload_json FROM survey_v3_test_submissions').get();
    assert.equal(row.id,payload.session_id);
    assert.equal(JSON.parse(row.payload_json).test_purpose,'deployment_check');
    assert(!Object.hasOwn(JSON.parse(row.payload_json),'local_comments'));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM survey_v3_test_submissions').get().n,1);
    assert.equal(sqlite.prepare('SELECT id FROM submissions').get().id,'legacy');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM survey_v2_test_submissions').get().n,0);
  } finally { sqlite.close(); }
});

test('installer wraps v2 and preserves its routes, assets, database and collection settings', () => {
  const directory = path.join(root,'configured');
  const databaseId = '12345678-1234-4234-8234-123456789abc';
  writeBuild(directory, {'public/v2/index.html':'v2 page', 'public/v2/survey.json':JSON.stringify(v2),
    'worker/pulse-v2-entry.mjs':'export default {};', 'worker/v2-handler.mjs':'// legacy v2 handler'});
  const config = {name:'pulse-conjoint-survey',main:'worker/pulse-v2-entry.mjs',assets:{directory:'public',binding:'ASSETS',run_worker_first:['/api/*']},
    d1_databases:[{binding:'DB',database_name:'pulse_conjoint_survey',database_id:databaseId}],
    vars:{COLLECTION_ENABLED:'false',SURVEY_V2_COLLECTION_ENABLED:'true',TURNSTILE_SITE_KEY:DUMMY_SITE_KEY}};
  const configPath = path.join(directory,'wrangler.jsonc');
  fs.writeFileSync(configPath,JSON.stringify(config));
  const plan = installationPlan({directory,databaseId,collect:true});
  const next = JSON.parse(plan.files['wrangler.jsonc']);
  assert.deepEqual(next.assets,config.assets);
  assert.deepEqual(next.d1_databases,config.d1_databases);
  assert.deepEqual(next.vars,{...config.vars,SURVEY_V3_COLLECTION_ENABLED:'true'});
  assert(!plan.changed.some(file => file.includes('/v2/') || file==='worker/pulse-v2-entry.mjs'));
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath,'utf8')),config);
  assert.throws(() => installationPlan({directory,databaseId:crypto.randomUUID()}),/D1 binding/);
  const live = {instrument_version:v2.meta.version,instrument_content_sha256:v2.meta.content_sha256,turnstile_site_key:DUMMY_SITE_KEY,collection_enabled:true};
  verifyExistingV2(plan.project,live);
  assert.throws(() => verifyExistingV2(plan.project,{...live,supported_layout_versions:['compact']}),/differs from the live/);
  fs.writeFileSync(configPath,JSON.stringify({...config,assets:{...config.assets,run_worker_first:['/api/v2/*']}}));
  assert.deepEqual(JSON.parse(installationPlan({directory,databaseId}).files['wrangler.jsonc']).assets.run_worker_first,['/api/v2/*','/api/v3/*']);
});

test('live verification waits for the right release and uses a repeatable deployment fixture', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push(url);
    if (calls.length === 1) return new Response('still propagating',{status:404});
    if (url.includes('/api/v3/config')) return Response.json({instrument_version:data.meta.version,
      instrument_content_sha256:data.meta.content_sha256, layout_version:engine.freshState().layout_version,
      collection_enabled:true,storage_ready:true,turnstile_site_key:DUMMY_SITE_KEY,capabilities:{option_c_profiles:['core','extended']}});
    if (url.endsWith('/v3/')) return new Response('<title>PULSE · Survey v3 test</title>');
    const {payload} = JSON.parse(init.body);
    assert.equal(payload.session_id,demo().session_id);
    assert.equal(payload.test_purpose,'deployment_check');
    return Response.json({receipt_id:payload.session_id,instrument_version:data.meta.version},{status:201});
  };
  const live = await verifyV3(root,{collection:true,fetcher,sleep:async()=>{}});
  assert.equal(calls.length,4);
  assert.equal(live.receipt,demo().session_id);
});
