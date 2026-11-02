import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {derive,routeMatches,optionsFor,rowsFor,pathFor,stepErrors,freshState,updateAnswer,taskSnapshot,contextLabels,renderPrompt,exportSession,validateSurvey,ReviewClock} from '../public/engine.mjs';
const data=JSON.parse(await fs.readFile(new URL('../public/survey.json',import.meta.url),'utf8'));
const base={
  'A-MOB-01':[3,5],'A-MOB-PRIMARY':3,'A-MOB-02':[1,3,5],'A-VEH-01':2,'R-DRIVE-01':2,'A-VEH-ACCESS-01':2,'A-EV-ACCESS-01':4,'A-OPP-01':[3],
  'A-AFF-01':2,'A-FUT-ROLE':1,'A-PUR-01':{work:0,errands:3,leisure:2},'A-PUR-02':{errands:3,leisure:1},
  'A-JRN-01':2,'A-JRN-02':3,'A-JRN-03':2,'A-JRN-04':3,'A-JRN-05':3,'B-TRIP-CONTEXT':2,'B-MODE-EVAL':[1,3],'C-ALT-01':1
};
function state(answers={}){return {...freshState(42),started:true,answers:{...structuredClone(base),...answers}};}
const question=id=>data.questions.find(q=>q.id===id);
const pathIds=s=>pathFor(data,s).map(step=>step.id);

test('the private walkthrough contains the complete 56-item implementation and 22 source COM-B ratings',()=>{
  assert.deepEqual(validateSurvey(data),[]);assert.equal(data.questions.length,56);assert.equal(data.questions.filter(q=>q.type==='rating').length,22);
  assert.equal(data.questions.filter(q=>q.proposal).length,1);assert.equal(data.tasks.length,5);
  const families=Object.fromEntries(data.groups.map(g=>[g.id,g.question_ids.length]));
  assert.deepEqual(families,{'C-PCAP':3,'C-PSYC':3,'C-POPP':3,'C-SOPP':3,'C-RMOT':3,'C-HAB':4,'C-INT':3});
});
test('all 60 numerical profile values equal the unchanged Version A source tables',()=>{
  const expected={
    'T-P':[[3,35,98,5],[8,40,90,0],[1,60,80,10]],
    'T-01':[[5,35,90,5],[8,30,98,5],[3,45,90,10]],
    'T-02':[[8,25,98,0],[4,55,80,10],[1,60,98,0]],
    'T-03':[[3,50,80,10],[12,30,90,0],[5,30,98,5]],
    'T-04':[[5,25,80,5],[8,40,98,0],[3,45,90,10]]
  };
  for(const task of data.tasks)assert.deepEqual(task.profiles.map(p=>['cost','time','reliability','walk'].map(k=>p.attributes[k])),expected[task.id]);
});
test('transport appears before alternative selection and every COM-B rating, with practice first',()=>{
  const steps=pathFor(data,state()),ids=steps.map(s=>s.id),choices=steps.filter(s=>s.kind==='choice');
  assert.equal(choices[0].id,'T-P');assert.equal(choices.filter(s=>!s.task.practice).length,4);
  assert(ids.indexOf('A-JRN-02')<ids.indexOf('T-P'));
  assert(ids.indexOf('C-ALT-01')>Math.max(...choices.map(s=>ids.indexOf(s.id))));
  assert(ids.indexOf('C-PCAP')>ids.indexOf('C-ALT-01'));assert(ids.indexOf('intro-D')>ids.indexOf('C-INT'));
});
test('mode availability masks offers, retains a true outside option and does not infer it from daily travel',()=>{
  const s=state({'A-MOB-02':[1],'B-MODE-EVAL':[1,3]});assert(derive(s.answers).transport);
  const t=data.tasks.find(t=>t.id==='T-01'),snapshot=taskSnapshot(t,s.answers,s.seed,data.meta.design_version);
  assert.deepEqual([...snapshot.display_order].sort(),[1,3,4]);assert.equal(snapshot.alternatives.at(-1).attributes,null);
  assert.equal(snapshot.alternatives.find(p=>p.canonical_id===1).attributes.cost,5);
  assert(!derive({...s.answers,'B-MODE-EVAL':[3]}).transport);
  assert(!derive({...s.answers,'B-MODE-EVAL':[1,3,98]}).transport);
  assert(!derive({...s.answers,'B-TRIP-CONTEXT':97}).transport);
  assert(derive({...s.answers,'B-TRIP-CONTEXT':99}).transport);
});
test('non-car citizens, non-drivers and unresolved journey anchors are retained without fabricated references',()=>{
  const s=state({'A-VEH-ACCESS-01':3,'A-VEH-01':1,'A-FUT-ROLE':2,'B-MODE-EVAL':[3],'A-JRN-01':97});
  const ids=pathIds(s);assert(!ids.includes('T-P'));assert(!ids.includes('C-ALT-01'));assert(!ids.includes('C-HAB'));assert(ids.includes('intro-D'));assert(ids.includes('A-PV-01'));
  assert.equal(derive(s.answers).combStatus,'journey_unresolved');
  const walking=state({'A-VEH-ACCESS-01':3,'A-VEH-01':1,'A-FUT-ROLE':2,'R-DRIVE-01':2,'A-JRN-02':1});
  assert(pathIds(walking).includes('C-PCAP'));assert(pathIds(walking).includes('C-HAB'));
});
test('purpose-specific mode questions follow only purposes with reported journeys',()=>{
  const a=state().answers;assert.deepEqual(rowsFor(question('A-PUR-02'),a).map(r=>r.id),['errands','leisure']);
  const noPurposes={...a,'A-PUR-01':{work:0,errands:98,leisure:99}};
  assert(!routeMatches('purpose_modes',noPurposes));
  let s=state();s=updateAnswer(data,s,'A-PUR-01',{work:0,errands:0,leisure:2});assert.deepEqual(s.answers['A-PUR-02'],{leisure:1});
});
test('none feasible requires conditional selection; already-used mode requires explicit confirmation',()=>{
  const conditional=state({'C-ALT-01':97,'C-ALT-02':2});
  assert.equal(derive(conditional.answers).alternativeMode,2);assert(derive(conditional.answers).hypothetical);assert(pathIds(conditional).includes('C-ALT-02'));
  const unresolved=state({'C-ALT-01':97,'C-ALT-02':97});assert(!pathIds(unresolved).includes('C-PCAP'));assert(pathIds(unresolved).includes('C-HAB'));
  const already=state({'C-ALT-01':6});assert(!derive(already.answers).alternativeMode);assert(pathIds(already).includes('C-ALT-USED'));
  already.answers['C-ALT-USED']=4;assert.equal(derive(already.answers).alternativeMode,4);assert(pathIds(already).includes('C-INT'));
  assert(!pathIds(state({'C-ALT-01':98})).includes('C-PSYC'));
});
test('habit uses actual usual mode and remains separate from alternative-mode ratings',()=>{
  const a=state({'A-JRN-02':4,'C-ALT-01':3}).answers;
  const habit=renderPrompt(data,question('C-HAB-01'),a),intention=renderPrompt(data,question('C-INT-01'),a);
  assert.match(habit,/private car.*driver/);assert.match(intention,/an e-bike/);assert(!habit.includes('[CURRENT MODE]'));
  assert(!pathIds(state({'A-JRN-02':96})).includes('C-HAB'));
  assert.equal(contextLabels(data,a).journey,'Shopping, services or caring responsibilities');
});
test('changing journey or alternative clears ratings with the old referent; habit survives an alternative-only edit',()=>{
  let s=state({'C-PCAP-01':5,'C-HAB-01':4,'C-INT-01':4,'C-BEH-01':2});
  s=updateAnswer(data,s,'C-ALT-01',4);assert.equal(s.answers['C-PCAP-01'],undefined);assert.equal(s.answers['C-INT-01'],undefined);assert.equal(s.answers['C-HAB-01'],4);
  s=updateAnswer(data,s,'A-JRN-02',4);assert.equal(s.answers['C-ALT-01'],undefined);assert.equal(s.answers['C-HAB-01'],undefined);
});
test('changing the transport offer set invalidates old choices even when the outside option was selected',()=>{
  let s=state();s.choices['T-01']=4;s.choiceSnapshots['T-01']=taskSnapshot(data.tasks.find(t=>t.id==='T-01'),s.answers,s.seed,data.meta.design_version);
  s=updateAnswer(data,s,'B-MODE-EVAL',[2,3]);assert.deepEqual(s.choices,{});assert.deepEqual(s.choiceSnapshots,{});
});
test('charging is routed by household plug-in access and knowledge, not personal driving or ownership',()=>{
  const informed=state({'R-DRIVE-01':2,'A-EV-ACCESS-01':3,'A-CHG-ROLE':2,'A-CHG-LOC':[1,3]});
  for(const id of ['A-CHG-ROLE','A-CHG-LOC','A-CHG-MAIN','A-CHG-OUT','A-CHG-SCHED'])assert(pathIds(informed).includes(id));
  const unaware=state({'A-EV-ACCESS-01':1,'A-CHG-ROLE':3});assert(pathIds(unaware).includes('A-CHG-ROLE'));assert(!pathIds(unaware).includes('A-CHG-LOC'));
  const notEV=state({'A-EV-ACCESS-01':4});assert(!pathIds(notEV).includes('A-CHG-ROLE'));assert(pathIds(notEV).includes('A-PARK-CHG'),'future household role can support parking context');
});
test('one charging location is derived, multiple locations are asked and stale detail is removed',()=>{
  const single=state({'A-EV-ACCESS-01':2,'A-CHG-ROLE':1,'A-CHG-LOC':[1]});
  assert(!pathIds(single).includes('A-CHG-MAIN'));assert.deepEqual(derive(single.answers).chargingMain,{value:1,status:'derived_from_single_location'});
  const multi=state({'A-EV-ACCESS-01':1,'A-CHG-ROLE':1,'A-CHG-LOC':[1,3],'A-CHG-MAIN':3,'A-CHG-SCHED':1});
  assert.deepEqual(optionsFor(question('A-CHG-MAIN'),multi.answers).filter(o=>o.code<90).map(o=>o.code),[1,3]);
  const noHome=updateAnswer(data,multi,'A-CHG-LOC',[3]);assert.equal(noHome.answers['A-CHG-SCHED'],undefined);assert.equal(noHome.answers['A-CHG-MAIN'],undefined);
  const noEV=updateAnswer(data,multi,'A-EV-ACCESS-01',4);assert.equal(noEV.answers['A-CHG-ROLE'],undefined);assert.equal(noEV.answers['A-CHG-LOC'],undefined);
});
test('validation preserves zero counts and non-response codes without inventing neutral ratings',()=>{
  const step=pathFor(data,state()).find(s=>s.id==='C-BEH-02');assert.deepEqual(stepErrors(data,step,state({'C-BEH-02':0})),[]);
  assert(stepErrors(data,step,state()).length>0);
  const group=pathFor(data,state()).find(s=>s.id==='C-PCAP');assert.deepEqual(stepErrors(data,group,state({'C-PCAP-01':97,'C-PCAP-02':98,'C-PCAP-03':99})),[]);
  const multi=pathFor(data,state()).find(s=>s.id==='A-MOB-01');assert(stepErrors(data,multi,state({'A-MOB-01':[3,99]})).length>0);
});
test('test-session export distinguishes unassigned, unfinished, practice and the shown canonical profiles',()=>{
  const s=state();s.choices['T-P']=4;s.choiceSnapshots['T-P']=taskSnapshot(data.tasks[0],s.answers,s.seed,data.meta.design_version);
  const out=exportSession(data,s,{active_ms:0});
  assert.equal(out.choices.find(t=>t.task_id==='T-P').selected,4);assert(out.choices.find(t=>t.task_id==='T-P').practice);
  assert.equal(out.choices.find(t=>t.task_id==='T-01').selected,null);
  const skipped=exportSession(data,state({'B-MODE-EVAL':[3]}),{active_ms:0});assert(skipped.choices.every(t=>t.selected===96));
  assert.equal(out.screener_status,'not_administered_in_this_fragment');
});
test('timing excludes hidden tabs, manual pauses and comment entry, and includes revisits once',()=>{
  const c=new ReviewClock({},0);c.start(0);c.enter('A-MOB-01','A',0);c.commenting(true,1000);c.snapshot(6000);c.commenting(false,6000);c.visibility(true,7000);c.enter('T-P','B',10000);c.visibility(false,11000);c.pause(true,12500);
  assert.equal(c.snapshot(20000).active_ms,3500);assert.equal(c.snapshot(21000).by_section_ms.A,2000);assert.equal(c.snapshot(22000).by_section_ms.B,1500);
  c.commenting(true,23000);c.commenting(false,24000);assert(c.manualPaused,'closing comments does not cancel a deliberate pause');
  c.pause(false,25000);c.enter('A-MOB-01','A',26000);c.finish(27000);
  const final=c.snapshot(100000);assert.equal(final.active_ms,5500);assert.equal(final.visits['A-MOB-01'],2);
  const restored=new ReviewClock(final,200000);assert.equal(restored.snapshot(300000).active_ms,5500);
});
