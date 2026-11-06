import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {data,complete,payload} from '../tests/v2-fixtures.mjs';
import {VERSION} from '../public/v2/engine.mjs';
import {COMPACT_LAYOUT} from '../public/v2/layout.mjs';

export async function verifyLive(base,{writeTest=false,fetcher=globalThis.fetch,expectedCollection,retryDelayMs=1500}={}){
  const url=new URL(base);if(url.protocol!=='https:'||url.hostname!=='pulse-conjoint-survey.tom-tamlander.workers.dev')throw new Error('Only the established conjoint survey URL is allowed.');
  let config,lastError;const deadline=Date.now()+45000;
  for(let attempt=0;attempt<8&&Date.now()<deadline;attempt++){
    try{
      const response=await fetcher(url.origin+'/api/v2/config?verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(20000,deadline-Date.now())))});
      if(!response.ok)throw new Error(`Configuration returned HTTP ${response.status}.`);
      const candidate=await response.json();
      if(candidate.instrument_version!==VERSION||candidate.instrument_content_sha256!==data.meta.content_sha256||candidate.layout_version!==COMPACT_LAYOUT)throw new Error('The new questionnaire layout is not available at this edge yet.');
      if(expectedCollection!==undefined&&candidate.collection_enabled!==expectedCollection)throw new Error('The collection flag is not yet the expected value.');
      config=candidate;break;
    }catch(e){lastError=e.message;}
    if(attempt<7&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,retryDelayMs));
  }
  if(!config)throw new Error('Deployment readiness is not confirmed. '+lastError);
  const readiness={url:url.origin+'/v2/',instrument_version:config.instrument_version,layout_version:config.layout_version,collection_enabled:config.collection_enabled,storage_ready:config.storage_ready};
  if(!writeTest)return readiness;
  if(!config.collection_enabled||config.turnstile_site_key!=='1x00000000000000000000AA')throw new Error('Automated write verification requires the configured development test key and enabled test collection.');
  const state=complete({}, {technology_override:'wpt'},41327);state.test_purpose='deployment_check';const test=payload(state);
  const response=await fetcher(url.origin+'/api/v2/submissions',{method:'POST',headers:{origin:url.origin,'content-type':'application/json'},body:JSON.stringify({payload:test,turnstile_token:'XXXX.DUMMY.TOKEN.XXXX'}),signal:AbortSignal.timeout(25000)});
  const receipt=await response.json();if(!response.ok||receipt.receipt_id!==state.session_id)throw new Error(receipt.message||'The labelled deployment-check record was not saved.');
  return {...readiness,deployment_check_receipt:receipt.receipt_id,saved_at:receipt.saved_at};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);if(args.some(a=>a!=='--write-test')){console.error('Usage: node scripts/verify-v2-live.mjs [--write-test]');process.exitCode=1;}
  else verifyLive('https://pulse-conjoint-survey.tom-tamlander.workers.dev',{writeTest:args.includes('--write-test')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
