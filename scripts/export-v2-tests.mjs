import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectProject,wranglerExecutable} from './cloudflare-project.mjs';
const [directory,databaseId,output]=process.argv.slice(2);
try{
  if(!directory||!databaseId||!output||!(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId)))throw new Error('Usage: node scripts/export-v2-tests.mjs CONFIGURED_PROJECT EXISTING_SURVEY_D1_UUID PRIVATE_OUTPUT.json');
  const p=inspectProject(directory,{target:{worker:'pulse-conjoint-survey',database:'pulse_conjoint_survey',id:databaseId,binding:'DB'},protected_workers:[]});
  const filename=path.resolve(output),source=path.resolve(new URL('../',import.meta.url).pathname);
  if(filename.startsWith(path.join(source,'public')+path.sep))throw new Error('Never export respondent records into the public asset directory.');
  const result=spawnSync(wranglerExecutable(p),['d1','execute','pulse_conjoint_survey','--remote','--json','--command','SELECT id,received_at,payload_json FROM survey_v2_test_submissions ORDER BY received_at'],{cwd:p.root,encoding:'utf8',maxBuffer:100*1024*1024});
  if(result.status!==0)throw new Error(result.stderr||'Export failed.');
  JSON.parse(result.stdout);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,result.stdout,{mode:0o600,flag:'wx'});
  console.log(`Saved the v2 instrument-test export to ${filename}. Existing submissions were not selected.`);
}catch(e){console.error(e.message);process.exitCode=1;}
