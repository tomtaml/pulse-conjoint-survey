import test from 'node:test';
import assert from 'node:assert/strict';
import {data,complete,payload} from './v2-fixtures.mjs';
import {derive,pathFor,updateAnswer,settingsFromURL,canonical} from '../public/v2/engine.mjs';
import {presentationPath} from '../public/v2/layout.mjs';
import {validatePayload,MAX_BYTES} from '../worker/v2-handler.mjs';

test('both driver DCEs are opt-in and preserve the ordinary single-service path',()=>{
  assert(!Object.hasOwn(settingsFromURL(),'review_both_dce'));
  assert.equal(settingsFromURL('?dce=both-drivers').review_both_dce,true);
  const ordinary=complete({},{}),p=payload(ordinary);
  assert.equal(p.choices.filter(c=>c.status==='answered'&&!c.practice).length,10);
  assert(!Object.hasOwn(p.route,'secondaryTechnology'));
});
test('eligible drivers compare both services, with primary assignment first and one acceptance module',()=>{
  for(const technology_override of ['wpt','v2g']){
    const secondary=technology_override==='wpt'?'v2g':'wpt',state=complete({}, {technology_override,review_both_dce:true});
    const r=derive(state.answers,state),path=pathFor(data,state),p=validatePayload(data,payload(state));
    assert.equal(r.secondaryTechnology,secondary);assert.deepEqual(r.technologyChoiceBlocks,[technology_override,secondary]);
    assert.equal(p.choices.filter(c=>c.status==='answered'&&!c.practice).length,16);
    assert.equal(p.choices.filter(c=>c.status==='answered'&&c.practice).length,3);
    assert.equal(Object.keys(p.comprehension).length,6);
    assert(!Object.hasOwn(p.answers,secondary==='wpt'?'E-W-USE-01':'E-V-USE-01'));
    const technologyOrder=path.filter(s=>s.kind==='choice'&&s.task.block!=='transport').map(s=>s.task.block);
    assert(technologyOrder.slice(0,7).every(t=>t===technology_override));assert(technologyOrder.slice(7).every(t=>t===secondary));
    assert(path.findIndex(s=>s.id==='intro-review-return')<path.findIndex(s=>s.id==='G-benefits'));
    const presented=presentationPath(path,state);assert.equal(new Set(presented.map(s=>s.id)).size,presented.length);
    assert(Buffer.byteLength(JSON.stringify(p))<MAX_BYTES);
  }
});
test('non-drivers retain future-evaluable services and do not get both through the review link',()=>{
  const state=complete({'A-MOB-01':[3],'A-MOB-PRIMARY':3,'R-DRIVE-01':2,'A-VEH-ACCESS-01':3,'A-FUT-ROLE':1}, {review_both_dce:true});
  const r=derive(state.answers,state);assert(r.privateRoute);assert.equal(r.secondaryTechnology,null);
  const p=validatePayload(data,payload(state));assert.equal(p.choices.filter(c=>c.status==='answered'&&!c.practice).length,10);
  const publicState=complete({'A-MOB-01':[3],'A-MOB-PRIMARY':3,'R-DRIVE-01':2,'A-VEH-ACCESS-01':3,'A-FUT-ROLE':2}, {review_both_dce:true});
  const pub=validatePayload(data,payload(publicState));assert(pub.route.publicRoute);assert.equal(pub.choices.filter(c=>c.status==='answered'&&!c.practice).length,4);
});
test('service and context gates still apply, and changing driver status clears the second block',()=>{
  const single=complete({'F-EVAL-V':2},{technology_override:'wpt',review_both_dce:true});
  assert.equal(derive(single.answers,single).secondaryTechnology,null);
  const skip=complete({'G-V2G-CONTEXT-01':98},{technology_override:'wpt',review_both_dce:true});
  assert.equal(derive(skip.answers,skip).secondaryTechnologyDCE,false);assert.equal(payload(skip).choices.filter(c=>c.status==='answered'&&!c.practice).length,10);
  const noPrimary=complete({'G-WPT-CONTEXT-01':98},{technology_override:'wpt',review_both_dce:true});
  assert.deepEqual(derive(noPrimary.answers,noPrimary).technologyChoiceBlocks,['v2g']);
  const before=complete({'A-MOB-01':[3],'A-MOB-PRIMARY':3,'R-DRIVE-01':1},{technology_override:'wpt',review_both_dce:true});
  const after=updateAnswer(data,before,'R-DRIVE-01',2);
  assert(!Object.hasOwn(after.answers,'G-V2G-CONTEXT-01'));assert(!Object.hasOwn(after.choices,'V09-01'));assert(!Object.hasOwn(after.checks,'D-V2G-CHECK-01'));
  const expected=complete({'A-MOB-01':[3],'A-MOB-PRIMARY':3,'R-DRIVE-01':2},{technology_override:'wpt',review_both_dce:true});
  assert.equal(canonical(after.answers),canonical(expected.answers));
});
