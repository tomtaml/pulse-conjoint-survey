import {derive,routeMatches,optionsFor,rowsFor,pathFor,stepErrors,freshState,cleanState,updateAnswer,taskSnapshot,contextLabels,renderPrompt,exportSession,validateSurvey,ReviewClock} from './engine.mjs';

const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='pulse-version-a-walkthrough-v1';
const SECTION_NAMES={A:'Everyday travel',B:'A future trip',C:'Your regular journey',D:'Charging context'};
const now=()=>performance.now();
let data,state,clock,errors=[],commentOpen=false,showTimer=false,resumePending=false,storageWarned=false;
let toastTimer;
const duration=ms=>{const sec=Math.round(ms/1000);return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;};
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},4500);}
function save(){if(!state||!clock)return;state.clock=clock.snapshot(now());try{sessionStorage.setItem(KEY,JSON.stringify({version:data.meta.version,source:data.meta.source_sha256,state}));}catch{if(!storageWarned){storageWarned=true;toast('Tab storage is unavailable. Keep this page open and download your review before leaving.');}}}
function currentStep(){return pathFor(data,state).find(s=>s.id===state.currentId);}
function enter(id){const step=pathFor(data,state).find(s=>s.id===id);if(!step)return;if(commentOpen)setComment(false);state.currentId=id;clock.enter(id,step.section,now());errors=[];save();render();window.scrollTo({top:0,behavior:'instant'});$('#main').focus({preventScroll:true});}
function setComment(open){commentOpen=open;clock.commenting(open,now());renderComment();updateStatus();save();if(open)$('#comment-text').focus();}
function noteLabel(id){const step=pathFor(data,state).find(s=>s.id===id);return step?.title||step?.content?.title||data.questions.find(q=>q.id===id)?.text||id;}
function renderComment(){
  const panel=$('#comment-panel');panel.hidden=!commentOpen;document.body.classList.toggle('comment-open',commentOpen);if(!commentOpen)return;
  const label=state.currentId==='summary'?'End of walkthrough':noteLabel(state.currentId);
  panel.innerHTML=`<h2>Comment on this screen</h2><p class="small">${esc(label)}<br><code>${esc(state.currentId)}</code> · timing pauses while this box is open.</p><label class="sr-only" for="comment-text">Your comment</label><textarea id="comment-text" placeholder="Anything unclear, missing or difficult to answer?">${esc(state.notes[state.currentId]||'')}</textarea><div class="comment-actions"><span class="comment-saved">Saved in this tab</span><button id="close-comment" class="primary">Done</button></div>`;
}
function renderWelcome(){
  const resumed=resumePending;
  return `<section class="welcome"><p class="eyebrow">PULSE WP1 · Version A</p><h1>Everyday mobility and future transport</h1><p class="lede">Walk through the background questions, a hypothetical transport choice experiment, and questions about your ordinary travel and charging arrangements.</p><div class="flow-list">${Object.entries(SECTION_NAMES).map(([id,label],i)=>`<div><span>${i+1}</span>${label}</div>`).join('')}</div><p class="small welcome-note">This is a working draft for testing the flow and wording. You may use fictional answers. Your test answers and comments stay in this browser tab; they are not sent to the survey database.</p><p class="small welcome-note">Timing starts when you begin, and pauses when the tab is hidden, you press Pause, or you open a comment. At the end you can download the timing breakdown and comments to send back.</p><div class="welcome-actions"><button id="${resumed?'resume':'start'}" class="primary">${resumed?'Resume saved walkthrough →':'Start walkthrough →'}</button>${resumed?'<button id="restart">Start again</button>':''}</div><p class="small welcome-note">${resumed?`Your previous active time: <strong>${duration(state.clock?.active_ms||0)}</strong>.`:'This first-stage version covers Parts A–D of the 2 November draft. Screening/consent and the later technology, values and demographic sections are outside this walkthrough.'}</p></section>`;
}
function renderProgress(step){
  const section=state.finished?'D':step?.section||'A',index=Object.keys(SECTION_NAMES).indexOf(section);
  if(!state.started||resumePending)return '';
  return `<div class="progress-wrap"><div class="chapters" aria-label="Survey parts">${Object.entries(SECTION_NAMES).map(([id,label],i)=>`<div class="chapter ${i<index||state.finished?'done':i===index?'current':''}" ${i===index&&!state.finished?'aria-current="step"':''}><span>${i+1}. ${label}</span></div>`).join('')}</div></div><div class="status-row"><span>${state.finished?'Walkthrough complete':`Part ${index+1} of 4`}</span><div class="timer-controls"><span id="timer" class="timer-value" ${showTimer||state.finished?'':'hidden'}></span>${!state.finished?`<button class="quiet" id="toggle-timer">${showTimer?'Hide time':'Show time'}</button><button class="quiet" id="pause">${clock.manualPaused?'Resume':'Pause'}</button>`:''}</div></div>`;
}
function updateStatus(){const timer=$('#timer');if(timer){timer.textContent=`${clock.manualPaused||commentOpen?'Paused · ':''}${duration(clock.snapshot(now()).active_ms)}`;timer.classList.toggle('paused-label',clock.manualPaused||commentOpen);}}
function context(step){
  if(step.section!=='C'||!derive(state.answers).journey)return '';
  const c=contextLabels(data,state.answers),habit=step.id==='C-HAB';
  return `<div class="context"><p>Your ordinary journey: <strong>${esc(c.journey)}</strong></p><p>Usual mode: <strong>${esc(c.current||'not specified')}</strong></p>${!habit&&c.alternative?`<p>Option being considered: <strong>${esc(c.alternative)}</strong>${c.conditional?' · selected as plausible if conditions improved':''}</p>`:''}</div>`;
}
function questionCard(q){
  const a=state.answers,v=a[q.id],opts=optionsFor(q,a),prompt=renderPrompt(data,q,a);state.renderedPrompts[q.id]=prompt;
  const radio=o=>`<label class="option"><input id="q-${esc(q.id)}-${o.code}" type="${q.type==='multi'?'checkbox':'radio'}" name="${esc(q.id)}" data-question="${esc(q.id)}" value="${o.code}" ${Array.isArray(v)?v.includes(o.code)?'checked':'':v===o.code?'checked':''}><span>${esc(o.label)}</span></label>`;
  let body;
  if(q.type==='matrix')body=rowsFor(q,a).map(row=>`<div class="matrix-row"><label for="q-${esc(q.id)}-${esc(row.id)}">${esc(row.label)}</label><p class="small">${esc(row.description)}</p><select id="q-${esc(q.id)}-${esc(row.id)}" data-question="${esc(q.id)}" data-row="${esc(row.id)}"><option value="">Choose an answer</option>${opts.map(o=>`<option value="${o.code}" ${v?.[row.id]===o.code?'selected':''}>${esc(o.label)}</option>`).join('')}</select></div>`).join('');
  else if(q.type==='rating')body=`<div class="scale">${opts.filter(o=>o.code<90).map(o=>`<label class="scale-choice"><input id="q-${esc(q.id)}-${o.code}" type="radio" name="${esc(q.id)}" data-question="${esc(q.id)}" value="${o.code}" ${v===o.code?'checked':''}><strong>${o.code}</strong><span>${esc(o.label)}</span></label>`).join('')}</div><div class="non-scale">${opts.filter(o=>o.code>=90).map(radio).join('')}</div>`;
  else if(q.type==='count')body=`<div class="counts">${opts.filter(o=>o.code<90).map(o=>`<label class="count-option"><input id="q-${esc(q.id)}-${o.code}" type="radio" name="${esc(q.id)}" data-question="${esc(q.id)}" value="${o.code}" ${v===o.code?'checked':''}><span>${o.code}</span></label>`).join('')}</div><div class="non-scale">${opts.filter(o=>o.code>=90).map(radio).join('')}</div>`;
  else body=`<div class="options">${opts.map(radio).join('')}</div>`;
  return `<article class="question ${errors.some(e=>e.id===q.id)?'invalid':''}" id="field-${esc(q.id)}"><fieldset><legend>${esc(prompt)}</legend>${body}</fieldset></article>`;
}
function renderChoice(step){
  const task=step.task,snapshot=taskSnapshot(task,state.answers,state.seed,data.meta.design_version),selected=state.choices[task.id];
  const ord=pathFor(data,state).filter(s=>s.kind==='choice'&&!s.task.practice).findIndex(s=>s.id===task.id)+1;
  const rows=[['cost','Total household trip cost',v=>`€${v}`],['time','Total door-to-door time',v=>`${v} <span>min</span>`],['reliability','Arrivals within 5 minutes of planned time',v=>`${v} <span>out of 100 trips</span>`],['walk','Walking or wheeling, included in total time',v=>`${v} <span>min</span>`]];
  return `<p class="eyebrow">${task.practice?'Practice choice':`Choice ${ord} of 4`}</p><div class="choice-head"><h1>Which would you choose?</h1>${task.practice?'<span class="practice-tag">Unscored practice</span>':''}</div><div class="choice-context"><span>20 km one way in 2030</span><span>One adult · the same trip for every offer</span></div><div class="offer-grid">${snapshot.alternatives.filter(p=>p.canonical_id!==4).map(p=>`<section class="offer ${selected===p.canonical_id?'selected':''}"><label class="offer-head"><input id="choice-${task.id}-${p.canonical_id}" type="radio" name="${task.id}" data-choice="${task.id}" value="${p.canonical_id}" ${selected===p.canonical_id?'checked':''}><span>${esc(p.label)}</span></label><dl>${rows.map(([key,label,format])=>`<div><dt>${esc(label)}</dt><dd>${format(p.attributes[key])}</dd></div>`).join('')}</dl></section>`).join('')}</div><label class="option outside"><input id="choice-${task.id}-4" type="radio" name="${task.id}" data-choice="${task.id}" value="4" ${selected===4?'checked':''}><span>None of these — I would use another available way of travelling.</span></label>${task.practice?'<div class="practice-feedback">This is a practice choice. There is no right or wrong preference. Your answer is not included in the choice analysis.</div>':''}<details class="scenario-repeat"><summary>Read the trip description again</summary><p>${esc(data.instructions.scenario.body)}</p></details>`;
}
function renderSummary(){
  const timing=clock.snapshot(now()),notes=Object.entries(state.notes).filter(([,note])=>note.trim()),r=derive(state.answers);
  return `<section class="summary-title"><p class="eyebrow">End of Version A walkthrough</p><h1>Thank you for trying the survey.</h1><p class="lede">You have reached the end of the current background, transport, ordinary-journey and charging sections.</p></section><div class="timing-total"><span>Total active respondent time</span><strong>${duration(timing.active_ms)}</strong></div><p class="small">Excludes hidden-tab time, pauses and comment editing. Includes any backtracking and revisits. This is your test timing, not a validated completion estimate.</p><table class="timing-table"><thead><tr><th>Section</th><th>Active time</th></tr></thead><tbody>${Object.entries(SECTION_NAMES).map(([id,label])=>`<tr><td>${label}</td><td>${duration(timing.by_section_ms[id]||0)}</td></tr>`).join('')}</tbody></table><p class="small">Transport choices: ${r.transport?'one practice and four scored tasks were on this route.':'not shown because this route did not confirm at least two feasible offers.'} ${r.combStatus==='journey_unresolved'?'Journey-dependent COM-B questions were skipped.':r.alternativeMode?'COM-B used your selected ordinary journey and transport option.':'Alternative-mode ratings were skipped where no option was confirmed.'}</p><div class="export-actions"><button id="download-review" class="primary">Download comments and timing ↓</button><button id="download-session">Download test-session JSON</button></div><p class="small">Attach the downloaded review in this conversation to comment back. Nothing is submitted automatically.</p><div class="note-list"><h2>${notes.length} saved ${notes.length===1?'comment':'comments'}</h2>${notes.length?notes.map(([id,note])=>`<div class="note-item"><strong>${esc(id)} · ${esc(noteLabel(id))}</strong><p>${esc(note)}</p></div>`).join(''):'<p class="small">Use Comment on this screen to add an overall comment, or review your answers to leave screen-specific notes.</p>'}</div><div class="paging"><button id="review-answers">Review answers</button><button id="restart" class="quiet">Start a new walkthrough</button></div>`;
}
function render(focusId=null){
  const scroll=window.scrollY;
  let step=currentStep();
  if(state.started&&!state.finished&&!resumePending&&!step){const first=pathFor(data,state)[0];state.currentId=first.id;clock.enter(first.id,first.section,now());step=first;}
  $('#comment-button').hidden=!state.started||resumePending;
  $('#progress-area').innerHTML=renderProgress(step);
  $('#main').classList.toggle('wide',step?.kind==='choice'&&!state.finished&&!resumePending);
  if(!state.started||resumePending)$('#main').innerHTML=renderWelcome();
  else if(state.finished)$('#main').innerHTML=renderSummary();
  else {
    const path=pathFor(data,state),index=path.findIndex(s=>s.id===step.id);
    let content=errors.length?`<div class="error" role="alert">${errors.map(e=>`<p>${esc(e.message)}</p>`).join('')}</div>`:'';
    if(clock.manualPaused)content+='<p class="paused-notice">Timing is paused. Use Resume in the top bar when you are ready to continue the timing test.</p>';
    if(step.kind==='info')content+=`<section class="info-sheet"><p class="eyebrow">${esc(SECTION_NAMES[step.section])}</p><h1>${esc(step.content.title)}</h1><p class="body-text">${esc(step.content.body)}</p></section>`;
    else if(step.kind==='choice')content+=renderChoice(step);
    else content+=`${step.title?`<div class="group-head"><p class="eyebrow">Your ordinary journey</p><h1>${esc(step.title)}</h1><p class="small">How much do you agree or disagree with each statement?</p></div>`:`<p class="eyebrow">${esc(SECTION_NAMES[step.section])}</p>`}${context(step)}<div class="${step.question_ids.length>1?'group':''}">${step.question_ids.map(id=>questionCard(data.questions.find(q=>q.id===id))).join('')}</div>`;
    content+=`<nav class="paging" aria-label="Survey pages"><button id="back" class="back" ${index===0?'disabled':''}>← Back</button><button class="quiet comment-link" id="comment-inline">Add a comment</button><button id="next" class="primary next">${index===path.length-1?'Finish walkthrough':'Continue →'}</button></nav>`;
    $('#main').innerHTML=content;
  }
  if(commentOpen)renderComment();
  updateStatus();
  if(focusId){document.getElementById(focusId)?.focus({preventScroll:true});window.scrollTo(0,scroll);}
}
function download(filename,body,type){const blob=new Blob([body],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadReview(){
  const session=exportSession(data,state,clock.snapshot(now())),t=session.timing;
  const lines=['PULSE Version A walkthrough review',`Version: ${data.meta.version}`,`Completion: ${state.finished?'finished':'in progress'}`,`Active respondent time: ${duration(t.active_ms)}`,'Timing excludes hidden tab, pauses and comment editing; includes revisits.','',...Object.entries(SECTION_NAMES).map(([id,label])=>`${label}: ${duration(t.by_section_ms[id]||0)}`),'','COMMENTS'];
  for(const [id,note]of Object.entries(state.notes).filter(([,v])=>v.trim()))lines.push('',`${id} — ${noteLabel(id)}`,note);
  if(!Object.values(state.notes).some(v=>v.trim()))lines.push('No screen-specific comments saved.');
  lines.push('','SCREEN TIMINGS');for(const [id,ms]of Object.entries(t.by_step_ms))lines.push(`${id}: ${duration(ms)}; visits ${t.visits[id]||1}`);
  download('pulse-version-a-comments-and-timing.txt',lines.join('\n'),'text/plain;charset=utf-8');
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||!data)return;
  if(button.id==='start'){state.started=true;clock.start(now());enter(pathFor(data,state)[0].id);return;}
  if(button.id==='resume'){resumePending=false;clock.pause(false,now());render();save();return;}
  if(button.id==='restart'){
    if(!window.confirm('Start again? This clears this tab’s answers, timing and comments. Download your review first if you want to keep it.'))return;
    state=freshState();clock=new ReviewClock({},now());commentOpen=false;resumePending=false;errors=[];$('#comment-panel').hidden=true;save();render();window.scrollTo(0,0);return;
  }
  if(['comment-button','comment-inline'].includes(button.id)){setComment(!commentOpen);return;}
  if(button.id==='close-comment'){setComment(false);return;}
  if(button.id==='toggle-timer'){showTimer=!showTimer;render();return;}
  if(button.id==='pause'){clock.pause(!clock.manualPaused,now());save();render();return;}
  if(button.id==='download-review'){downloadReview();return;}
  if(button.id==='download-session'){download('pulse-version-a-test-session.json',JSON.stringify(exportSession(data,state,clock.snapshot(now())),null,2),'application/json');return;}
  if(button.id==='review-answers'){state.finished=false;clock.finished=false;clock.pause(true,now());enter(pathFor(data,state)[0].id);return;}
  if(button.id==='next'||button.id==='back'){
    const path=pathFor(data,state),index=path.findIndex(s=>s.id===state.currentId),step=path[index];
    if(button.id==='back'){if(index>0)enter(path[index-1].id);return;}
    errors=stepErrors(data,step,state);if(errors.length){render();document.querySelector('.error')?.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(index===path.length-1){if(commentOpen)setComment(false);clock.finish(now());state.finished=true;state.currentId='summary';save();render();window.scrollTo(0,0);return;}
    enter(path[index+1].id);
  }
});
document.addEventListener('change',event=>{
  const el=event.target;if(!data)return;
  if(el.dataset.question){
    const q=data.questions.find(q=>q.id===el.dataset.question);let value;
    if(q.type==='matrix'){value={...(state.answers[q.id]||{})};if(el.value==='')delete value[el.dataset.row];else value[el.dataset.row]=Number(el.value);}
    else if(q.type==='multi'){
      const code=Number(el.value),opts=optionsFor(q,state.answers),exclusive=opts.find(o=>o.code===code)?.exclusive,old=Array.isArray(state.answers[q.id])?state.answers[q.id]:[];
      value=el.checked?exclusive?[code]:[...old.filter(v=>!opts.find(o=>o.code===v)?.exclusive),code]:old.filter(v=>v!==code);
    }else value=Number(el.value);
    state=updateAnswer(data,state,q.id,value);errors=[];save();render(el.id);
  }
  if(el.dataset.choice){const task=data.tasks.find(t=>t.id===el.dataset.choice);state.choices[task.id]=Number(el.value);state.choiceSnapshots[task.id]=taskSnapshot(task,state.answers,state.seed,data.meta.design_version);errors=[];save();render(el.id);}
});
document.addEventListener('input',event=>{if(event.target.id==='comment-text'){state.notes[state.currentId]=event.target.value;save();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&commentOpen)setComment(false);});
document.addEventListener('visibilitychange',()=>{if(clock){clock.visibility(document.hidden,now());save();}});
window.addEventListener('pagehide',()=>save());

try{
  const response=await fetch('./survey.json');if(!response.ok)throw new Error('The survey content could not be loaded.');data=await response.json();const invalid=validateSurvey(data);if(invalid.length)throw new Error(invalid.join(' '));
  state=freshState();
  try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved?.version===data.meta.version&&saved?.source===data.meta.source_sha256){state=cleanState(data,saved.state);resumePending=state.started&&!state.finished;}}catch{}
  clock=new ReviewClock(state.clock||{},now());if(resumePending)clock.pause(true,now());clock.visibility(document.hidden,now());render();
  setInterval(()=>{if(!document.hidden&&state.started&&!state.finished)updateStatus();},1000);
}catch(error){$('#main').innerHTML=`<div class="error" role="alert">${esc(error.message)}</div>`;}
