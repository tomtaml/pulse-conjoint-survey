import {VERSION,derive,pathFor,taskSnapshot,cleanState,allErrors,exportSession,canonical,settingsFromURL,SECTION_NAMES,REVIEW_TIMING_IDS} from '../public/v2/engine.mjs';
import {COMPACT_LAYOUT,COMPACT_PAGES,SUPPORTED_LAYOUTS,layoutOf} from '../public/v2/layout.mjs';

export const TABLE='survey_v2_test_submissions';
export const MAX_BYTES=131072;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const settingsKeys=Object.keys(settingsFromURL());
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'same-origin','content-security-policy':"default-src 'none'; frame-ancestors 'none'"}});
const fail=(status,code,message)=>json({error:code,message},status);
const secret=env=>env.SURVEY_V2_TURNSTILE_SECRET||env.TURNSTILE_SECRET_KEY||env.TURNSTILE_SECRET||'';
const requested=env=>String(env.SURVEY_V2_COLLECTION_ENABLED)==='true';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validNumber=n=>Number.isSafeInteger(n)&&n>=0;

export function validatePayload(data,payload) {
  if(!plain(payload)||payload.instrument_version!==VERSION||payload.schema_version!==data.meta.schema_version||payload.record_kind!=='instrument_test'||payload.complete!==true)throw new Error('This test session uses an unsupported instrument version or is incomplete.');
  if(payload.instrument_content_sha256!==data.meta.content_sha256)throw new Error('The questionnaire content has changed. Start a fresh test with the current version.');
  if(payload.layout_version!==undefined&&!SUPPORTED_LAYOUTS.includes(payload.layout_version))throw new Error('Unsupported questionnaire layout. Reload the test.');
  if(!['flow_review','deployment_check'].includes(payload.test_purpose))throw new Error('Invalid instrument-test purpose.');
  if(!UUID.test(payload.session_id||'')||!Number.isInteger(payload.seed)||payload.seed<0||payload.seed>4294967295)throw new Error('Invalid test-session identifier.');
  if(typeof payload.created_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(payload.created_at)||!Number.isFinite(Date.parse(payload.created_at)))throw new Error('Invalid test timestamp.');
  if(!plain(payload.settings)||Object.keys(payload.settings).some(k=>!settingsKeys.includes(k)&&k!=='review_both_dce'))throw new Error('Invalid test configuration.');
  for(const key of settingsKeys)if(key==='technology_override'?![null,'wpt','v2g'].includes(payload.settings[key]):typeof payload.settings[key]!=='boolean')throw new Error('Invalid test configuration.');
  if(Object.hasOwn(payload.settings,'review_both_dce')&&typeof payload.settings.review_both_dce!=='boolean')throw new Error('Invalid test configuration.');
  if(!plain(payload.answers)||Object.keys(payload.answers).length>data.questions.length)throw new Error('Invalid answer object.');
  const qmap=new Map(data.questions.map(q=>[q.id,q]));
  for(const [id,value]of Object.entries(payload.answers)){
    if(!qmap.has(id))throw new Error('An answer ID is not part of this instrument.');
    if(!(Number.isInteger(value)||(Array.isArray(value)&&value.length<=20&&value.every(Number.isInteger))))throw new Error('Only coded closed answers are accepted.');
  }
  if(payload.answers['TEST-CONSENT-01']!==1||payload.answers['TEST-ADULT-01']!==1||![1,2,3].includes(payload.answers['TEST-SITE-01']))throw new Error('Adult test consent and a test site are required.');
  const state={version:2,...(payload.layout_version?{layout_version:payload.layout_version}:{}),session_id:payload.session_id,test_purpose:payload.test_purpose,seed:payload.seed,settings:payload.settings,created_at:payload.created_at,answers:structuredClone(payload.answers),choices:{},choiceSnapshots:{},checks:{},seen:[],finished:true,notes:{}};
  const path=pathFor(data,state),taskSteps=path.filter(s=>s.kind==='choice'),activeTasks=new Map(taskSteps.map(s=>[s.id,s.task]));
  if(!Array.isArray(payload.choices)||payload.choices.length!==data.tasks.length||new Set(payload.choices.map(t=>t?.task_id)).size!==data.tasks.length)throw new Error('Invalid choice-task records.');
  for(const row of payload.choices){
    if(!plain(row)||!data.tasks.some(t=>t.id===row.task_id))throw new Error('Unknown choice-task ID.');
    const task=activeTasks.get(row.task_id);
    if(!task){if(row.selected!==null||row.status!=='not_shown')throw new Error('A choice is present for a skipped task.');continue;}
    const expected=taskSnapshot(task,state.answers,state,data);
    if(!Number.isInteger(row.selected)||!expected.display_order.includes(row.selected))throw new Error('A choice does not match the available offers.');
    for(const key of Object.keys(expected))if(canonical(row[key])!==canonical(expected[key]))throw new Error('The displayed offers do not match this instrument. Reload the test.');
    state.choices[row.task_id]=row.selected;state.choiceSnapshots[row.task_id]=expected;
  }
  const cleaned=cleanState(data,state);
  if(canonical(cleaned.answers)!==canonical(state.answers)||canonical(cleaned.choices)!==canonical(state.choices))throw new Error('Some answers belong to an earlier or invalid route. Review the session before submitting.');
  if(allErrors(data,state).length)throw new Error('Some required answers are missing or invalid.');
  const shown=new Set(path.flatMap(s=>s.question_ids||[]));
  const checks=payload.comprehension;
  if(!plain(checks)||Object.keys(checks).some(id=>!shown.has(id)||qmap.get(id)?.type!=='check'))throw new Error('Invalid comprehension records.');
  for(const q of data.questions.filter(q=>q.type==='check'&&shown.has(q.id))){
    const c=checks[q.id],codes=q.options.map(o=>o.code);
    if(!plain(c)||![1,2].includes(c.attempts)||!codes.includes(c.first)||c.last!==state.answers[q.id])throw new Error('Incomplete comprehension records.');
    state.checks[q.id]={first:c.first,last:c.last,attempts:c.attempts,correct_first:c.first===q.correct,correct_final:c.last===q.correct};
  }
  const timing=validateTiming(data,state,payload.timing);
  return exportSession(data,state,timing);
}

export function validateTiming(data,state,timing){
  if(!plain(timing)||!plain(timing.by_step_ms)||!plain(timing.visits))throw new Error('Timing data is missing.');
  const sectionById=new Map(data.questions.map(q=>[q.id,q.section]));
  for(const g of data.groups)sectionById.set(g.id,g.section);
  for(const t of data.tasks)sectionById.set(t.id,t.section);
  if(layoutOf(state)===COMPACT_LAYOUT)for(const page of COMPACT_PAGES)sectionById.set(page.id,page.section);
  if(state.settings?.review_both_dce===true)for(const id of REVIEW_TIMING_IDS)sectionById.set(id,'G');
  const intros={A:'A',journey:'A',purposes:'A',B:'B',scenario:'B',C:'C',D:'D',S:'S',E:'E',wpt:'E',v2g:'E',positioning:'E',F:'F',wpt_gate:'G',wpt_terms:'G',v2g_terms:'G',v2g_payment:'G',public:'G',benefits:'G',information:'G',values:'V',H:'H',declined:'S','not-adult':'S'};
  for(const [key,section]of Object.entries(intros))sectionById.set(`intro-${key}`,section);
  if(Object.keys(timing.by_step_ms).length>500||Object.keys(timing.visits).length>500)throw new Error('Invalid timing data.');
  const by_step_ms={},by_section_ms=Object.fromEntries(Object.keys(SECTION_NAMES).map(k=>[k,0])),visits={},sections={};
  for(const [id,ms]of Object.entries(timing.by_step_ms)){
    if(!sectionById.has(id)||!validNumber(ms)||ms>604800000)throw new Error('Invalid timing data.');
    by_step_ms[id]=ms;sections[id]=sectionById.get(id);by_section_ms[sections[id]]+=ms;
  }
  for(const [id,n]of Object.entries(timing.visits)){if(!sectionById.has(id)||!validNumber(n)||n>10000)throw new Error('Invalid visit data.');visits[id]=n;}
  const active_ms=Object.values(by_step_ms).reduce((s,n)=>s+n,0);
  if(timing.active_ms!==active_ms||active_ms>604800000)throw new Error('Timing totals are inconsistent.');
  return {active_ms,by_step_ms,by_section_ms,visits,sections,started:true,finished:true};
}

async function readBody(request){
  const declared=Number(request.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>MAX_BYTES)throw new RangeError('The test session is too large.');
  const reader=request.body?.getReader();if(!reader)throw new Error('No submission body.');
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new RangeError('The test session is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createV2Handler(data,{fetcher=globalThis.fetch,now=()=>new Date()}={}) {
  return async function handle(request,env){
    const url=new URL(request.url),path=url.pathname;
    if(!path.startsWith('/api/v2/'))return null;
    if(path==='/api/v2/config'&&request.method==='GET'){
      let storage=false;if(requested(env)&&env.DB&&secret(env)){try{storage=!!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(TABLE).first();}catch{}}
      return json({instrument_version:VERSION,instrument_content_sha256:data.meta.content_sha256,schema_version:data.meta.schema_version,layout_version:COMPACT_LAYOUT,supported_layout_versions:SUPPORTED_LAYOUTS,capabilities:{driver_dce_comparison:true},mode:'instrument_test',collection_enabled:requested(env)&&!!secret(env)&&storage,
        turnstile_site_key:env.TURNSTILE_SITE_KEY||null,storage_ready:storage,max_payload_bytes:MAX_BYTES,free_text_enabled:false});
    }
    if(path!=='/api/v2/submissions')return fail(404,'not_found','This test endpoint is not available.');
    if(request.method!=='POST')return fail(405,'method_not_allowed','Use the questionnaire to submit test answers.');
    if(!requested(env))return fail(503,'collection_disabled','Test collection is currently off. Download the session or try later.');
    if(!env.DB||!secret(env)||!env.TURNSTILE_SITE_KEY)return fail(503,'not_ready','Test answer saving is not configured. Download the session or try later.');
    if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return fail(403,'origin_rejected','Submit from the questionnaire at this address.');
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return fail(415,'content_type','A JSON test session is required.');
    let body,payload;
    try{body=await readBody(request);if(!plain(body)||Object.keys(body).some(k=>!['payload','turnstile_token'].includes(k)))throw new Error('Invalid submission fields.');payload=validatePayload(data,body.payload);}
    catch(e){return fail(e instanceof RangeError?413:400,'invalid_session',e.message||'The test session could not be read.');}
    if(typeof body.turnstile_token!=='string'||body.turnstile_token.length<1||body.turnstile_token.length>2048)return fail(403,'verification_required','Please complete verification before submitting.');
    let verified;
    try{const result=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:secret(env),response:body.turnstile_token}),signal:AbortSignal.timeout(12000)});if(!result.ok)throw new Error();verified=await result.json();}
    catch{return fail(503,'verification_unavailable','Verification is temporarily unavailable. Your local answers are still available.');}
    const testKey=env.ENVIRONMENT==='development'&&env.TURNSTILE_SITE_KEY==='1x00000000000000000000AA';
    const expected=String(env.TURNSTILE_EXPECTED_HOSTNAME||'');
    if(verified.success!==true||(expected&&verified.hostname!==expected)||(!testKey&&(!expected&&verified.hostname!==url.hostname||verified.action!=='pulse_v2_test')))return fail(403,'verification_failed','Verification expired or failed. Please retry with a new verification.');
    const encoded=canonical(payload),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(encoded))),v=>v.toString(16).padStart(2,'0')).join('');
    const received=now().toISOString(),r=payload.route,cap=Number.isInteger(Number(env.SURVEY_V2_DAILY_CAP))&&Number(env.SURVEY_V2_DAILY_CAP)>0?Math.min(100000,Number(env.SURVEY_V2_DAILY_CAP)):2000;
    try{
      const old=await env.DB.prepare(`SELECT id, payload_sha256, received_at FROM ${TABLE} WHERE id=?`).bind(payload.session_id).first();
      if(old){if(old.payload_sha256!==digest)return fail(409,'session_changed','This session was already submitted with different answers. Start another test.');return json({receipt_id:old.id,saved_at:old.received_at,record_kind:'instrument_test',instrument_version:VERSION,duplicate:true});}
      const sql=`INSERT INTO ${TABLE} (id,received_at,instrument_version,schema_version,record_kind,site,language,technology,respondent_route,active_ms,payload_sha256,payload_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM ${TABLE} WHERE received_at>=?) < ? ON CONFLICT(id) DO NOTHING`;
      const day=received.slice(0,10)+'T00:00:00.000Z';
      const result=await env.DB.prepare(sql).bind(payload.session_id,received,VERSION,data.meta.schema_version,'instrument_test',payload.site,'en',r.technology,r.privateRoute?'private':'public',payload.timing.active_ms,digest,encoded,day,cap).run();
      if(!result.meta?.changes){const existing=await env.DB.prepare(`SELECT id, payload_sha256, received_at FROM ${TABLE} WHERE id=?`).bind(payload.session_id).first();if(existing?.payload_sha256===digest)return json({receipt_id:existing.id,saved_at:existing.received_at,record_kind:'instrument_test',instrument_version:VERSION,duplicate:true});return fail(429,'test_limit','The test collection limit has been reached. Download your session and try later.');}
      return json({receipt_id:payload.session_id,saved_at:received,record_kind:'instrument_test',instrument_version:VERSION,duplicate:false},201);
    }catch{return fail(503,'storage_unavailable','The test answers could not be saved. They remain in your browser; download them or retry.');}
  };
}
