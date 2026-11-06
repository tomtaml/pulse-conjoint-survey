import test from 'node:test';
import assert from 'node:assert/strict';
import {data,complete,payload} from './v2-fixtures.mjs';
import {pathFor,canonical,renderText} from '../public/v2/engine.mjs';
import {COMPACT_LAYOUT,LEGACY_LAYOUT,COMPACT_PAGES,presentationPath,isFinalPage} from '../public/v2/layout.mjs';
import {responseRuns,renderMatrix} from '../public/v2/matrix.mjs';
import {validatePayload} from '../worker/v2-handler.mjs';

const sequence=path=>path.flatMap(s=>s.kind==='questions'?s.question_ids:[s.id]);
test('compact pages preserve every item, intro, task and their order across eligible routes',()=>{
  const variants=[
    [{},{technology_override:'wpt'}],
    [{},{technology_override:'v2g'}],
    [{'A-VEH-ACCESS-01':3,'A-FUT-ROLE':2,'A-JRN-01':97,'B-TRIP-CONTEXT':97},{}],
    [{'A-VEH-ACCESS-01':3,'A-FUT-ROLE':1,'A-JRN-01':97},{}],
    [{'A-HH-PT-01':[2,4],'A-CHG-ROLE':3,'G-V2G-CONTEXT-01':98},{technology_override:'v2g'}],
    [{'C-ALT-01':97,'C-ALT-02':4,'C-COND-01':[1,3]},{information:true,values:true,ranking:true,prosumer:true,convenience:true,conditions:true}],
    [{'C-ALT-01':97,'C-ALT-02':97},{information:true}],
    [{'G-WPT-CONTEXT-01':98},{technology_override:'wpt',information:true}]
  ];
  for(const [answers,settings]of variants){
    const state=complete(answers,settings),original=pathFor(data,state),compact=presentationPath(original,state);
    assert.deepEqual(sequence(compact),sequence(original));
    assert.equal(new Set(compact.map(s=>s.id)).size,compact.length);
    assert(compact.length<original.length);
    assert(isFinalPage(compact.at(-1)));
    const legacy={...state,layout_version:LEGACY_LAYOUT};
    assert.equal(presentationPath(original,legacy),original);
    assert.equal(presentationPath(original,{...state,layout_version:undefined}),original);
  }
});
test('every compact group refers to real source items within its original section',()=>{
  for(const page of COMPACT_PAGES){
    for(const id of page.question_ids){const q=data.questions.find(q=>q.id===id);assert(q,`${page.id}: ${id}`);assert.equal(q.section,page.section);}
    assert(page.question_ids.length<=6);
  }
  const s=complete({}, {technology_override:'wpt'}),pages=presentationPath(pathFor(data,s),s);
  assert(!pages.some(p=>p.question_ids?.some(id=>id.startsWith('C-HAB'))&&p.question_ids?.some(id=>id.startsWith('C-INT'))));
  assert(!isFinalPage({id:'page-E-evaluation',question_ids:['F-EVAL-W','F-EVAL-V']}));
});
test('shared response headers never combine differing labels or response codes',()=>{
  const agreement=data.questions.find(q=>q.id==='E-W-USE-01'),importance=data.questions.find(q=>q.id==='G-BEN-IMP-01');
  const other={...agreement,id:'other',options:agreement.options.map(o=>o.code===98?{...o,label:'Not sure'}:o)};
  const runs=responseRuns([agreement,{...agreement,id:'matching'},importance,other],q=>q.options);
  assert.deepEqual(runs.map(r=>r.questions.length),[2,1,1]);
  const capped=responseRuns(Array.from({length:8},(_,i)=>({...agreement,id:`q${i}`})),q=>q.options);
  assert.deepEqual(capped.map(r=>r.questions.length),[6,2]);
});
test('matrix retains named radio groups, separate non-response options and accessible statements',()=>{
  const state=complete({}, {technology_override:'wpt'}),questions=data.questions.filter(q=>['E-W-USE','E-W-EASE'].includes(q.construct));
  const html=renderMatrix({id:'test-grid',title:'Using the service',questions,options:questions[0].options,answers:{...state.answers,'E-W-USE-01':98},
    promptFor:q=>renderText(data,q.text,state.answers,state,q),groupFor:q=>q.construct,invalidIds:['E-W-EASE-01']});
  assert.equal((html.match(/type="radio"/g)||[]).length,48);
  for(const q of questions){
    assert.equal((html.match(new RegExp(`name="${q.id}"`,'g'))||[]).length,8);
    for(const code of [1,2,3,4,5,97,98,99])assert(html.includes(`id="q-${q.id}-${code}"`));
    assert(html.includes(`aria-labelledby="field-${q.id} test-grid-option-98"`));
  }
  assert.match(html,/id="q-E-W-USE-01-98"[^>]* checked/);
  assert.match(html,/id="q-E-W-EASE-01-1"[^>]*aria-invalid="true"/);
  assert.equal((html.match(/<tbody>/g)||[]).length,2);
  for(const label of ['Not applicable','Cannot judge','Prefer not to answer'])assert(html.includes(label));
  assert(!html.includes('[TECH]'));
});
test('new compact timing and layout metadata validate while older response contracts remain valid',()=>{
  const state=complete({}, {technology_override:'wpt'}),p=payload(state);
  p.timing={active_ms:1500,by_step_ms:{'page-F-w-use-ease':1500},visits:{'page-F-w-use-ease':1}};
  const safe=validatePayload(data,p);
  assert.equal(safe.layout_version,COMPACT_LAYOUT);assert.equal(safe.timing.by_section_ms.F,1500);
  const legacy=payload({...state,layout_version:undefined});
  const oldSafe=validatePayload(data,legacy);assert(!Object.hasOwn(oldSafe,'layout_version'));
  const legacyCompactTime={...p};delete legacyCompactTime.layout_version;
  assert.throws(()=>validatePayload(data,legacyCompactTime),/timing/);
  assert.throws(()=>validatePayload(data,{...p,layout_version:'unrecognised'}),/layout/);
  const normalNew={...safe};delete normalNew.layout_version;normalNew.timing=oldSafe.timing;
  assert.equal(canonical(normalNew),canonical(oldSafe));
});
