import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parseJSONC,inspectProject,wranglerExecutable} from './cloudflare-project.mjs';
import {validateInstrument,VERSION} from '../public/v2/engine.mjs';
import {COMPACT_LAYOUT} from '../public/v2/layout.mjs';
import {verifyLive} from './verify-v2-live.mjs';

const SOURCE=fileURLToPath(new URL('../',import.meta.url));
const MAIN='worker/pulse-v2-entry.mjs';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function argumentsFor(argv){
  const [directory,...args]=argv,options={directory,apply:false,deploy:false,collect:false,databaseId:null,identity:null};
  for(let i=0;i<args.length;i++)switch(args[i]){
    case '--apply':options.apply=true;break;case '--deploy':options.deploy=true;break;case '--collect-tests':options.collect=true;break;
    case '--database-id':options.databaseId=args[++i];break;case '--identity':options.identity=args[++i];break;
    default:throw new Error(`Unknown option ${args[i]}`);
  }
  if(!directory||options.deploy&&!options.apply)throw new Error('Usage: node scripts/install-v2.mjs /path/to/configured-survey-project --database-id EXISTING_SURVEY_D1_UUID [--collect-tests] [--apply --deploy]');
  if(options.identity){const local=JSON.parse(fs.readFileSync(options.identity,'utf8'));if(local.target?.worker!=='pulse-conjoint-survey'||local.target?.database!=='pulse_conjoint_survey'||local.target?.binding!=='DB')throw new Error('Identity file does not describe the conjoint survey.');options.databaseId=local.target.id;}
  if(!uuid.test(options.databaseId||''))throw new Error('Supply the existing separate survey D1 UUID with --database-id or the existing private --identity file.');
  return options;
}
function filesBelow(root,base=''){
  const files=[];for(const e of fs.readdirSync(path.join(root,base),{withFileTypes:true})){const name=path.join(base,e.name);if(e.isSymbolicLink())throw new Error('Source symlinks are not supported.');if(e.isDirectory())files.push(...filesBelow(root,name));else if(e.isFile())files.push(name);}return files;
}
export function installationPlan(options){
  const identity={target:{worker:'pulse-conjoint-survey',database:'pulse_conjoint_survey',id:options.databaseId,binding:'DB'},protected_workers:[]};
  const project=inspectProject(options.directory,identity);
  if(project.root===fs.realpathSync(SOURCE))throw new Error('The source release must be separate from the configured Cloudflare project.');
  if(project.assetPath!==path.join(project.root,'public'))throw new Error('This release supports the established public/ asset directory.');
  const manifestPath=path.join(project.root,'.private/survey-v2-install.json');
  const previous=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):null;
  const originalMain=project.config.main===MAIN?previous?.original_main:project.config.main;
  if(!originalMain||originalMain===MAIN)throw new Error('The original Worker entrypoint cannot be established. No files changed.');
  const original=path.resolve(project.root,originalMain);
  if(!original.startsWith(project.root+path.sep)||fs.realpathSync(original)!==original||!fs.statSync(original).isFile())throw new Error('The existing Worker must be a real file inside the configured project.');
  const instrument=JSON.parse(fs.readFileSync(path.join(SOURCE,'public/v2/survey.json'),'utf8'));
  const errors=validateInstrument(instrument);if(errors.length)throw new Error(errors.join(' '));
  const frozen=JSON.parse(fs.readFileSync(path.join(SOURCE,'instruments/v2-manifest.json'),'utf8'));
  if(digest(fs.readFileSync(path.join(SOURCE,'public/v2/survey.json')))!==frozen.sha256||instrument.meta.version!==VERSION)throw new Error('The release instrument and manifest do not match.');
  const content={};
  for(const relative of [...filesBelow(path.join(SOURCE,'public/v2')).map(f=>'public/v2/'+f),...filesBelow(path.join(SOURCE,'public/v1')).map(f=>'public/v1/'+f),
    'public/index.html','worker/v2-handler.mjs','migrations/0002_survey_v2_test.sql'])content[relative]=fs.readFileSync(path.join(SOURCE,relative));
  const relativeMain=path.relative(path.dirname(path.join(project.root,MAIN)),original).split(path.sep).join('/');
  const importMain=relativeMain.startsWith('.')?relativeMain:'./'+relativeMain;
  content[MAIN]=Buffer.from(`// PULSE v2 adapter. The original Worker module remains unchanged.\nimport legacy from ${JSON.stringify(importMain)};\nimport instrument from '../public/v2/survey.json' with {type:'json'};\nimport {createV2Handler} from './v2-handler.mjs';\nconst handleV2=createV2Handler(instrument);\nexport default {...legacy,async fetch(request,env,ctx){const response=await handleV2(request,env,ctx);return response||legacy.fetch.call(legacy,request,env,ctx);}};\n`);
  const config=structuredClone(project.config);config.main=MAIN;config.vars={...config.vars,SURVEY_V2_COLLECTION_ENABLED:String(options.collect)};
  const first=config.assets.run_worker_first;
  if(first!==true){
    const routes=Array.isArray(first)?first:[],v2='/api/v2/*';
    // Reuse an existing prefix rule such as /api/* rather than adding a
    // redundant child rule. Also repair configurations from an earlier attempt.
    const covered=routes.some(route=>!route.startsWith('!')&&route!==v2&&route.endsWith('*')&&!route.slice(0,-1).includes('*')&&v2.startsWith(route.slice(0,-1)));
    config.assets.run_worker_first=covered?routes.filter(route=>route!==v2):[...new Set([...routes,v2])];
  }
  const configRelative=path.relative(project.root,project.configPath);content[configRelative]=Buffer.from(JSON.stringify(config,null,2)+'\n');
  for(const relative of Object.keys(content)){
    const target=path.join(project.root,relative);if(!target.startsWith(project.root+path.sep))throw new Error('Unsafe target path.');
    let cursor=target;while(cursor!==project.root){if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw new Error(`Refusing symlink destination ${relative}`);cursor=path.dirname(cursor);}
  }
  const changed=Object.keys(content).filter(f=>!fs.existsSync(path.join(project.root,f))||!content[f].equals(fs.readFileSync(path.join(project.root,f))));
  return {project,identity,content,changed,originalMain,originalHash:digest(fs.readFileSync(original)),manifestPath};
}
function run(project,args,{input,inherit=false}={}){
  const result=spawnSync(wranglerExecutable(project),args,{cwd:project.root,input,encoding:'utf8',stdio:inherit?'inherit':['pipe','pipe','pipe'],maxBuffer:8*1024*1024});
  if(result.error||result.status!==0)throw new Error(inherit?`Wrangler ${args[0]} failed. Local backups are available; publication is not verified.`:(result.stderr||result.stdout||result.error?.message||'Wrangler failed.').slice(0,5000));
  return result.stdout||'';
}
function parseOutput(text){try{return JSON.parse(text);}catch{for(const start of [text.indexOf('['),text.indexOf('{')])if(start>=0){try{return JSON.parse(text.slice(start));}catch{}}throw new Error('Wrangler did not return readable JSON.');}}
function query(project,database,sql){const out=parseOutput(run(project,['d1','execute',database,'--remote','--json','--command',sql]));return Array.isArray(out)?out.flatMap(x=>x.results||[]):out.results||[];}
function backup(plan){
  const root=path.join(plan.project.root,'.review-backups',`survey-v2-${Date.now()}`);fs.mkdirSync(root,{recursive:true});const items=[];
  for(const relative of plan.changed){const target=path.join(plan.project.root,relative),exists=fs.existsSync(target);if(exists){fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.copyFileSync(target,path.join(root,relative));}items.push({file:relative,previously_existed:exists,new_sha256:digest(plan.content[relative])});}
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({version:VERSION,original_main:plan.originalMain,files:items},null,2)+'\n',{flag:'wx'});return root;
}
async function main(){
  const options=argumentsFor(process.argv.slice(2)),plan=installationPlan(options),p=plan.project,target=plan.identity.target;
  console.log(JSON.stringify({mode:options.apply?'apply':'dry-run',worker:target.worker,database:target.database,database_id:target.id,
    instrument_version:VERSION,changed_files:plan.changed,test_collection:options.collect?'enabled for v2 only':'disabled',
    preserved:['original Worker source','existing D1 bindings and submissions','existing COLLECTION_ENABLED, FREE_TEXT_ENABLED, ENVIRONMENT and Turnstile variables','other Workers'],
    remote_operations:options.deploy?['verify existing EU database identity',...(options.collect?['create only the v2 test table/indexes if absent']:[]),'publish the same survey Worker','verify live v2 configuration',...(options.collect?['write one labelled deployment-check record and read back its receipt metadata']:[])]:[]},null,2));
  if(!options.apply){console.log('Dry-run only. No local or Cloudflare changes.');return;}
  let oldSchema,secretNames=[],needsTestSecret=false;
  if(options.deploy){
    const info=parseOutput(run(p,['d1','info',target.database,'--json']));
    if(info.uuid!==target.id||info.name!==target.database||info.jurisdiction!=='eu')throw new Error('Remote D1 identity or EU jurisdiction differs from the established survey database. Nothing installed.');
    oldSchema=query(p,target.database,"SELECT name,type,sql FROM sqlite_master WHERE name='submissions' OR name LIKE 'idx_submissions_%' ORDER BY name");
    if(!oldSchema.some(r=>r.name==='submissions'))throw new Error('The expected existing submissions table is missing. Nothing installed.');
    if(options.collect){
      if(p.config.vars?.ENVIRONMENT!=='development'||p.config.vars?.TURNSTILE_SITE_KEY!=='1x00000000000000000000AA')throw new Error('This release activates instrument tests using the established development test-key setup. Other configurations require review; nothing installed.');
      const secrets=parseOutput(run(p,['secret','list']));secretNames=(Array.isArray(secrets)?secrets:secrets.secrets||[]).map(s=>s.name);
      const developmentTest=p.config.vars?.ENVIRONMENT==='development'&&p.config.vars?.TURNSTILE_SITE_KEY==='1x00000000000000000000AA';
      needsTestSecret=developmentTest?!secretNames.includes('SURVEY_V2_TURNSTILE_SECRET')&&!p.config.vars?.SURVEY_V2_TURNSTILE_SECRET:!['SURVEY_V2_TURNSTILE_SECRET','TURNSTILE_SECRET_KEY','TURNSTILE_SECRET'].some(n=>secretNames.includes(n)||p.config.vars?.[n]);
      if(needsTestSecret&&(p.config.vars?.ENVIRONMENT!=='development'||p.config.vars?.TURNSTILE_SITE_KEY!=='1x00000000000000000000AA'))throw new Error('A server-side Turnstile secret is required. Existing key settings will not be replaced.');
      if(p.config.vars?.TURNSTILE_EXPECTED_HOSTNAME&&p.config.vars.TURNSTILE_SITE_KEY==='1x00000000000000000000AA')throw new Error('The configured test key and strict hostname need a separate review. Nothing installed.');
    }
  }
  const saved=backup(plan);
  for(const [relative,bytes]of Object.entries(plan.content)){const targetFile=path.join(p.root,relative);fs.mkdirSync(path.dirname(targetFile),{recursive:true});fs.writeFileSync(targetFile,bytes);}
  fs.mkdirSync(path.dirname(plan.manifestPath),{recursive:true});fs.writeFileSync(plan.manifestPath,JSON.stringify({version:VERSION,original_main:plan.originalMain,backup:saved},null,2)+'\n');
  for(const [relative,bytes]of Object.entries(plan.content))if(digest(fs.readFileSync(path.join(p.root,relative)))!==digest(bytes))throw new Error('Installed bytes differ from the release. Stop before deploying.');
  if(digest(fs.readFileSync(path.resolve(p.root,plan.originalMain)))!==plan.originalHash)throw new Error('The original Worker source changed. Stop before deploying.');
  for(const file of [MAIN,'worker/v2-handler.mjs','public/v2/engine.mjs','public/v2/layout.mjs','public/v2/matrix.mjs','public/v2/app.mjs']){const result=spawnSync(process.execPath,['--check',path.join(p.root,file)],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||'Syntax check failed.');}
  console.log(`Installed and verified v2. Backup: ${saved}`);
  if(!options.deploy){console.log('No Cloudflare operation was performed. Use --apply --deploy to initialise test storage and publish.');return;}
  if(options.collect){
    const expected=['id','received_at','instrument_version','schema_version','record_kind','site','language','technology','respondent_route','active_ms','payload_sha256','payload_json'];
    const current=query(p,target.database,"PRAGMA table_info('survey_v2_test_submissions')").map(x=>x.name);
    if(current.length&&JSON.stringify(current)!==JSON.stringify(expected))throw new Error('The v2 test table has an unexpected schema. Publication stopped.');
    const indexes=query(p,target.database,"SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_survey_v2_test_version_time','idx_survey_v2_test_site_route')");
    if(!current.length||indexes.length!==2)run(p,['d1','execute',target.database,'--remote','--file','migrations/0002_survey_v2_test.sql'],{inherit:true});
    else console.log('Existing v2 test table and indexes are ready; no database import is needed.');
    const columns=query(p,target.database,"PRAGMA table_info('survey_v2_test_submissions')").map(x=>x.name);
    if(JSON.stringify(columns)!==JSON.stringify(expected))throw new Error('The v2 test table has an unexpected schema. Publication stopped.');
    const after=query(p,target.database,"SELECT name,type,sql FROM sqlite_master WHERE name='submissions' OR name LIKE 'idx_submissions_%' ORDER BY name");
    if(JSON.stringify(oldSchema)!==JSON.stringify(after))throw new Error('The existing submissions schema changed. Publication stopped.');
    if(needsTestSecret){
      // Publicly documented Cloudflare dummy credential, added only for this test adapter.
      run(p,['secret','put','SURVEY_V2_TURNSTILE_SECRET'],{input:'1x0000000000000000000000000000000AA\n'});
      console.log('Added the official development-test validation key for the v2 adapter; existing Turnstile keys were retained.');
    }
  }
  const check=spawnSync('npm',['run','check'],{cwd:p.root,stdio:'inherit'});if(check.status!==0)throw new Error('The configured project check failed. Publication stopped.');
  run(p,['deploy','--keep-vars'],{inherit:true});
  const live='https://pulse-conjoint-survey.tom-tamlander.workers.dev';
  const probe=await verifyLive(live,{writeTest:options.collect,expectedCollection:options.collect});
  if(options.collect){
    if(!uuid.test(probe.deployment_check_receipt))throw new Error('Unexpected verification receipt.');
    const rows=query(p,target.database,`SELECT id,record_kind,instrument_version,json_extract(payload_json,'$.test_purpose') AS test_purpose,json_extract(payload_json,'$.layout_version') AS layout_version FROM survey_v2_test_submissions WHERE id='${probe.deployment_check_receipt}'`);
    if(rows.length!==1||rows[0].test_purpose!=='deployment_check'||rows[0].instrument_version!==VERSION||rows[0].layout_version!==COMPACT_LAYOUT)throw new Error('The deployment-check receipt and layout could not be confirmed in the separate survey database.');
  }
  console.log(JSON.stringify({published:true,url:live+'/v2/',instrument_version:probe.instrument_version,layout_version:probe.layout_version,test_collection_enabled:probe.collection_enabled,storage_ready:probe.storage_ready,deployment_check:options.collect?probe:null,backup:saved},null,2));
  console.log('Ready for your browser flow test. The single deployment-check record is labelled and excluded by the analysis pipeline.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
