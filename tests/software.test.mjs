import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,shuffle,answerError,cleanState,ReviewClock} from '../public/engine.mjs';

test('a new test session has no answers, choices or comments',()=>{
  const s=freshState(12345);
  assert.equal(s.seed,12345);assert.equal(s.started,false);assert.equal(s.finished,false);
  assert.deepEqual(s.answers,{});assert.deepEqual(s.choices,{});assert.deepEqual(s.notes,{});
});

test('seeded display ordering is reproducible and never loses or duplicates options',()=>{
  const input=['example-a','example-b','example-c','example-d','example-e'];
  const first=shuffle(input,'example-seed');
  assert.deepEqual(shuffle(input,'example-seed'),first);
  assert.deepEqual([...first].sort(),[...input].sort());
  assert.deepEqual(input,['example-a','example-b','example-c','example-d','example-e']);
});

test('single-choice validation accepts zero and rejects values absent from the configuration',()=>{
  const q={id:'DEMO',type:'single',options:[{code:0,label:'Example zero'},{code:7,label:'Example seven'}]};
  assert.equal(answerError(q,{DEMO:0}),null);assert.equal(answerError(q,{DEMO:7}),null);
  assert(answerError(q,{DEMO:8}));assert(answerError(q,{}));
});

test('multi-choice validation rejects duplicate and incompatible exclusive responses',()=>{
  const q={id:'DEMO',type:'multi',options:[{code:10,label:'Example A'},{code:20,label:'Example B'},{code:90,label:'Example exclusive',exclusive:true}]};
  assert.equal(answerError(q,{DEMO:[10,20]}),null);assert.equal(answerError(q,{DEMO:[90]}),null);
  assert(answerError(q,{DEMO:[10,10]}));assert(answerError(q,{DEMO:[10,90]}));assert(answerError(q,{DEMO:[]}));
});

test('cleanup removes invalid values without mutating the previous session',()=>{
  const data={questions:[{id:'DEMO',route:'always',type:'single',options:[{code:10,label:'Example'}]}],tasks:[]};
  const s=freshState(42);s.answers.DEMO=999;
  const cleaned=cleanState(data,s);assert.equal(cleaned.answers.DEMO,undefined);assert.equal(s.answers.DEMO,999);
});

test('visible active time excludes comment entry, hidden pages and deliberate pauses',()=>{
  const c=new ReviewClock({},0);c.start(0);c.enter('example-page-one','A',0);
  c.commenting(true,1000);assert.equal(c.snapshot(6000).active_ms,1000);
  c.commenting(false,6000);c.visibility(true,7000);c.enter('example-page-two','B',10000);
  c.visibility(false,11000);c.pause(true,12500);
  const s=c.snapshot(20000);assert.equal(s.active_ms,3500);assert.equal(s.by_section_ms.A,2000);assert.equal(s.by_section_ms.B,1500);
});

test('closing comments preserves an explicit pause and revisits are recorded once',()=>{
  const c=new ReviewClock({},0);c.start(0);c.enter('example-page-one','A',0);c.pause(true,1000);
  c.commenting(true,2000);c.commenting(false,3000);assert(c.manualPaused);
  c.pause(false,4000);c.enter('example-page-two','B',5000);c.enter('example-page-one','A',6000);c.finish(7000);
  const s=c.snapshot(80000);assert.equal(s.active_ms,4000);assert.equal(s.visits['example-page-one'],2);
  assert.equal(s.visits['example-page-two'],1);
});

test('a finished clock stays fixed after restoration',()=>{
  const c=new ReviewClock({},0);c.start(0);c.enter('example-page','A',0);c.finish(2345);
  const saved=c.snapshot(3000),restored=new ReviewClock(saved,100000);
  assert.equal(restored.snapshot(900000).active_ms,2345);
});
