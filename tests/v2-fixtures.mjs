import fs from 'node:fs';
import {freshState,derive,pathFor,stepErrors,updateAnswer,optionsFor,taskSnapshot,exportSession} from '../public/v2/engine.mjs';
export const data=JSON.parse(fs.readFileSync(new URL('../public/v2/survey.json',import.meta.url),'utf8'));
export const bev={
  'TEST-CONSENT-01':1,'TEST-ADULT-01':1,'TEST-SITE-01':1,
  'A-MOB-01':[4],'A-MOB-PRIMARY':4,'A-VEH-01':4,'A-PRO-DRIVE-01':3,'A-VEH-ACCESS-01':1,'A-HH-PT-01':[1],
  'A-FUT-ROLE':1,'A-JRN-01':1,'A-JRN-02':4,'B-TRIP-CONTEXT':1,'B-MODE-EVAL':[1,3],
  'C-ALT-01':4,'A-CHG-ROLE':1,'A-CHG-LOC':[1,4],'A-CHG-MAIN':1,
  'F-EVAL-W':1,'F-EVAL-V':1,'G-WPT-CONTEXT-01':1,'G-V2G-CONTEXT-01':1
};
export function complete(overrides={},settings={},seed=42){
  let state=freshState(seed,settings);const planned={...bev,...overrides};
  for(let loop=0;loop<1000;loop++){
    const path=pathFor(data,state),step=path.find(step=>stepErrors(data,step,state).length);
    if(!step){state.started=true;state.finished=true;return state;}
    if(step.kind==='choice'){state.choices[step.id]=taskSnapshot(step.task,state.answers,state,data).display_order[0];state.choiceSnapshots[step.id]=taskSnapshot(step.task,state.answers,state,data);continue;}
    for(const id of step.question_ids){
      if(!stepErrors(data,{...step,question_ids:[id]},state).length)continue;
      const q=data.questions.find(q=>q.id===id),available=optionsFor(q,state.answers,state,data);
      let value=Object.hasOwn(planned,id)?structuredClone(planned[id]):q.type==='check'?q.correct:(q.type==='multi'||q.type==='rank')?[available[0].code]:available[0].code;
      state=updateAnswer(data,state,id,value);
      if(q.type==='check')state.checks[id]={first:value,last:value,attempts:1,correct_first:value===q.correct,correct_final:value===q.correct};
    }
  }
  throw new Error('Fixture route did not converge');
}
export function payload(state){return exportSession(data,state,{active_ms:1250,by_step_ms:{'intro-S':1250},visits:{'intro-S':1}});}
export const ids=s=>pathFor(data,s).map(x=>x.id);
