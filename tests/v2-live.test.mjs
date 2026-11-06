import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLive} from '../scripts/verify-v2-live.mjs';
import {data} from './v2-fixtures.mjs';
import {COMPACT_LAYOUT} from '../public/v2/layout.mjs';
const origin='https://pulse-conjoint-survey.tom-tamlander.workers.dev';
const ready=()=>({instrument_version:data.meta.version,instrument_content_sha256:data.meta.content_sha256,layout_version:COMPACT_LAYOUT,collection_enabled:true,storage_ready:true,turnstile_site_key:'1x00000000000000000000AA'});
test('readiness waits for a propagated compact layout, not merely the unchanged instrument version',async()=>{
  let calls=0;
  const result=await verifyLive(origin,{retryDelayMs:0,expectedCollection:true,fetcher:async()=>{
    calls++;if(calls===1)return new Response('Not found',{status:404});
    if(calls===2){const old=ready();delete old.layout_version;return Response.json(old);}
    return Response.json(ready());
  }});
  assert.equal(calls,3);assert.equal(result.layout_version,COMPACT_LAYOUT);assert(result.storage_ready);
});
test('a deployment check writes once, labels the test, and includes compact layout provenance',async()=>{
  let writes=0;
  const result=await verifyLive(origin,{writeTest:true,retryDelayMs:0,fetcher:async(url,options)=>{
    if(!options?.method)return Response.json(ready());
    writes++;assert.equal(url,origin+'/api/v2/submissions');
    const {payload:p}=JSON.parse(options.body);assert.equal(p.test_purpose,'deployment_check');assert.equal(p.layout_version,COMPACT_LAYOUT);
    return Response.json({receipt_id:p.session_id,saved_at:'2026-11-06T12:00:00.000Z'},{status:201});
  }});
  assert.equal(writes,1);assert(result.deployment_check_receipt);
});
