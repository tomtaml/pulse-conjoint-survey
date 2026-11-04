import {shuffle, ReviewClock} from '../v1/engine.mjs';
export {shuffle, ReviewClock};

export const VERSION='pulse-v2-A0.9-test-2026-11-04';
export const SECTION_NAMES={S:'About the test',A:'Everyday travel',B:'A future trip',C:'Your regular journey',D:'Charging context',E:'The service concepts',F:'Your view of one service',G:'Offers and priorities',V:'Guiding values',H:'About your household'};
const has=(v,c)=>Array.isArray(v)&&v.includes(c);
const mode=v=>Number.isInteger(v)&&v>=1&&v<=8;
const sorted=v=>Array.isArray(v)?[...new Set(v)].sort((a,b)=>a-b):[];
const stable=v=>JSON.stringify(v);
export const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
function draw(seed,label){let n=2166136261;for(const c of `${seed}:${label}`){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return (n>>>0)/4294967296;}
export function settingsFromURL(search='') {
  const params=new URLSearchParams(search),on=new Set((params.get('modules')||'').split(','));
  return {values:on.has('values'),information:on.has('information'),ranking:on.has('ranking'),prosumer:on.has('prosumer'),convenience:on.has('convenience'),conditions:on.has('conditions'),technology_override:['wpt','v2g'].includes(params.get('technology'))?params.get('technology'):null};
}
export function freshState(seed=crypto.getRandomValues(new Uint32Array(1))[0],settings={}) {
  return {version:2,session_id:crypto.randomUUID(),seed,settings:{...settingsFromURL(),...settings},started:false,finished:false,currentId:'welcome',answers:{},choices:{},choiceSnapshots:{},notes:{},checks:{},seen:[],clock:null,created_at:new Date().toISOString(),receipt:null};
}
export function derive(a={},state={}) {
  const journey=[1,2,3,4].includes(a['A-JRN-01']);
  const currentMode=mode(a['A-JRN-02'])?a['A-JRN-02']:null;
  const direct=a['C-ALT-01'],chosen=direct===97?a['C-ALT-02']:direct===6?a['C-ALT-USED']:direct;
  const alternativeMode=journey&&[1,2,3,4,5].includes(chosen)?chosen:null;
  const conditional=journey&&direct===97&&!!alternativeMode;
  const changes=sorted(a['C-COND-01']);
  const definedChanges=conditional&&changes.length>0&&changes.every(c=>c>=1&&c<=7);
  const householdVehicle=[1,2].includes(a['A-VEH-ACCESS-01']);
  const plugAccess=householdVehicle&&(has(a['A-HH-PT-01'],1)||has(a['A-HH-PT-01'],2));
  const informed=plugAccess&&[1,2].includes(a['A-CHG-ROLE']);
  const locations=informed?sorted(a['A-CHG-LOC']).filter(v=>v>=1&&v<=7):[];
  const householdOrFuture=householdVehicle||a['A-FUT-ROLE']===1;
  const ready=a['F-EVAL-W']!==undefined&&a['F-EVAL-V']!==undefined;
  const eligibleW=householdOrFuture&&a['F-EVAL-W']===1,eligibleV=householdOrFuture&&a['F-EVAL-V']===1;
  let technology=null,allocationMethod=null,probability=null;
  const override=state.settings?.technology_override;
  if(ready) {
    if(eligibleW||eligibleV) {
      if(override&&((override==='wpt'&&eligibleW)||(override==='v2g'&&eligibleV))){technology=override;allocationMethod='review_override';probability=1;}
      else if(eligibleW&&eligibleV){technology=draw(state.seed,'private-technology')<.5?'wpt':'v2g';allocationMethod='random_dual_eligible';probability=.5;}
      else{technology=eligibleW?'wpt':'v2g';allocationMethod='single_eligible';probability=1;}
    }else{technology=override||(draw(state.seed,'public-reference')<.5?'wpt':'v2g');allocationMethod=override?'public_review_override':'random_public_reference';probability=override?1:.5;}
  }
  const privateRoute=ready&&(eligibleW||eligibleV),publicRoute=ready&&!privateRoute;
  const available=sorted(a['B-MODE-EVAL']).some(v=>v>=90)?[]:sorted(a['B-MODE-EVAL']).filter(v=>[1,2,3].includes(v));
  const transport=a['B-TRIP-CONTEXT']!==undefined&&a['B-TRIP-CONTEXT']!==97&&available.length>=2;
  const arm=technology&&state.settings?.information?(draw(state.seed,`information:${technology}:${privateRoute?'private':'public'}:${a['TEST-SITE-01']}`)<.5?'core_only':'added_explanation'):'off';
  return {journey,currentMode,alternativeMode,conditional,definedChanges,changes,householdVehicle,householdOrFuture,plugAccess,informed,locations,available,transport,
    driving:has(a['A-MOB-01'],4)||a['A-MOB-PRIMARY']===4?1:a['R-DRIVE-01']??null,
    chargingMain:locations.length===1?{value:locations[0],status:'derived_from_single_location'}:{value:a['A-CHG-MAIN']??null,status:locations.length>=2?'asked_multiple_locations':'not_applicable_or_unresolved'},
    eligibleW,eligibleV,ready,technology,privateRoute,publicRoute,allocationMethod,probability,arm,
    combTarget:!journey?'no_recurring_journey':!alternativeMode?'no_confirmed_alternative':conditional?definedChanges?'defined_conditional':'undefined_conditional':direct===6?'maintenance':'current_condition_option',
    technologyDCE:privateRoute&&(technology==='wpt'?a['G-WPT-CONTEXT-01']===1:a['G-V2G-CONTEXT-01']===1)};
}
export function routeMatches(route,a,state={}) {
  const r=derive(a,state),s=state.settings||{};
  switch(route) {
    case 'always':return true;
    case 'assigned':return !!r.technology;
    case 'professional':return [1,2].includes(a['A-PRO-DRIVE-01']);
    case 'ask_driving':return !(has(a['A-MOB-01'],4)||a['A-MOB-PRIMARY']===4);
    case 'household_vehicle':return r.householdVehicle;
    case 'household_or_future':return r.householdOrFuture;
    case 'has_journey':return r.journey;
    case 'transport_context':return a['B-TRIP-CONTEXT']!==97;
    case 'transport':return r.transport;
    case 'confirm_used_mode':return r.journey&&a['C-ALT-01']===6;
    case 'conditional_mode':return r.journey&&a['C-ALT-01']===97;
    case 'named_conditional':return r.conditional;
    case 'alternative':return !!r.alternativeMode;
    case 'intention':return !!r.alternativeMode&&(!r.conditional||r.definedChanges);
    case 'no_alternative':return r.journey&&!r.alternativeMode&&a['C-ALT-01']!==undefined;
    case 'habit':return r.journey&&!!r.currentMode;
    case 'convenience':return !!s.convenience&&r.journey&&!!r.currentMode;
    case 'parking_context':return r.householdOrFuture;
    case 'plug_access':return r.plugAccess;
    case 'charging_details':return r.informed;
    case 'charging_main':return r.informed&&r.locations.length>=2;
    case 'charging_out':return r.informed&&r.locations.some(c=>[3,4,5,6].includes(c));
    case 'charging_home':return r.informed&&r.locations.some(c=>[1,2].includes(c));
    case 'private':return r.privateRoute;
    case 'public':return r.publicRoute;
    case 'w':return r.technology==='wpt';
    case 'v':return r.technology==='v2g';
    case 'w_private':return r.privateRoute&&r.technology==='wpt';
    case 'v_private':return r.privateRoute&&r.technology==='v2g';
    case 'w_post':return r.privateRoute&&r.technology==='wpt'&&!!s.information;
    case 'v_post':return r.privateRoute&&r.technology==='v2g'&&!!s.information;
    case 'values':return !!s.values;
    case 'prosumer':return !!s.prosumer&&r.privateRoute&&r.technology==='v2g';
    case 'ranking':return !!s.ranking&&!!r.technology;
    case 'public_conditions':return !!s.conditions&&r.publicRoute;
    default:return false;
  }
}
export function optionsFor(q,a,state={},data=null) {
  if(q.option_filter==='used_modes')return q.options.filter(o=>o.code>=90||has(a['A-MOB-01'],o.code));
  if(q.option_filter==='charging_locations')return q.options.filter(o=>o.code>=90||derive(a,state).locations.includes(o.code));
  if(q.option_filter==='technology_concerns'){const w=derive(a,state).technology==='wpt';return q.options.filter(o=>o.code>=90||!(w?[4,5,6]:[7]).includes(o.code));}
  if(q.type==='rank'&&data){const b=data.benefits[derive(a,state).technology]||[];return [...b.map((v,i)=>({code:i+1,label:v.label})),...q.options.filter(o=>o.code>=90)];}
  if(q.type==='check')return [...shuffle(q.options.filter(o=>o.code<90),`${state.seed}:${q.id}:options`),...q.options.filter(o=>o.code>=90)];
  return q.options;
}
export function answerError(q,a,state={},data=null) {
  const v=a[q.id],opts=optionsFor(q,a,state,data),codes=opts.map(o=>o.code);
  if(q.type==='multi'||q.type==='rank') {
    if(!Array.isArray(v)||!v.length)return 'Please select an option, including uncertainty or refusal if appropriate.';
    if(new Set(v).size!==v.length||v.some(n=>!codes.includes(n)))return 'Please use valid, distinct options.';
    if(v.length>1&&v.some(n=>opts.find(o=>o.code===n)?.exclusive))return 'Use None, uncertainty or refusal on its own.';
    if(q.max_selections&&v.length>q.max_selections)return `Please choose up to ${q.max_selections} options.`;
    if(q.type==='rank'&&v.length>3)return 'Choose no more than three benefits.';
    return null;
  }
  return codes.includes(v)?null:'Please choose an answer, including uncertainty or refusal if appropriate.';
}
export function pathFor(data,state) {
  const a=state.answers,r=derive(a,state),steps=[];
  const info=(key,section,custom=null)=>steps.push({id:`intro-${key}`,kind:'info',section,content:custom||data.instructions[key]});
  const q=id=>{const item=data.questions.find(q=>q.id===id);if(item&&(!item.optional_module||state.settings?.[item.optional_module])&&routeMatches(item.route,a,state))steps.push({id,kind:'questions',section:item.section,question_ids:[id]});};
  const group=id=>{const g=data.groups.find(g=>g.id===id);if(!g)return;const ids=g.question_ids.filter(id=>{const item=data.questions.find(q=>q.id===id);return routeMatches(item.route,a,state);});if(ids.length)steps.push({...g,kind:'questions',question_ids:ids});};
  const tasks=block=>{for(const t of [...data.tasks.filter(t=>t.block===block&&t.practice),...shuffle(data.tasks.filter(t=>t.block===block&&!t.practice),`${state.seed}:${block}:order`)])steps.push({id:t.id,kind:'choice',section:t.section,task:t});};
  info('S','S');q('TEST-CONSENT-01');
  if(a['TEST-CONSENT-01']===2){info('declined','S',{title:'You can leave the test',body:'No test submission will be made.'});return steps;}
  if(a['TEST-CONSENT-01']!==1)return steps;
  q('TEST-ADULT-01');
  if(a['TEST-ADULT-01']===2){info('not-adult','S',{title:'This test is for adults',body:'No test submission will be made.'});return steps;}
  if(a['TEST-ADULT-01']!==1)return steps;
  q('TEST-SITE-01');if(![1,2,3].includes(a['TEST-SITE-01']))return steps;
  info('A','A');
  for(const id of ['A-MOB-01','A-MOB-PRIMARY','A-VEH-01','R-DRIVE-01','A-PRO-DRIVE-01','A-PRO-PT-01','A-VEH-ACCESS-01','A-HH-PT-01','A-OPP-01','A-AFF-01','A-FUT-ROLE','A-HH-DEC-VEH-02'])q(id);
  info('journey','A');for(const id of ['A-JRN-01','A-JRN-02','A-JRN-03','A-JRN-04','A-JRN-05'])q(id);
  info('B','B');q('B-TRIP-CONTEXT');q('B-MODE-EVAL');if(r.transport){info('scenario','B');tasks('transport');}
  if(r.journey){info('C','C',{title:'Return to your real journey',body:'The 2030 trip is finished. Think again about your real [JOURNEY] journey from the past four weeks. These questions concern that journey, as things are today, unless specific changes are stated.'});}
  for(const id of ['C-ALT-01','C-ALT-USED','C-ALT-02','C-COND-01'])q(id);
  for(const id of ['C-PCAP','C-PSYC','C-POPP','C-SOPP','C-RMOT','C-HAB'])group(id);
  for(const id of ['C-CONV-01','C-PLAN-EFFORT-01'])q(id);
  group('C-INT');for(const id of ['C-BEH-01','C-BEH-02','C-CTX-01','C-NOALT-BAR-01'])q(id);
  info('D','D');for(const id of ['A-DEC-01','A-TIME-01','A-PV-01','A-PARK-CHG','A-CHG-ROLE','A-CHG-LOC','A-CHG-MAIN','A-CHG-OUT','A-CHG-SCHED','A-CHG-PACE-01'])q(id);
  for(const id of ['A-AWARE-W','A-AWARE-V','A-AWARE-P'])q(id);
  info('E','E');info('wpt','E');info('v2g','E');q('F-EVAL-W');q('F-EVAL-V');
  if(!r.technology)return steps;
  q(r.technology==='wpt'?'A-EXP-W':'A-EXP-V');
  if(r.technology==='wpt'&&r.privateRoute){info('positioning','E');q('A-EXP-P');}
  q('F-AUTH-V-01');
  for(const id of ['D-WPT-CHECK-01','D-WPT-CHECK-02','D-V2G-CHECK-01','D-V2G-CHECK-02','D-PARK-CHECK-01','D-PARK-CHECK-02'])q(id);
  if(r.privateRoute){
    info('F','F');const t=r.technology==='wpt'?'W':'V';
    for(const f of ['USE','EASE','ATT','BI','PBC','MOBR','BATR'])group(`E-${t}-${f}`);
    group('F-positioning');group('F-X-TRUST');group('F-service');q('F-X-ACCESS-BAR');
    for(const id of ['G-EMF-01','G-W-EMF-CONC-01','G-DATA-CONC-01','G-DATA-USE-01','G-ACCESS-01'])q(id);
    if(r.technology==='wpt'){info('wpt_gate','G');q('G-WPT-CONTEXT-01');if(r.technologyDCE){info('wpt_terms','G');tasks('wpt');}}
    else{info('v2g_terms','G');info('v2g_payment','G');q('G-V2G-CONTEXT-01');if(r.technologyDCE)tasks('v2g');}
  }else info('public','G');
  if(r.arm==='added_explanation')info('information','G',{title:'Some possible benefits and their conditions',body:data.information_cards[r.technology].join('\n\n')});
  for(const id of ['G-W-BI-POST-01','G-W-BI-POST-02','G-W-BI-POST-03','G-V-BI-POST-01','G-V-BI-POST-02','G-V-BI-POST-03','G-PUB-SUPPORT-POST-01','G-PUB-ATT-POST-01'])q(id);
  info('benefits','G');const benefits=data.groups.find(g=>g.id==='G-benefits');steps.push({...benefits,kind:'questions',question_ids:shuffle(benefits.question_ids,`${state.seed}:${r.technology}:benefits`)});
  for(const id of ['G-BEN-RANK-01','G-REF-CON-01','G-REF-MIN-01','G-PUB-MIN-01','G-V-PROS-01','G-V-PROS-02','G-V-PROS-03'])q(id);
  if(r.privateRoute)info('public','G');for(const id of ['G-PUB-FAIR-01','G-PUB-NONUSER-01','G-PUB-VOICE-01'])q(id);
  if(state.settings?.values){info('values','V');for(let n=1;n<=13;n++)q(`AE1r${n}`);}
  info('H','H');for(const id of ['H-AGE-01','H-GEN-01','H-LOC-01','H-EDU-01','H-OCC-01','H-HH-TYPE-01','H-HH-SIZE-01','H-CHILD-01','H-FIN-01'])q(id);
  return steps;
}
export function taskSnapshot(task,a,state,data) {
  const r=derive(a,state),ids=task.block==='transport'?r.available:task.block==='wpt'?[1,2,3]:[1,2];
  const order=[...shuffle(ids,`${state.seed}:${task.id}:positions`),task.block==='v2g'?3:4];
  return {task_id:task.id,source_task_id:task.source_task_id,design_version:task.design_version,block:task.block,practice:task.practice,available:[...ids],display_order:order,
    alternatives:order.map(id=>{const p=task.profiles.find(p=>p.id===id);return p?{canonical_id:id,label:p.label,attributes:structuredClone(p.attributes)}:{canonical_id:id,label:task.block==='transport'?'None of these offers would suit this trip':'None would suit this planned stop',attributes:null};})};
}
const clear=(a,prefixes)=>{for(const id of Object.keys(a))if(prefixes.some(p=>id.startsWith(p)))delete a[id];};
export function cleanState(data,state) {
  const next=structuredClone(state),a=next.answers;
  for(let pass=0;pass<3;pass++)for(const q of data.questions){
    if(!routeMatches(q.route,a,next)||q.optional_module&&!next.settings?.[q.optional_module]){delete a[q.id];continue;}
    const value=a[q.id],opts=optionsFor(q,a,next,data),codes=opts.map(o=>o.code);
    if(Array.isArray(value)){const valid=value.filter(v=>codes.includes(v));if(valid.length)a[q.id]=valid;else delete a[q.id];}
    else if(value!==undefined&&!codes.includes(value))delete a[q.id];
  }
  const path=pathFor(data,next),visible=new Set(path.flatMap(s=>s.question_ids||[])),tasks=new Map(path.filter(s=>s.kind==='choice').map(s=>[s.id,s.task]));
  for(const id of Object.keys(a))if(!visible.has(id))delete a[id];
  for(const id of Object.keys(next.choices)){
    const task=tasks.get(id),old=next.choiceSnapshots[id],expected=task?taskSnapshot(task,a,next,data):null;
    if(!task||!old||canonical(old)!==canonical(expected)||!expected.display_order.includes(next.choices[id])){delete next.choices[id];delete next.choiceSnapshots[id];}
  }
  for(const id of Object.keys(next.checks||{}))if(!visible.has(id))delete next.checks[id];
  return next;
}
export function updateAnswer(data,state,id,value) {
  const next=structuredClone(state),before=derive(state.answers,state),a=next.answers;
  a[id]=value;
  if(id.startsWith('A-JRN-')&&stable(state.answers[id])!==stable(value))clear(a,['C-']);
  if(['C-ALT-01','C-ALT-USED','C-ALT-02'].includes(id)&&before.alternativeMode!==derive(a,next).alternativeMode)clear(a,['C-PCAP','C-PSYC','C-POPP','C-SOPP','C-RMOT','C-INT','C-BEH','C-CTX','C-COND']);
  if(id==='C-COND-01'&&stable(state.answers[id])!==stable(value))clear(a,['C-INT','C-BEH-02']);
  if(id==='A-CHG-LOC')delete a['A-CHG-MAIN'];
  if(id==='A-HH-PT-01'||id==='A-VEH-ACCESS-01')clear(a,['A-CHG-']);
  const after=derive(a,next);
  if(stable([before.technology,before.privateRoute])!==stable([after.technology,after.privateRoute])){
    clear(a,['E-W-','E-V-','E-P-','F-X-','G-','A-EXP-','D-WPT-CHECK','D-V2G-CHECK','D-PARK-CHECK']);next.checks={};
  }
  return cleanState(data,next);
}
export function renderText(data,text,a,state,q=null) {
  const r=derive(a,state),find=(id,c)=>data.questions.find(q=>q.id===id)?.options.find(o=>o.code===c)?.label||'your selected journey';
  const current={1:'walking or wheeling',2:'cycling or an e-bike',3:'public transport',4:'a private car or light van as driver',5:'a private car or light van as passenger',6:'a shared or rental car',7:'a taxi or assisted transport',8:'the other mode you indicated'};
  const alt={1:'walking or wheeling',2:'cycling',3:'an e-bike',4:'public transport',5:'a shared vehicle service'};
  const changeLabels=(data.questions.find(q=>q.id==='C-COND-01')?.options||[]).filter(o=>r.changes.includes(o.code)&&o.code<90).map(o=>o.label.toLowerCase()).join('; ');
  const site=data.sites.find(s=>s.code===a['TEST-SITE-01'])?.label||'your local area';
  const benefit=q?.id.startsWith('G-BEN-IMP-')?data.benefits[r.technology]?.[Number(q.id.slice(-2))-1]?.label:'';
  let out=String(text||'').replaceAll('[MODE]',alt[r.alternativeMode]||'the selected option').replaceAll('[CURRENT MODE]',current[r.currentMode]||'your usual mode')
    .replaceAll('[JOURNEY]',find('A-JRN-01',a['A-JRN-01']).toLowerCase()).replaceAll('[TECH]',r.technology==='wpt'?'stationary wireless charging':'V2G')
    .replaceAll('[OPERATOR]','the service operator').replaceAll('[SITE]',site).replaceAll('[CHANGES]',changeLabels)
    .replaceAll('[BENEFICIARY]',r.privateRoute?'for you or your household':'when considering this service in your local area').replaceAll('[BENEFIT]',benefit||'');
  if(q&&(q.id.startsWith('C-INT-')||q.id==='C-BEH-02')&&r.conditional)out=`Imagine these changes have happened: ${changeLabels}. Everything else is as today. With those changes, ${out.charAt(0).toLowerCase()+out.slice(1)}`;
  return out;
}
export function stepErrors(data,step,state){
  if(step.kind==='choice')return state.choices[step.id]===undefined?[{id:step.id,message:'Choose one offer or the outside option to continue.'}]:[];
  return (step.question_ids||[]).map(id=>({id,message:answerError(data.questions.find(q=>q.id===id),state.answers,state,data)})).filter(e=>e.message);
}
export function allErrors(data,state){return pathFor(data,state).flatMap(s=>stepErrors(data,s,state));}
export function responseStatus(q,value,shown){
  if(!shown)return 'not_shown';if(value===undefined)return 'unfinished';
  if(value===99||has(value,99))return 'declined';if(value===98||has(value,98))return 'cannot_judge';
  if(q.type==='rating'&&value===97)return 'not_applicable';return 'answered';
}
export function exportSession(data,state,timing={}) {
  const r=derive(state.answers,state),path=pathFor(data,state),visible=new Set(path.flatMap(s=>s.question_ids||[])),order=path.filter(s=>s.kind==='choice').map(s=>s.id);
  return {schema_version:data.meta.schema_version,instrument_version:data.meta.version,instrument_content_sha256:data.meta.content_sha256,record_kind:'instrument_test',test_purpose:state.test_purpose||'flow_review',complete:state.finished,
    session_id:state.session_id,seed:state.seed,created_at:state.created_at,settings:state.settings,site:data.sites.find(s=>s.code===state.answers['TEST-SITE-01'])?.id||null,
    language:'en',source_document_sha256:data.meta.source_sha256,answers:structuredClone(state.answers),response_status:Object.fromEntries(data.questions.map(q=>[q.id,responseStatus(q,state.answers[q.id],visible.has(q.id))])),
    route:{...r,journey_selection:'respondent_chosen'},displayed_question_ids:[...visible],benefit_order:shuffle([1,2,3,4],`${state.seed}:${r.technology}:benefits`).map(n=>data.benefits[r.technology]?.[n-1]?.id),
    choices:data.tasks.map(task=>{const shown=order.includes(task.id);return shown?{...(state.choiceSnapshots[task.id]||taskSnapshot(task,state.answers,state,data)),selected:state.choices[task.id]??null,task_order:order.indexOf(task.id),status:state.choices[task.id]===undefined?'unfinished':'answered'}:{task_id:task.id,source_task_id:task.source_task_id,block:task.block,practice:task.practice,selected:null,status:'not_shown'};}),
    comprehension:structuredClone(state.checks||{}),timing:{definition:'Active visible-tab time, including revisits; excludes pauses and local comment editing.',...timing},collection_receipt:state.receipt||null};
}
export function submissionPayload(data,state,timing){const payload=exportSession(data,state,timing);delete payload.collection_receipt;return payload;}
export function validateInstrument(data){
  const e=[],ids=new Set();for(const q of data.questions){if(ids.has(q.id))e.push(`Duplicate ${q.id}`);ids.add(q.id);if(!q.text||!Array.isArray(q.options)||!q.options.length)e.push(`Incomplete ${q.id}`);}
  for(const g of data.groups)for(const id of g.question_ids)if(!ids.has(id))e.push(`Missing ${id}`);
  for(const block of ['transport','wpt','v2g']){const tasks=data.tasks.filter(t=>t.block===block);if(tasks.length!==(block==='transport'?5:7)||tasks.filter(t=>t.practice).length!==1)e.push(`Invalid ${block} task count`);}
  return e;
}
