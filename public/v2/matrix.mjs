const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// A shared header is safe only for an identical sequence of option codes AND labels.
export function responseRuns(questions,optionsForQuestion,allowSingle=false){
  const runs=[];
  for(const question of questions){
    const matrix=question.type==='rating'||allowSingle&&question.type==='single';
    const options=optionsForQuestion(question),signature=matrix?JSON.stringify(options.map(o=>[o.code,o.label])):null;
    const previous=runs.at(-1);
    if(matrix&&previous?.signature===signature&&previous.questions.length<6)previous.questions.push(question);
    else runs.push({matrix,signature,options,questions:[question]});
  }
  return runs;
}
export function renderMatrix({id,title,questions,options,answers,promptFor,groupFor=()=>'',invalidIds=[]}){
  const regular=options.filter(o=>o.code<90),special=options.filter(o=>o.code>=90);
  const groups=[...new Set(questions.map(groupFor).filter(Boolean))],showGroups=groups.length>1;
  const headerId=code=>`${id}-option-${code}`;
  const renderRow=q=>{
    const prompt=promptFor(q),group=groupFor(q),invalid=invalidIds.includes(q.id);
    const error=invalid?'<span class="matrix-row-error">Please select one response.</span>':'';
    const help=q.help?`<span class="matrix-help" id="help-${esc(q.id)}">${esc(q.help)}</span>`:'';
    return `<tr class="matrix-statement${invalid?' invalid':''}"><th id="field-${esc(q.id)}" scope="row">${esc(prompt)}${help}${error}</th>${options.map(o=>{
      const checked=answers[q.id]===o.code,isSpecial=o.code>=90;
      const mobile=q.type==='rating'&&!isSpecial?String(o.code):o.label;
      return `<td class="${isSpecial?'matrix-special':'matrix-regular'}${checked?' is-checked':''}"><label class="matrix-choice"><input id="q-${esc(q.id)}-${o.code}" type="radio" name="${esc(q.id)}" data-question="${esc(q.id)}" value="${o.code}" aria-labelledby="field-${esc(q.id)} ${esc(headerId(o.code))}"${q.help?` aria-describedby="help-${esc(q.id)}"`:''}${invalid?' aria-invalid="true"':''}${checked?' checked':''}><span class="matrix-mobile-label" aria-hidden="true">${esc(mobile)}</span></label></td>`;
    }).join('')}</tr>`;
  };
  const rowGroups=[];
  for(const question of questions){const name=showGroups?groupFor(question):'';if(rowGroups.at(-1)?.name===name)rowGroups.at(-1).questions.push(question);else rowGroups.push({name,questions:[question]});}
  const rows=rowGroups.map(group=>`<tbody>${group.name?`<tr class="matrix-section"><th colspan="${options.length+1}" scope="rowgroup">${esc(group.name)}</th></tr>`:''}${group.questions.map(renderRow).join('')}</tbody>`).join('');
  const key=questions.every(q=>q.type==='rating')?`<div class="matrix-scale-key" aria-hidden="true">${regular.map(o=>`<span><b>${o.code}</b> ${esc(o.label)}</span>`).join('')}</div>`:'';
  return `<section class="matrix-block matrix-scale-${regular.length} matrix-specials-${special.length} ${questions.every(q=>q.type==='rating')?'matrix-numeric':'matrix-text'}" aria-label="${esc(title)}">${key}<table class="likert-matrix"><caption>Select one response in each row.</caption><thead><tr><th scope="col">Question or statement</th>${options.map(o=>`<th id="${esc(headerId(o.code))}" scope="col"${o.code>=90?' class="matrix-special-heading"':''}>${esc(o.label)}</th>`).join('')}</tr></thead>${rows}</table></section>`;
}
