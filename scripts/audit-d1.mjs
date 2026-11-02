import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { inspectProject, readIdentity, wranglerExecutable } from './cloudflare-project.mjs';

// Only metadata and schema queries. Never read submission records or run DDL.
export const schemaSQL = "PRAGMA table_info('submissions'); PRAGMA index_list('submissions'); PRAGMA index_info('idx_submissions_variant_time'); PRAGMA index_info('idx_submissions_workshop_time');";
export const expectedColumns = [
  ['id','TEXT',0,1,null], ['submitted_at','TEXT',1,0,"datetime('now')"],
  ['variant','TEXT',1,0,null], ['workshop_code','TEXT',1,0,null], ['participant_group','TEXT',1,0,null], ['language','TEXT',1,0,null],
  ['comprehension_score','INTEGER',0,0,null], ['sus_completed','INTEGER',1,0,'0'], ['sus_score','REAL',0,0,null], ['trust_score','REAL',0,0,null],
  ['wireless_acceptance','INTEGER',0,0,null], ['bidirectional_participation','INTEGER',0,0,null], ['payload_json','TEXT',1,0,null],
];
export function schemaShape(result) {
  if (!Array.isArray(result) || result.length !== 4 || result.some(r => r.success === false || !Array.isArray(r.results))) throw new Error('Unexpected Wrangler schema response. No match is asserted.');
  return {
    columns: [...result[0].results].sort((a,b)=>a.cid-b.cid).map(r=>[r.name,String(r.type).toUpperCase(),r.notnull,r.pk,r.dflt_value ?? null]),
    indexes: [...result[1].results].filter(r=>r.origin !== 'pk').map(r=>[r.name,r.unique,r.partial]).sort((a,b)=>a[0].localeCompare(b[0])),
    variant: [...result[2].results].sort((a,b)=>a.seqno-b.seqno).map(r=>r.name),
    workshop: [...result[3].results].sort((a,b)=>a.seqno-b.seqno).map(r=>r.name),
  };
}
export function matchesOriginalMigration(shape) {
  const expected = { columns: expectedColumns, indexes: [['idx_submissions_variant_time',0,0],['idx_submissions_workshop_time',0,0]], variant: ['variant','submitted_at'], workshop: ['workshop_code','submitted_at'] };
  return JSON.stringify(shape) === JSON.stringify(expected);
}

function runAudit() {
  const [directory, identityFile, sourceFlag, sourceName, ...extra] = process.argv.slice(2);
  if (extra.length || (sourceFlag && sourceFlag !== '--source-db') || (sourceFlag && !sourceName)) throw new Error('Usage: node scripts/audit-d1.mjs /path/to/existing/survey-project /path/to/private-identity.json [--source-db ACTUAL_SOURCE_DATABASE_NAME]');
  const identity = readIdentity(identityFile), target = identity.target;
  if (sourceName && (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(sourceName) || sourceName === target.database || sourceName === target.id)) throw new Error('Source must be the actual, separate original D1 database name.');
  const project = inspectProject(directory, identity), executable = wranglerExecutable(project);
  const query = args => {
    const result = spawnSync(executable, [...args, '--config', project.configPath, '--json'], { cwd: project.root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 4 * 1024 * 1024, shell: false });
    if (result.status !== 0) throw new Error('Read-only Wrangler inspection failed. Check your existing Wrangler sign-in and account locally; no deployment or migration was attempted.');
    try { return JSON.parse(result.stdout); } catch { throw new Error('Wrangler did not return JSON. No database match is asserted.'); }
  };
  const info = query(['d1','info',target.database]);
  const id = info.uuid ?? info.id;
  if (id !== target.id) throw new Error('Remote D1 UUID does not match the separate survey database. No schema query was run.');
  const shape = schemaShape(query(['d1','execute',target.database,'--remote','--command',schemaSQL]));
  const report = { worker_in_local_config: target.worker, binding_in_local_config: target.binding, database: info.name, database_id: id, jurisdiction: info.jurisdiction ?? 'not returned', matches_pulseapp_initial_submissions_schema: matchesOriginalMigration(shape), live_worker_binding_verified: false, respondent_records_read_or_copied: false, schema: shape };
  if (sourceName) {
    const source = query(['d1','info',sourceName]);
    if (!source.uuid && !source.id) throw new Error('Original D1 identity is missing.');
    if ((source.uuid ?? source.id) === id) throw new Error('Source and target are the same database.');
    report.source_database = source.name;
    report.source_database_id = source.uuid ?? source.id;
    report.matches_live_source_submissions_schema = JSON.stringify(shape) === JSON.stringify(schemaShape(query(['d1','execute',sourceName,'--remote','--command',schemaSQL])));
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.matches_pulseapp_initial_submissions_schema || report.matches_live_source_submissions_schema === false) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { runAudit(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
