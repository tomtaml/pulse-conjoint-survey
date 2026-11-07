import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inspectProject, wranglerExecutable} from './cloudflare-project.mjs';
import {buildV3, writeBuild} from './build-v3.mjs';
import {DUMMY_SITE_KEY, SURVEY_ORIGIN, getV2Config, verifyV3} from './verify-v3-live.mjs';
import {VERSION} from '../v3/instrument.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const base = 'worker/pulse-v2-entry.mjs';
const entry = 'worker/pulse-v3-entry.mjs';
const migration = 'migrations/0003_survey_v3_test.sql';
const table = 'survey_v3_test_submissions';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const columns = ['id', 'received_at', 'instrument_version', 'schema_version', 'record_kind', 'site', 'language',
  'technology', 'respondent_route', 'active_ms', 'payload_sha256', 'payload_json'];
const indexNames = ['idx_survey_v3_test_received', 'idx_survey_v3_test_version_time'];
const digest = value => createHash('sha256').update(value).digest('hex');

export function parseArguments([directory, ...args]) {
  const flags = new Set(args);
  const idPosition = args.indexOf('--database-id');
  const databaseId = idPosition < 0 ? '' : args[idPosition + 1];
  const apply = flags.has('--apply'), deploy = flags.has('--deploy'), collect = flags.has('--collect-tests');
  if (!directory || !uuid.test(databaseId || '') || deploy && !apply ||
      args.some((arg, i) => i !== idPosition + 1 && !['--database-id','--apply','--deploy','--collect-tests'].includes(arg))) {
    throw new Error('Usage: node scripts/install-v3.mjs /path/to/survey-project --database-id EXISTING_D1_UUID [--collect-tests] [--apply --deploy]');
  }
  return {directory, databaseId, apply, deploy, collect};
}

function workerFirst(first) {
  if (first === true) return first;
  const routes = Array.isArray(first) ? first : [];
  const matches = (rule, target) => rule.endsWith('*') ? target.startsWith(rule.slice(0,-1)) : target === rule;
  const endpoints = ['/api/v3/config', '/api/v3/submissions'];
  if (routes.some(rule => rule.startsWith('!') && endpoints.some(target => matches(rule.slice(1), target)))) {
    throw new Error('An existing Worker-first exclusion covers v3. Review the existing routes before deploying.');
  }
  const additions = endpoints.filter(target => !routes.some(rule => matches(rule, target)));
  if (!additions.length) return first;
  if (!routes.some(rule => rule.startsWith('/api/v3/'))) return [...routes, '/api/v3/*'];
  return [...routes, ...additions];
}

function safePath(root, relative) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error(`Unsafe installation path: ${relative}`);
  for (let next = target; next !== root; next = path.dirname(next)) {
    try { if (fs.lstatSync(next).isSymbolicLink()) throw new Error(`Unsafe symlink: ${relative}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

export function installationPlan(options) {
  const identity = {target: {worker: 'pulse-conjoint-survey', database: 'pulse_conjoint_survey', id: options.databaseId, binding: 'DB'}, protected_workers: []};
  const project = inspectProject(options.directory, identity);
  if (project.root === fs.realpathSync(source) || project.assetPath !== path.join(project.root, 'public') ||
      ![base, entry].includes(project.config.main)) {
    throw new Error('Use the separate, configured conjoint survey project with its installed v2 Worker.');
  }
  for (const file of [base, 'worker/v2-handler.mjs', 'public/v2/index.html', 'public/v2/survey.json']) {
    if (!fs.statSync(safePath(project.root, file)).isFile()) throw new Error(`The installed v2 file is missing: ${file}`);
  }
  const {files} = buildV3();
  files[entry] = `// Route v3 first and delegate everything else to the existing v2 Worker.\nimport previous from './pulse-v2-entry.mjs';\nimport instrument from '../public/v3/survey.json' with {type:'json'};\nimport {createV3Handler} from './v3-handler.mjs';\nconst handleV3=createV3Handler(instrument);\nexport default {...previous,async fetch(request,env,ctx){const response=await handleV3(request,env);return response??previous.fetch.call(previous,request,env,ctx);}};\n`;
  const config = structuredClone(project.config);
  config.main = entry;
  config.vars = {...config.vars, SURVEY_V3_COLLECTION_ENABLED: String(options.collect)};
  config.assets.run_worker_first = workerFirst(config.assets.run_worker_first);
  files[path.relative(project.root, project.configPath)] = JSON.stringify(config, null, 2) + '\n';
  const changed = Object.keys(files).filter(file => {
    const target = safePath(project.root, file);
    return !fs.existsSync(target) || fs.readFileSync(target,'utf8') !== files[file];
  });
  return {project, target: identity.target, files, changed};
}

function run(project, args, inherit = false) {
  const result = spawnSync(wranglerExecutable(project), args, {
    cwd: project.root, encoding: 'utf8', stdio: inherit ? 'inherit' : ['ignore','pipe','pipe'], maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message || `Wrangler ${args.join(' ')} failed.`);
  return result.stdout || '';
}

function runJSON(project, args) {
  const raw = run(project, args);
  // Wrangler may emit an update banner before its JSON result.
  for (const offset of [0, ...[...raw.matchAll(/^[\[{]/gm)].map(m => m.index)]) {
    try { return JSON.parse(raw.slice(offset)); } catch {}
  }
  throw new Error(`Wrangler ${args.slice(0,2).join(' ')} did not return JSON.`);
}

function query(plan, sql) {
  const out = runJSON(plan.project, ['d1','execute',plan.target.database,'--remote','--json',`--command=${sql}`]);
  const results = Array.isArray(out) ? out : [out];
  if (results.some(result => result.success === false)) throw new Error('The D1 command did not succeed.');
  return results.flatMap(result => result.results || []);
}

function existingSchema(plan) {
  return query(plan, "SELECT type, name, sql FROM sqlite_schema WHERE tbl_name IN ('submissions','survey_v2_test_submissions') ORDER BY type, name");
}

export function verifyExistingV2(project, live) {
  const instrument = JSON.parse(fs.readFileSync(path.join(project.root,'public/v2/survey.json'), 'utf8'));
  const handler = fs.readFileSync(path.join(project.root,'worker/v2-handler.mjs'), 'utf8');
  const localCompact = handler.includes('supported_layout_versions');
  if (live.instrument_version !== instrument.meta.version || live.instrument_content_sha256 !== instrument.meta.content_sha256 ||
      Boolean(live.supported_layout_versions) !== localCompact || live.turnstile_site_key !== project.config.vars?.TURNSTILE_SITE_KEY ||
      live.collection_enabled !== (project.config.vars?.SURVEY_V2_COLLECTION_ENABLED === 'true')) {
    throw new Error('Local v2 differs from the live v2 release. Use the last deployed conjoint project so v3 does not republish a different v2.');
  }
}

async function verifyV2Assets(project, compact) {
  const files = ['index.html', 'app.mjs', 'engine.mjs', 'styles.css', 'survey.json'];
  if (compact) files.push('layout.mjs', 'matrix.mjs');
  await Promise.all(files.map(async file => {
    const response = await fetch(`${SURVEY_ORIGIN}/v2/${file === 'index.html' ? '' : file}`, {cache: 'no-store', signal: AbortSignal.timeout(15000)});
    if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== digest(fs.readFileSync(path.join(project.root,'public/v2',file)))) {
      throw new Error(`Local v2 asset ${file} differs from the live release. Use the last deployed conjoint checkout.`);
    }
  }));
}

function checkStorage(plan) {
  const schema = () => query(plan, `PRAGMA table_info('${table}')`).map(row => row.name);
  const indexes = () => query(plan, `SELECT name FROM sqlite_schema WHERE type='index' AND tbl_name='${table}' AND name NOT LIKE 'sqlite_%' ORDER BY name`).map(row => row.name);
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const current = schema();
  if (current.length && !same(current, columns)) throw new Error('The existing v3 test table has an unexpected schema.');
  if (!current.length || !same(indexes(), indexNames)) {
    // Small, additive DDL through the query API. No D1 file-import step.
    query(plan, plan.files[migration]);
  }
  if (!same(schema(), columns) || !same(indexes(), indexNames)) throw new Error('The v3 test storage could not be verified.');
}

function install(plan) {
  if (!plan.changed.length) return null;
  const root = plan.project.root;
  const backup = safePath(root, `.review-backups/survey-v3-${Date.now()}`);
  fs.mkdirSync(backup, {recursive: true});
  for (const file of plan.changed) {
    const existing = path.join(root, file);
    if (fs.existsSync(existing)) {
      fs.mkdirSync(path.dirname(path.join(backup, file)), {recursive: true});
      fs.copyFileSync(existing, path.join(backup, file));
    }
  }
  fs.writeFileSync(path.join(backup,'manifest.json'), JSON.stringify({version: VERSION, changed: plan.changed}, null, 2) + '\n');
  writeBuild(root, Object.fromEntries(plan.changed.map(file => [file, plan.files[file]])));
  for (const [file, bytes] of Object.entries(plan.files)) {
    if (digest(fs.readFileSync(path.join(root, file))) !== digest(bytes)) throw new Error(`Installed bytes differ: ${file}`);
  }
  return backup;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const plan = installationPlan(options), p = plan.project;
  console.log(JSON.stringify({mode: options.apply ? 'apply' : 'dry-run', worker: plan.target.worker, database: plan.target.database,
    version: VERSION, changed_files: plan.changed, v3_test_collection: options.collect}, null, 2));
  if (!options.apply) return;
  let liveV2, oldSchema;
  if (options.deploy) {
    const info = runJSON(p, ['d1','info',plan.target.database,'--json']);
    if (info.uuid !== plan.target.id || info.name !== plan.target.database || info.jurisdiction !== 'eu') throw new Error('The expected EU conjoint D1 database was not found.');
    liveV2 = await getV2Config();
    verifyExistingV2(p, liveV2);
    await verifyV2Assets(p, Boolean(liveV2.supported_layout_versions));
    oldSchema = existingSchema(plan);
    if (!['submissions','survey_v2_test_submissions'].every(name => oldSchema.some(row => row.type === 'table' && row.name === name))) {
      throw new Error('Expected existing submissions tables are missing.');
    }
    if (options.collect) {
      const key = p.config.vars?.TURNSTILE_SITE_KEY;
      const dummy = key === DUMMY_SITE_KEY;
      const validDummy = dummy && p.config.vars.ENVIRONMENT === 'development' && !p.config.vars.TURNSTILE_EXPECTED_HOSTNAME;
      const secrets = runJSON(p, ['secret','list']).map(s => s.name);
      const names = ['SURVEY_V3_TURNSTILE_SECRET', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_SECRET', ...(validDummy ? ['SURVEY_V2_TURNSTILE_SECRET'] : [])];
      if (!key || dummy && !validDummy || !names.some(name => secrets.includes(name) || p.config.vars?.[name])) {
        throw new Error('V3 needs the configured Turnstile site key and a matching existing validation secret. Settings were not changed.');
      }
    }
  }
  const backup = install(plan);
  console.log(backup ? `Installed v3. Backup: ${backup}` : 'V3 files are already installed.');
  if (!options.deploy) return;
  run(p, ['deploy','--dry-run','--keep-vars'], true);
  if (options.collect) checkStorage(plan);
  if (JSON.stringify(oldSchema) !== JSON.stringify(existingSchema(plan))) throw new Error('An existing table definition changed during the check. Deployment stopped.');
  run(p, ['deploy','--keep-vars'], true);
  const live = await verifyV3(p.root, {collection: options.collect});
  const after = await getV2Config();
  if (JSON.stringify(after) !== JSON.stringify(liveV2)) throw new Error('Live v2 configuration differs from the pre-deployment check.');
  if (live.receipt) {
    if (!uuid.test(live.receipt)) throw new Error('Invalid deployment-check receipt.');
    const records = query(plan, `SELECT id, instrument_version, json_extract(payload_json,'$.test_purpose') AS purpose FROM ${table} WHERE id='${live.receipt}'`);
    if (records.length !== 1 || records[0].purpose !== 'deployment_check' || records[0].instrument_version !== VERSION) {
      throw new Error('The labelled v3 receipt could not be read back from the EU database.');
    }
  }
  console.log(JSON.stringify({published: true, ...live, v2_config_verified: true, backup}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
