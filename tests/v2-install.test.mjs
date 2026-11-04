import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {argumentsFor,installationPlan} from '../scripts/install-v2.mjs';
const id='12345678-1234-4234-8234-123456789abc';
function fixture(name='pulse-conjoint-survey'){
  const directory=fs.mkdtempSync(path.join(fileURLToPath(new URL('../',import.meta.url)),'.guard-test-v2-'));
  fs.mkdirSync(path.join(directory,'src'));fs.mkdirSync(path.join(directory,'public'));
  fs.writeFileSync(path.join(directory,'src/index.js'),'export default {fetch(){return new Response("existing backend");}};\n');
  const config={name,main:'src/index.js',compatibility_date:'2026-10-01',assets:{directory:'public',binding:'ASSETS',run_worker_first:['/api/*']},
    d1_databases:[{binding:'DB',database_name:'pulse_conjoint_survey',database_id:id,jurisdiction:'eu'}],
    vars:{COLLECTION_ENABLED:'false',FREE_TEXT_ENABLED:'false',ENVIRONMENT:'development',TURNSTILE_SITE_KEY:'1x00000000000000000000AA',TURNSTILE_EXPECTED_HOSTNAME:'',EXISTING_VARIABLE:'retained'}};
  fs.writeFileSync(path.join(directory,'wrangler.jsonc'),'// Existing project\n'+JSON.stringify(config));return {directory,config};
}
test('only the exact survey target and database can be installed',()=>{
  const {directory}=fixture();try{assert.throws(()=>installationPlan({directory,databaseId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),/D1 binding/);assert.throws(()=>argumentsFor([directory,'--apply']),/UUID/);assert.throws(()=>argumentsFor([directory,'--database-id',id,'--deploy']),/Usage/);}finally{fs.rmSync(directory,{recursive:true});}
  const original=fixture('pulse-original');try{assert.throws(()=>installationPlan({directory:original.directory,databaseId:id}),/Only pulse-conjoint-survey/);}finally{fs.rmSync(original.directory,{recursive:true});}
});
test('dry-run makes no local changes and preserves all existing runtime settings in the plan',()=>{
  const {directory,config}=fixture();try{
    const before=fs.readFileSync(path.join(directory,'wrangler.jsonc'),'utf8'),p=installationPlan({directory,databaseId:id,collect:true});
    assert.equal(fs.readFileSync(path.join(directory,'wrangler.jsonc'),'utf8'),before);
    const planned=JSON.parse(p.content['wrangler.jsonc'].toString());
    assert.deepEqual(planned.d1_databases,config.d1_databases);for(const [key,v]of Object.entries(config.vars))assert.equal(planned.vars[key],v);
    assert.equal(planned.vars.SURVEY_V2_COLLECTION_ENABLED,'true');assert.deepEqual(planned.assets.run_worker_first,['/api/*','/api/v2/*']);
    assert(!Object.hasOwn(p.content,'src/index.js'));assert(p.content['worker/pulse-v2-entry.mjs'].toString().includes('../src/index.js'));
  }finally{fs.rmSync(directory,{recursive:true});}
});
test('local apply keeps the original backend byte-for-byte and supports a second update',()=>{
  const {directory,config}=fixture();try{
    const original=fs.readFileSync(path.join(directory,'src/index.js'));
    const args=['scripts/install-v2.mjs',directory,'--database-id',id,'--collect-tests','--apply'];
    const applied=spawnSync(process.execPath,args,{cwd:new URL('../',import.meta.url),encoding:'utf8'});
    assert.equal(applied.status,0,applied.stderr);assert(applied.stdout.includes('No Cloudflare operation'));
    assert(fs.readFileSync(path.join(directory,'src/index.js')).equals(original));assert(fs.existsSync(path.join(directory,'public/v1/index.html')));assert(fs.existsSync(path.join(directory,'public/v2/index.html')));
    const after=JSON.parse(fs.readFileSync(path.join(directory,'wrangler.jsonc'),'utf8'));assert.equal(after.vars.COLLECTION_ENABLED,'false');assert.equal(after.vars.SURVEY_V2_COLLECTION_ENABLED,'true');
    assert.equal(installationPlan({directory,databaseId:id,collect:true}).originalMain,'src/index.js');
    assert(fs.existsSync(path.join(directory,'.review-backups')));
  }finally{fs.rmSync(directory,{recursive:true});}
});
