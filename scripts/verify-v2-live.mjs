import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {complete,payload} from '../tests/v2-fixtures.mjs';
import {VERSION} from '../public/v2/engine.mjs';

export async function verifyLive(base,{writeTest=false,fetcher=globalThis.fetch}={}){
  const url=new URL(base);if(url.protocol!=='https:'||url.hostname!=='pulse-conjoint-survey.tom-tamlander.workers.dev')throw new Error('Only the established conjoint survey URL is allowed.');
  const configResponse=await fetcher(url.origin+'/api/v2/config?verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!configResponse.ok)throw new Error('The live v2 configuration is not available.');
  const config=await configResponse.json();if(config.instrument_version!==VERSION)throw new Error('The live instrument is not this v2 release.');
  if(!writeTest)return {url:url.origin+'/v2/',instrument_version:config.instrument_version,collection_enabled:config.collection_enabled};
  if(!config.collection_enabled||config.turnstile_site_key!=='1x00000000000000000000AA')throw new Error('Automated write verification requires the configured development test key and enabled test collection.');
  const state=complete({}, {technology_override:'wpt'},41327);state.test_purpose='deployment_check';const test=payload(state);
  const response=await fetcher(url.origin+'/api/v2/submissions',{method:'POST',headers:{origin:url.origin,'content-type':'application/json'},body:JSON.stringify({payload:test,turnstile_token:'XXXX.DUMMY.TOKEN.XXXX'}),signal:AbortSignal.timeout(25000)});
  const receipt=await response.json();if(!response.ok||receipt.receipt_id!==state.session_id)throw new Error(receipt.message||'The labelled deployment-check record was not saved.');
  return {url:url.origin+'/v2/',instrument_version:config.instrument_version,collection_enabled:true,deployment_check_receipt:receipt.receipt_id,saved_at:receipt.saved_at};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);if(args.some(a=>a!=='--write-test')){console.error('Usage: node scripts/verify-v2-live.mjs [--write-test]');process.exitCode=1;}
  else verifyLive('https://pulse-conjoint-survey.tom-tamlander.workers.dev',{writeTest:args.includes('--write-test')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
