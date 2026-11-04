import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createV2Handler,validatePayload,TABLE,MAX_BYTES} from '../worker/v2-handler.mjs';
import {data,complete,payload} from './v2-fixtures.mjs';

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(fs.readFileSync(new URL('../migrations/0002_survey_v2_test.sql',import.meta.url),'utf8'));}
  prepare(sql){const statement=this.db.prepare(sql);return {bind:(...args)=>({first:async()=>statement.get(...args)||null,run:async()=>({meta:{changes:Number(statement.run(...args).changes)}})})};}
}
const origin='https://pulse-conjoint-survey.example';
const env=()=>({DB:new D1(),SURVEY_V2_COLLECTION_ENABLED:'true',TURNSTILE_SITE_KEY:'1x00000000000000000000AA',SURVEY_V2_TURNSTILE_SECRET:'test-secret',ENVIRONMENT:'development'});
const verification=async()=>Response.json({success:true,hostname:'example.com',action:'test'});
const request=(p,options={})=>new Request(origin+'/api/v2/submissions',{method:'POST',headers:{origin,'content-type':'application/json',...options.headers},body:JSON.stringify({payload:p,turnstile_token:'dummy-token',...options.body})});

test('payload validation accepts complete WPT/V2G/public routes and omits local comments',()=>{
  for(const settings of [{technology_override:'wpt'},{technology_override:'v2g'},{information:true,values:true,ranking:true,prosumer:true,conditions:true,convenience:true}]){
    const s=complete({},settings),p=payload(s);p.local_comments={personal:'not to be stored'};const safe=validatePayload(data,p);assert.equal(safe.site,'tampere');assert(!Object.hasOwn(safe,'local_comments'));assert(!JSON.stringify(safe).includes('not to be stored'));
  }
  const s=complete({'A-VEH-ACCESS-01':3,'A-FUT-ROLE':2,'A-JRN-01':97,'B-TRIP-CONTEXT':97});assert(validatePayload(data,payload(s)).route.publicRoute);
});
test('valid collection writes only the new test table and gives idempotent receipts',async()=>{
  const e=env(),handler=createV2Handler(data,{fetcher:verification,now:()=>new Date('2026-11-04T12:00:00.000Z')}),p=payload(complete());
  const a=await handler(request(p),e);assert.equal(a.status,201);const receipt=await a.json();assert.equal(receipt.record_kind,'instrument_test');
  const b=await handler(request(p),e);assert.equal(b.status,200);assert((await b.json()).duplicate);
  assert.equal(e.DB.db.prepare(`SELECT count(*) AS n FROM ${TABLE}`).get().n,1);
  const row=e.DB.db.prepare(`SELECT payload_json FROM ${TABLE}`).get();assert.equal(JSON.parse(row.payload_json).instrument_version,data.meta.version);
  const different=structuredClone(p);different.answers['H-FIN-01']=2;assert.equal((await handler(request(different),e)).status,409);
});
test('collection flags, consent, origin, verification, types and size fail closed',async()=>{
  const e=env(),h=createV2Handler(data,{fetcher:verification}),p=payload(complete());
  assert.equal((await h(request(p),{...e,SURVEY_V2_COLLECTION_ENABLED:'false'})).status,503);
  assert.equal((await h(request(p,{headers:{origin:'https://unrelated.example'}}),e)).status,403);
  assert.equal((await h(request(p,{headers:{'content-type':'text/plain'}}),e)).status,415);
  const no=structuredClone(p);no.answers['TEST-CONSENT-01']=2;assert.equal((await h(request(no),e)).status,400);
  const text=structuredClone(p);text.answers['H-AGE-01']='a name or email';assert.equal((await h(request(text),e)).status,400);
  const malformed=structuredClone(p);malformed.answers.unknown=1;assert.equal((await h(request(malformed),e)).status,400);
  const failed=createV2Handler(data,{fetcher:async()=>Response.json({success:false})});assert.equal((await failed(request(p),e)).status,403);
  assert.equal((await h(request(p,{body:{turnstile_token:''}}),e)).status,403);
  const large=new Request(origin+'/api/v2/submissions',{method:'POST',headers:{origin,'content-type':'application/json'},body:' '.repeat(MAX_BYTES+1)});assert.equal((await h(large,e)).status,413);
  assert.equal(e.DB.db.prepare(`SELECT count(*) AS n FROM ${TABLE}`).get().n,0);
});
test('tampered offer values, stale hidden answers and bad timings are rejected',()=>{
  const p=payload(complete({}, {technology_override:'wpt'}));
  const staleContent=structuredClone(p);staleContent.instrument_content_sha256='0'.repeat(64);assert.throws(()=>validatePayload(data,staleContent),/content has changed/);
  const altered=structuredClone(p);altered.choices.find(c=>c.status==='answered').alternatives[0].attributes.cost=100;assert.throws(()=>validatePayload(data,altered),/offers/);
  const stale=structuredClone(p);stale.answers['E-V-USE-01']=5;assert.throws(()=>validatePayload(data,stale),/earlier or invalid route/);
  const timing=structuredClone(p);timing.timing.by_step_ms['an arbitrary text key']=12;assert.throws(()=>validatePayload(data,timing),/timing/);
});
test('new test limits are atomic and public endpoints never expose responses',async()=>{
  const e=env(),h=createV2Handler(data,{fetcher:verification,now:()=>new Date('2026-11-04T12:00:00.000Z')});e.SURVEY_V2_DAILY_CAP='1';
  assert.equal((await h(request(payload(complete())),e)).status,201);
  assert.equal((await h(request(payload(complete())),e)).status,429);
  assert.equal((await h(new Request(origin+'/api/v2/submissions'),e)).status,405);
  const c=await h(new Request(origin+'/api/v2/config'),e);const config=await c.json();assert(config.collection_enabled);assert(!JSON.stringify(config).includes('test-secret'));
  assert.equal(await h(new Request(origin+'/api/config'),e),null);
});
