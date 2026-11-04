import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectProject, parseJSONC, readIdentity, assets } from '../scripts/cloudflare-project.mjs';
import { expectedColumns, schemaShape, matchesOriginalMigration, schemaSQL } from '../scripts/audit-d1.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = { worker: 'test-survey-worker', database: 'test_survey_database', id: '00000000-0000-4000-8000-000000000001', binding: 'DB' };
const identity = { target, protected_workers: ['test-protected-worker'] };
function fixture(callback) {
  const folder = mkdtempSync(path.join(root, '.guard-test-'));
  mkdirSync(path.join(folder, 'public')); mkdirSync(path.join(folder, 'src'));
  writeFileSync(path.join(folder, 'src', 'index.js'), 'export default { fetch() {} };\n');
  writeFileSync(path.join(folder, 'package.json'), '{"scripts":{"deploy":"node scripts/cloudflare.mjs deploy"}}\n');
  const config = { name: target.worker, main: 'src/index.js', assets: { directory: './public', binding: 'ASSETS', run_worker_first: ['/api/*'] }, vars: { COLLECTION_ENABLED: 'false', FREE_TEXT_ENABLED: 'false', ENVIRONMENT: 'development' }, d1_databases: [{ binding: 'DB', database_name: target.database, database_id: target.id }] };
  const save = () => writeFileSync(path.join(folder, 'wrangler.jsonc'), JSON.stringify(config, null, 2) + '\n');
  save();
  writeFileSync(path.join(folder, 'identity.json'), JSON.stringify(identity));
  try { callback({ folder, config, save }); } finally { rmSync(folder, { recursive: true, force: true }); }
}
function install(folder, ...args) { return spawnSync(process.execPath, ['scripts/install-version-a.mjs', folder, path.join(folder, 'identity.json'), ...args], { cwd: root, encoding: 'utf8' }); }

test('JSONC handling preserves comment-like strings and escaped quotes', () => {
  assert.deepEqual(parseJSONC('{ // comment\n "url":"https://example.test/a/*b*/", "text":"comma,] and \\\"quote\\\"", /* comment */ "list":[1,2,], }'), { url: 'https://example.test/a/*b*/', text: 'comma,] and "quote"', list: [1,2] });
  assert.throws(() => parseJSONC('{/* unfinished'), /Unterminated/);
});
test('the protected original Worker and a reused or unexpected D1 binding are rejected', () => fixture(({ folder, config, save }) => {
  config.name = 'test-protected-worker'; save();
  assert.throws(() => inspectProject(folder, identity), /original application is protected/);
  assert.equal(install(folder, '--apply').status, 1);
  assert.deepEqual(readdirSync(path.join(folder, 'public')), []);
  config.name = target.worker; config.d1_databases[0].database_id = 'another-database'; save();
  assert.throws(() => inspectProject(folder, identity), /D1 binding/);
  assert.equal(install(folder, '--apply').status, 1);
  assert.deepEqual(readdirSync(path.join(folder, 'public')), []);
}));
test('a private identity cannot target a protected original application', () => fixture(({ folder }) => {
  writeFileSync(path.join(folder, 'identity.json'), JSON.stringify({ ...identity, target: { ...target, worker: identity.protected_workers[0] } }));
  assert.throws(() => readIdentity(path.join(folder, 'identity.json')), /protected original/);
}));
test('named environments and symlinked asset destinations are refused before copying', () => fixture(({ folder, config, save }) => {
  config.env = { production: { name: 'test-protected-worker' } }; save();
  assert.throws(() => inspectProject(folder, identity), /Named Wrangler environments/);
  delete config.env; save();
  symlinkSync(path.join(folder, 'src', 'index.js'), path.join(folder, 'public', 'index.html'));
  assert.throws(() => inspectProject(folder, identity), /Unsafe asset destination/);
}));
test('dry-run creates no assets or backup and apply preserves the backend, config, scripts and other assets', () => fixture(({ folder }) => {
  const protectedNames = ['wrangler.jsonc', 'package.json', 'src/index.js'];
  const before = Object.fromEntries(protectedNames.map(name => [name, readFileSync(path.join(folder, name), 'utf8')]));
  writeFileSync(path.join(folder, 'public', 'index.html'), 'previous frontend');
  writeFileSync(path.join(folder, 'public', 'keep.svg'), '<svg/>');
  const dry = install(folder); assert.equal(dry.status, 0, dry.stderr);
  assert.equal(readFileSync(path.join(folder, 'public', 'index.html'), 'utf8'), 'previous frontend');
  assert(!readdirSync(folder).includes('.review-backups'));
  const applied = install(folder, '--apply'); assert.equal(applied.status, 0, applied.stderr);
  for (const name of assets) assert.equal(readFileSync(path.join(folder, 'public', name), 'utf8'), readFileSync(path.join(root, 'public', 'v1', name), 'utf8'));
  for (const name of protectedNames) assert.equal(readFileSync(path.join(folder, name), 'utf8'), before[name]);
  assert.equal(readFileSync(path.join(folder, 'public', 'keep.svg'), 'utf8'), '<svg/>');
  const backup = path.join(folder, '.review-backups', readdirSync(path.join(folder, '.review-backups'))[0]);
  assert.equal(readFileSync(path.join(backup, 'index.html'), 'utf8'), 'previous frontend');
  assert.equal(JSON.parse(readFileSync(path.join(backup, 'manifest.json'), 'utf8')).filter(r=>r.previously_existed).length, 1);
  assert.equal(install(folder, '--apply').status, 0);
  assert.equal(readdirSync(path.join(folder, '.review-backups')).length, 1);
}));
test('schema inspection detects missing columns, changed constraints and altered indexes', () => {
  const response = [
    { success: true, results: expectedColumns.map(([name,type,notnull,pk,dflt_value],cid)=>({ cid,name,type,notnull,pk,dflt_value })) },
    { success: true, results: [{ name:'sqlite_autoindex_submissions_1',origin:'pk',unique:1,partial:0 },{ name:'idx_submissions_variant_time',origin:'c',unique:0,partial:0 },{ name:'idx_submissions_workshop_time',origin:'c',unique:0,partial:0 }] },
    { success: true, results: [{ seqno:0,name:'variant' },{ seqno:1,name:'submitted_at' }] },
    { success: true, results: [{ seqno:0,name:'workshop_code' },{ seqno:1,name:'submitted_at' }] },
  ];
  assert(matchesOriginalMigration(schemaShape(response)));
  for (const mutate of [r=>r[0].results.pop(),r=>{r[0].results[1].notnull=0;},r=>{r[2].results[0].name='language';}]) {
    const copy = structuredClone(response); mutate(copy); assert(!matchesOriginalMigration(schemaShape(copy)));
  }
  assert.throws(() => schemaShape([{ success:false }]), /Unexpected/);
  assert(schemaSQL.split(';').filter(x=>x.trim()).every(x=>x.trim().startsWith('PRAGMA ')));
});
