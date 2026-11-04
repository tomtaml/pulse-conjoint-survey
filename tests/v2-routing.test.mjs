import test from 'node:test';
import assert from 'node:assert/strict';
import {data,bev,complete,ids,payload} from './v2-fixtures.mjs';
import {derive,cleanState,updateAnswer,pathFor,taskSnapshot,renderText,allErrors,validateInstrument,canonical} from '../public/v2/engine.mjs';

test('v2 source has coherent blocks, distinct versioned prototypes and short defaults',()=>{
  assert.deepEqual(validateInstrument(data),[]);assert.equal(data.tasks.length,19);
  for(const family of ['C-PCAP','C-PSYC','C-POPP','C-SOPP','C-RMOT','C-INT'])assert.equal(data.questions.filter(q=>q.construct===family).length,3);
  assert.equal(data.questions.filter(q=>q.construct==='C-HAB').length,4);
  assert(Object.values(data.meta.defaults).every(v=>v===false));
  for(const task of data.tasks)assert(task.id!==task.source_task_id);
});
test('complete BEV routes show one technology battery and at most ten scored choices',()=>{
  for(const technology of ['wpt','v2g']){
    const s=complete({}, {technology_override:technology}),r=derive(s.answers,s),path=pathFor(data,s);
    assert.equal(r.technology,technology);assert(r.privateRoute);assert.equal(path.filter(x=>x.kind==='choice').length,12);
    assert.equal(path.filter(x=>x.kind==='choice'&&!x.task.practice).length,10);assert.deepEqual(allErrors(data,s),[]);
    assert.equal(path.some(x=>x.id===`E-${technology==='wpt'?'V':'W'}-USE`),false);
    assert(!ids(s).includes('AE1r1'));assert(!ids(s).includes('G-V-PROS-01'));assert(!ids(s).includes('G-BEN-RANK-01'));
    const ratings=path.flatMap(x=>x.question_ids||[]).filter(id=>data.questions.find(q=>q.id===id).type==='rating');
    assert.equal(ratings.length,technology==='wpt'?56:60);
  }
});
test('mixed plug-in/non-plug-in households preserve types but unknown charging details skip',()=>{
  const s=complete({'A-HH-PT-01':[2,4],'A-CHG-ROLE':3,'F-EVAL-W':2},{technology_override:'v2g'});
  assert.deepEqual(s.answers['A-HH-PT-01'],[2,4]);assert(derive(s.answers,s).plugAccess);
  assert(ids(s).includes('A-DEC-01'));assert(!ids(s).includes('A-CHG-LOC'));assert(!ids(s).includes('A-CHG-SCHED'));
  assert.equal(derive(s.answers,s).allocationMethod,'review_override');
});
test('a non-driver future shared-use respondent can evaluate WPT without invented current charging',()=>{
  const s=complete({'A-MOB-01':[3],'A-MOB-PRIMARY':3,'R-DRIVE-01':2,'A-VEH-ACCESS-01':3,'A-FUT-ROLE':1,
    'B-MODE-EVAL':[3],'C-ALT-01':6,'C-ALT-USED':4,'A-JRN-02':3},{technology_override:'wpt'});
  const r=derive(s.answers,s);assert(r.privateRoute);assert.equal(r.combTarget,'maintenance');assert(!r.plugAccess);
  assert(!ids(s).includes('A-HH-PT-01'));assert(!ids(s).includes('A-TIME-01'));assert(!ids(s).some(id=>id.startsWith('T09-')));assert(ids(s).includes('W09-P'));
});
test('public and work-only routes reach G4 outcomes and benefits without private TAM or DCE',()=>{
  const s=complete({'A-VEH-ACCESS-01':3,'A-FUT-ROLE':2,'A-PRO-DRIVE-01':1,'A-PRO-PT-01':[4],
    'A-JRN-01':97,'B-TRIP-CONTEXT':97},{technology_override:'v2g'});
  assert(derive(s.answers,s).publicRoute);assert(ids(s).includes('A-PRO-PT-01'));
  assert(!ids(s).includes('F-X-TRUST'));assert(!ids(s).some(id=>id.startsWith('C-PCAP')));assert.equal(pathFor(data,s).filter(x=>x.kind==='choice').length,0);
  assert(ids(s).indexOf('intro-public')<ids(s).indexOf('G-PUB-SUPPORT-POST-01'));assert(ids(s).includes('G-benefits'));assert(ids(s).includes('G-PUB-VOICE-01'));
  assert(!ids(s).includes('G-REF-MIN-01'));
});
test('current-mode habit survives no alternative, but named and unspecified changes suppress forecasts',()=>{
  const no=complete({'C-ALT-01':97,'C-ALT-02':97});assert(ids(no).includes('C-HAB'));assert(ids(no).includes('C-NOALT-BAR-01'));assert(!ids(no).includes('C-PCAP'));
  const s=complete({'C-ALT-01':97,'C-ALT-02':4,'C-COND-01':[1,8]});
  assert(ids(s).includes('C-PCAP'));assert(ids(s).includes('C-BEH-01'));assert(!ids(s).includes('C-INT'));assert(!ids(s).includes('C-BEH-02'));
  const yes=complete({'C-ALT-01':97,'C-ALT-02':4,'C-COND-01':[1,3]});assert(ids(yes).includes('C-INT'));
  const q=data.questions.find(q=>q.id==='C-INT-01'),text=renderText(data,q.text,yes.answers,yes,q);assert.match(text,/suitable route.*lower cost/i);assert(!text.includes('['));
});
test('context skips preserve private F, information allocation and downstream reflection',()=>{
  for(const technology of ['wpt','v2g']){
    const gate=technology==='wpt'?'G-WPT-CONTEXT-01':'G-V2G-CONTEXT-01',s=complete({[gate]:98},{technology_override:technology,information:true});
    const r=derive(s.answers,s);assert(r.privateRoute);assert(!r.technologyDCE);assert.equal(pathFor(data,s).filter(x=>x.kind==='choice').length,5);
    assert(ids(s).includes(`E-${technology==='wpt'?'W':'V'}-USE`));assert(ids(s).includes('G-benefits'));assert(ids(s).includes('G-PUB-VOICE-01'));
    assert(ids(s).some(id=>id.startsWith(`G-${technology==='wpt'?'W':'V'}-BI-POST`)));
  }
});
test('going back clears answers and choices whose journey, technology or availability changed',()=>{
  let s=complete({}, {technology_override:'wpt'});s=updateAnswer(data,s,'B-MODE-EVAL',[3]);assert(!s.choices['T09-01']);
  s=updateAnswer(data,s,'A-JRN-02',3);assert(!s.answers['C-PCAP-01']);assert(!s.answers['C-HAB-01']);
  s=complete({},{});const old=derive(s.answers,s).technology;
  s=updateAnswer(data,s,old==='wpt'?'F-EVAL-W':'F-EVAL-V',2);assert.notEqual(derive(s.answers,s).technology,old);
  assert(!s.answers['F-X-TRUST-01']);assert(!s.answers['G-PUB-FAIR-01']);assert(!Object.keys(s.choices).some(id=>id.startsWith(old==='wpt'?'W09':'V09')));
});
test('assignment, positions, benefit order and resume are deterministic; experimental outcomes precede labels',()=>{
  const s=complete({}, {information:true,ranking:true},123),copy=cleanState(data,JSON.parse(JSON.stringify(s)));
  assert.equal(canonical(s.answers),canonical(copy.answers));assert.equal(derive(s.answers,s).technology,derive(copy.answers,copy).technology);
  assert.equal(canonical(payload(s).choices),canonical(payload(copy).choices));assert.equal(canonical(payload(s).benefit_order),canonical(payload(copy).benefit_order));
  const order=ids(s),t=derive(s.answers,s).technology==='wpt'?'W':'V';assert(order.indexOf(`G-${t}-BI-POST-01`)<order.indexOf('G-benefits'));
  const q=data.questions.find(q=>q.id==='G-BEN-RANK-01');const one=updateAnswer(data,s,q.id,[1]);assert.deepEqual(one.answers[q.id],[1]);
});
test('export distinguishes structural skips, refusal, missing judgement and no difficulty',()=>{
  const s=complete({'F-X-ACCESS-BAR':[97],'E-W-USE-01':98,'E-W-USE-02':99},{technology_override:'wpt'}),p=payload(s);
  assert.equal(p.record_kind,'instrument_test');assert.equal(p.response_status['E-V-USE-01'],'not_shown');assert.equal(p.response_status['E-W-USE-01'],'cannot_judge');assert.equal(p.response_status['E-W-USE-02'],'declined');assert.equal(p.response_status['F-X-ACCESS-BAR'],'answered');
  assert.equal(p.site,'tampere');assert(p.choices.every(c=>c.design_version||c.status==='not_shown'));assert(!Object.hasOwn(p,'notes'));
});
