export const PURPOSES=['work','errands','leisure'];
export const substantive=v=>Number.isInteger(v)&&v>=1&&v<=8;
const includes=(v,c)=>Array.isArray(v)&&v.includes(c);
const list=v=>Array.isArray(v)?[...new Set(v)].sort((a,b)=>a-b):[];
export function derive(a={}) {
  const journey=[1,2,3,4].includes(a['A-JRN-01']);
  const currentMode=substantive(a['A-JRN-02'])?a['A-JRN-02']:null;
  const direct=a['C-ALT-01'];
  const chosen=direct===97?a['C-ALT-02']:direct===6?a['C-ALT-USED']:direct;
  const alternativeMode=journey&&[1,2,3,4,5].includes(chosen)?chosen:null;
  const hypothetical=direct===97;
  const availability=list(a['B-MODE-EVAL']);
  const available=availability.some(c=>c>=97)?[]:availability.filter(c=>[1,2,3].includes(c));
  const transport=[1,2,3,4,99].includes(a['B-TRIP-CONTEXT'])&&available.length>=2;
  const plugAccess=[1,2,3].includes(a['A-EV-ACCESS-01']);
  const informed=plugAccess&&[1,2].includes(a['A-CHG-ROLE']);
  const locations=informed?list(a['A-CHG-LOC']).filter(c=>c>=1&&c<=7):[];
  const purposeRows=PURPOSES.filter(p=>[1,2,3,4,5].includes(a['A-PUR-01']?.[p]));
  return {journey,currentMode,alternativeMode,hypothetical,available,transport,plugAccess,informed,locations,purposeRows,
    parkingContext:[1,2].includes(a['A-VEH-ACCESS-01'])||a['A-FUT-ROLE']===1||plugAccess,
    chargingMain:locations.length===1?{value:locations[0],status:'derived_from_single_location'}:locations.length>=2?{value:a['A-CHG-MAIN']??null,status:'asked_multiple_locations'}:{value:null,status:'not_applicable_or_unresolved'},
    combStatus:!journey?'journey_unresolved':alternativeMode?hypothetical?'conditional_mode':'current_mode_option_selected':'alternative_mode_unresolved'};
}
export function routeMatches(route,a) {
  const r=derive(a);
  switch(route) {
    case 'always':return true;
    case 'purpose_modes':return r.purposeRows.length>0;
    case 'has_journey':return r.journey;
    case 'transport_context':return a['B-TRIP-CONTEXT']!==97;
    case 'transport':return r.transport;
    case 'conditional_mode':return r.journey&&a['C-ALT-01']===97;
    case 'confirm_used_mode':return r.journey&&a['C-ALT-01']===6;
    case 'alternative':return !!r.alternativeMode;
    case 'habit':return r.journey&&!!r.currentMode;
    case 'parking_context':return r.parkingContext;
    case 'plug_access':return r.plugAccess;
    case 'charging_details':return r.informed;
    case 'charging_main':return r.informed&&r.locations.length>=2;
    case 'charging_out':return r.informed&&r.locations.some(c=>[3,4,5,6].includes(c));
    case 'charging_home':return r.informed&&r.locations.some(c=>[1,2].includes(c));
    default:return false;
  }
}
export function optionsFor(q,a) {
  if(q.option_filter==='used_modes')return q.options.filter(o=>o.code>=90||includes(a['A-MOB-01'],o.code));
  if(q.option_filter==='charging_locations')return q.options.filter(o=>o.code>=90||derive(a).locations.includes(o.code));
  return q.options;
}
export function rowsFor(q,a){return q.id==='A-PUR-02'?q.rows.filter(row=>derive(a).purposeRows.includes(row.id)):q.rows||[];}
export function shuffle(items,seed) {
  const out=[...items];let value=2166136261;
  for(const char of String(seed)){value^=char.charCodeAt(0);value=Math.imul(value,16777619);}
  for(let i=out.length-1;i>0;i--){value^=value<<13;value^=value>>>17;value^=value<<5;const j=(value>>>0)%(i+1);[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
export function taskSnapshot(task,a,seed,designVersion) {
  const available=derive(a).available;
  const order=[...shuffle(available,`${seed}:${task.id}:positions`),4];
  return {task_id:task.id,practice:task.practice,design_version:designVersion,available,display_order:order,alternatives:order.map(id=>id===4?{canonical_id:4,label:'None of these — I would use another available way of travelling',attributes:null}:{canonical_id:id,label:task.profiles.find(p=>p.id===id).label,attributes:structuredClone(task.profiles.find(p=>p.id===id).attributes)})};
}
export function freshState(seed=globalThis.crypto.getRandomValues(new Uint32Array(1))[0]) {
  return {version:1,seed,started:false,finished:false,currentId:'welcome',answers:{},choices:{},choiceSnapshots:{},notes:{},renderedPrompts:{},clock:null};
}
const anchorKey=a=>JSON.stringify(['A-JRN-01','A-JRN-02','A-JRN-03','A-JRN-04','A-JRN-05'].map(k=>a[k]??null));
const altKey=a=>JSON.stringify([derive(a).alternativeMode,derive(a).hypothetical]);
const clearPrefix=(a,prefixes)=>{for(const id of Object.keys(a))if(prefixes.some(p=>id.startsWith(p)))delete a[id];};
export function cleanState(data,state) {
  const next=structuredClone(state),a=next.answers;
  for(let loop=0;loop<4;loop++)for(const q of data.questions) {
    if(!routeMatches(q.route,a)){delete a[q.id];continue;}
    const value=a[q.id],opts=optionsFor(q,a),codes=opts.map(o=>o.code);
    if(q.type==='matrix'&&value&&typeof value==='object'&&!Array.isArray(value)) {
      const rows=rowsFor(q,a).map(r=>r.id);for(const row of Object.keys(value))if(!rows.includes(row)||!codes.includes(value[row]))delete value[row];
    }else if(Array.isArray(value)) {
      const valid=list(value).filter(v=>codes.includes(v));
      if(valid.some(v=>opts.find(o=>o.code===v)?.exclusive)&&valid.length>1)delete a[q.id];else if(valid.length)a[q.id]=valid;else delete a[q.id];
    }else if(value!==undefined&&!codes.includes(value))delete a[q.id];
  }
  const r=derive(a);
  for(const tid of Object.keys(next.choices)) {
    const snapshot=next.choiceSnapshots[tid];
    if(!r.transport||!data.tasks.some(t=>t.id===tid)||!snapshot||JSON.stringify(snapshot.available)!==JSON.stringify(r.available)||!snapshot.display_order.includes(next.choices[tid])){delete next.choices[tid];delete next.choiceSnapshots[tid];}
  }
  return next;
}
export function updateAnswer(data,state,id,value) {
  const next=structuredClone(state),before=state.answers;
  next.answers[id]=value;
  if(anchorKey(before)!==anchorKey(next.answers))clearPrefix(next.answers,['C-']);
  else if(altKey(before)!==altKey(next.answers))clearPrefix(next.answers,['C-PCAP','C-PSYC','C-POPP','C-SOPP','C-RMOT','C-INT','C-BEH','C-CTX']);
  if(before['A-EV-ACCESS-01']!==next.answers['A-EV-ACCESS-01'])clearPrefix(next.answers,['A-CHG-']);
  if(JSON.stringify(list(before['A-CHG-LOC']))!==JSON.stringify(list(next.answers['A-CHG-LOC'])))delete next.answers['A-CHG-MAIN'];
  return cleanState(data,next);
}
export function answerError(q,a) {
  const value=a[q.id],opts=optionsFor(q,a),codes=opts.map(o=>o.code);
  if(q.type==='matrix') {
    if(!value||rowsFor(q,a).some(row=>!codes.includes(value[row.id])))return 'Please choose an answer for each purpose shown.';
    return null;
  }
  if(q.type==='multi') {
    if(!Array.isArray(value)||!value.length)return 'Please select at least one option, including a non-response option if appropriate.';
    if(new Set(value).size!==value.length||value.some(v=>!codes.includes(v)))return 'Select valid, distinct options.';
    if(value.length>1&&value.some(v=>opts.find(o=>o.code===v)?.exclusive))return 'Use None, uncertainty or refusal on its own.';
    return null;
  }
  return codes.includes(value)?null:'Please choose one of the answers shown.';
}
export function pathFor(data,state) {
  const a=state.answers,r=derive(a),steps=[];
  const info=(id,section,route=true,custom=null)=>{if(route)steps.push({id:`intro-${id}`,kind:'info',section,content:custom||data.instructions[id]});};
  const q=(id)=>{const item=data.questions.find(q=>q.id===id);if(item&&routeMatches(item.route,a))steps.push({id,kind:'questions',section:item.section,question_ids:[id]});};
  info('A','A');
  for(const id of ['A-MOB-01','A-MOB-PRIMARY','A-MOB-02','A-VEH-01','R-DRIVE-01','A-VEH-ACCESS-01','A-EV-ACCESS-01','A-OPP-01','A-AFF-01','A-FUT-ROLE'])q(id);
  info('purposes','A');q('A-PUR-01');q('A-PUR-02');
  info('journey','A');for(const id of ['A-JRN-01','A-JRN-02','A-JRN-03','A-JRN-04','A-JRN-05'])q(id);
  info('B','B');q('B-TRIP-CONTEXT');q('B-MODE-EVAL');info('scenario','B',r.transport);
  if(r.transport)for(const task of [...data.tasks.filter(t=>t.practice),...shuffle(data.tasks.filter(t=>!t.practice),`${state.seed}:task-order`)])steps.push({id:task.id,kind:'choice',section:'B',task});
  info('C','C',r.journey);
  if(!r.journey)info('C-skipped','C',true,{title:'Continue with your current circumstances',body:'The next journey-specific statements use one recurring ordinary journey. We will move on to the questions about vehicles, parking and charging.'});
  for(const id of ['C-ALT-01','C-ALT-02','C-ALT-USED'])q(id);
  if(r.journey&&!r.alternativeMode&&a['C-ALT-01']!==undefined)info('C-unresolved','C',true,{title:'Your usual travel',body:'You do not need to choose a transport option that does not suit this journey. We will continue with any questions about your usual travel and current circumstances.'});
  for(const group of data.groups)if(routeMatches(group.route,a))steps.push({id:group.id,kind:'questions',section:'C',title:group.title,question_ids:group.question_ids});
  for(const id of ['C-BEH-01','C-BEH-02','C-CTX-01'])q(id);
  info('D','D');for(const id of ['A-DEC-01','A-TIME-01','A-PV-01','A-PARK-CHG','A-CHG-ROLE','A-CHG-LOC','A-CHG-MAIN','A-CHG-OUT','A-CHG-SCHED'])q(id);
  return steps;
}
export function stepErrors(data,step,state) {
  if(step.kind==='choice')return state.choices[step.id]===undefined?[{id:step.id,message:'Choose one offer or None of these to continue.'}]:[];
  if(step.kind!=='questions')return [];
  return step.question_ids.map(id=>{const q=data.questions.find(q=>q.id===id);return {id,message:answerError(q,state.answers)};}).filter(e=>e.message);
}
export function contextLabels(data,a) {
  const find=(id,code)=>data.questions.find(q=>q.id===id)?.options.find(o=>o.code===code)?.label??'Not specified';
  const r=derive(a);
  const alt={1:'walking or wheeling',2:'cycling',3:'an e-bike',4:'public transport',5:'a shared vehicle service'};
  const current={1:'walking or wheeling',2:'cycling or an e-bike',3:'public transport',4:'a private car or light van as driver',5:'a private car or light van as passenger',6:'a shared or rental car',7:'a taxi or assisted transport',8:'the other mode you indicated'};
  return {journey:find('A-JRN-01',a['A-JRN-01']),current:current[r.currentMode]||null,alternative:alt[r.alternativeMode]||null,conditional:r.hypothetical};
}
export function renderPrompt(data,q,a) {
  const c=contextLabels(data,a);
  return q.text.replaceAll('[CURRENT MODE]',c.current||'[CURRENT MODE]').replaceAll('[MODE]',c.alternative||'[MODE]');
}
export function exportSession(data,state,clock) {
  const r=derive(state.answers),visible=new Set(pathFor(data,state).flatMap(s=>s.question_ids||[])),order=pathFor(data,state).filter(s=>s.kind==='choice').map(s=>s.id);
  const statuses=Object.fromEntries(data.questions.map(q=>[q.id,!visible.has(q.id)?'not_shown':state.answers[q.id]===undefined?'unfinished':state.answers[q.id]===99||includes(state.answers[q.id],99)?'declined':'answered']));
  if(r.chargingMain.status==='derived_from_single_location')statuses['A-CHG-MAIN']='derived_from_single_location';
  return {purpose:'private_draft_walkthrough',complete:state.finished,versions:data.meta,screener_status:'not_administered_in_this_fragment',answers:state.answers,response_status:statuses,derived:{...r,journey_selection:'respondent_chosen',hypothetical_mode_flag:r.hypothetical?1:0},displayed_prompts:state.renderedPrompts,
    choices:data.tasks.map(task=>r.transport?{...(state.choiceSnapshots[task.id]||taskSnapshot(task,state.answers,state.seed,data.meta.design_version)),task_order:order.indexOf(task.id),selected:state.choices[task.id]??null,status:state.choices[task.id]===undefined?'unfinished':'answered'}:{task_id:task.id,practice:task.practice,selected:96,status:'not_assigned'}),
    timing:{definition:'Active visible-tab respondent time; excludes pauses and comment editing; includes revisits.',...clock},comments:state.notes};
}
export function validateSurvey(data) {
  const errors=[],ids=new Set();
  for(const q of data.questions){if(ids.has(q.id))errors.push(`Duplicate question ${q.id}`);ids.add(q.id);if(!q.text||!q.options.length)errors.push(`Incomplete ${q.id}`);if(new Set(q.options.map(o=>o.code)).size!==q.options.length)errors.push(`Duplicate response code ${q.id}`);}
  if(data.questions.filter(q=>q.type==='rating').length!==22)errors.push('The Version A source contains 22 core ratings.');
  if(data.tasks.length!==5||data.tasks.filter(t=>t.practice).length!==1)errors.push('Transport has one practice and four scored tasks.');
  for(const group of data.groups)for(const id of group.question_ids)if(!ids.has(id))errors.push(`Missing group item ${id}`);
  for(const t of data.tasks)for(const p of t.profiles)if(Object.values(p.attributes).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))errors.push(`Invalid DCE values ${t.id}`);
  return errors;
}

export class ReviewClock {
  constructor(saved={},now=0){this.totals={...saved.by_step_ms};this.sections={...saved.sections};this.visits={...saved.visits};this.current=saved.current??null;this.started=!!saved.started;this.finished=!!saved.finished;this.manualPaused=!!saved.manual_paused;this.hidden=false;this.comment=false;this.last=now;}
  get active(){return this.started&&!this.finished&&!this.manualPaused&&!this.hidden&&!this.comment;}
  flush(now){if(this.active&&this.current)this.totals[this.current]=(this.totals[this.current]||0)+Math.max(0,now-this.last);this.last=now;}
  start(now){this.flush(now);this.started=true;this.finished=false;this.manualPaused=false;}
  enter(id,section,now){this.flush(now);if(this.current!==id)this.visits[id]=(this.visits[id]||0)+1;this.current=id;this.sections[id]=section;}
  pause(value,now){this.flush(now);this.manualPaused=value;}
  visibility(hidden,now){this.flush(now);this.hidden=hidden;}
  commenting(value,now){this.flush(now);this.comment=value;}
  finish(now){this.flush(now);this.finished=true;}
  snapshot(now){this.flush(now);const by_step_ms=Object.fromEntries(Object.entries(this.totals).map(([k,v])=>[k,Math.round(v)]));const by_section_ms={A:0,B:0,C:0,D:0};for(const [key,ms]of Object.entries(by_step_ms))by_section_ms[this.sections[key]]=(by_section_ms[this.sections[key]]||0)+ms;return {active_ms:Object.values(by_step_ms).reduce((a,b)=>a+b,0),by_step_ms,by_section_ms,visits:{...this.visits},sections:{...this.sections},current:this.current,started:this.started,finished:this.finished,manual_paused:this.manualPaused};}
}
