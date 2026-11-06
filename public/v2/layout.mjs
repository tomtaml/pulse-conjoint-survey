// Presentation only: source wording, question order, codes and routing stay in engine.mjs/survey.json.
export const LEGACY_LAYOUT='pages-2026-11-04';
export const COMPACT_LAYOUT='compact-2026-11-06';
export const SUPPORTED_LAYOUTS=Object.freeze([LEGACY_LAYOUT,COMPACT_LAYOUT]);
export const layoutOf=state=>state.layout_version??LEGACY_LAYOUT;
const items=(prefix,n=3)=>Array.from({length:n},(_,i)=>`${prefix}-${String(i+1).padStart(2,'0')}`);
const page=(id,title,section,question_ids,matrix=false)=>Object.freeze({id,title,section,question_ids:Object.freeze(question_ids),matrix});
export const COMPACT_PAGES=Object.freeze([
  page('page-A-journey-mode','Your selected journey','A',['A-JRN-02','A-JRN-03']),
  page('page-A-journey-pattern','Your journey pattern','A',['A-JRN-04','A-JRN-05']),
  page('page-C-capability','Making this journey','C',[...items('C-PCAP'),...items('C-PSYC')],true),
  page('page-C-opportunity','Routes and people around you','C',[...items('C-POPP'),...items('C-SOPP')],true),
  page('page-C-convenience','Fitting travel into your day','C',['C-CONV-01','C-PLAN-EFFORT-01'],true),
  page('page-C-behaviour','Past and expected journeys','C',['C-BEH-01','C-BEH-02']),
  page('page-E-awareness','Before this survey','E',['A-AWARE-W','A-AWARE-V','A-AWARE-P'],true),
  page('page-E-evaluation','Considering the service concepts','E',['F-EVAL-W','F-EVAL-V'],true),
  page('page-F-w-use-ease','Using wireless charging','F',[...items('E-W-USE'),...items('E-W-EASE')],true),
  page('page-F-w-att-intention','Your view and household choice','F',[...items('E-W-ATT'),...items('E-W-BI')],true),
  page('page-F-v-use-ease','Using V2G','F',[...items('E-V-USE'),...items('E-V-EASE')],true),
  page('page-F-v-att-intention','Your view and household choice','F',[...items('E-V-ATT'),...items('E-V-BI')],true),
  page('page-F-v-risks','Travel and battery concerns','F',[...items('E-V-MOBR'),...items('E-V-BATR')],true),
  page('page-F-information-access','Information, data and access','F',['G-EMF-01','G-W-EMF-CONC-01','G-DATA-CONC-01','G-DATA-USE-01','G-ACCESS-01'],true),
  page('page-G-w-post','Your household choice','G',items('G-W-BI-POST'),true),
  page('page-G-v-post','Your household choice','G',items('G-V-BI-POST'),true),
  page('page-G-public-view','Your view of local introduction','G',['G-PUB-SUPPORT-POST-01','G-PUB-ATT-POST-01'],true),
  page('page-G-prosumer','Your household and the electricity system','G',items('G-V-PROS'),true),
  page('page-G-local-impacts','Local benefits and effects','G',['G-PUB-FAIR-01','G-PUB-NONUSER-01'],true),
  page('page-V-values-1','Guiding values','V',Array.from({length:4},(_,i)=>`AE1r${i+1}`),true),
  page('page-V-values-2','Guiding values','V',Array.from({length:4},(_,i)=>`AE1r${i+5}`),true),
  page('page-V-values-3','Guiding values','V',Array.from({length:5},(_,i)=>`AE1r${i+9}`),true),
  page('page-H-person','About you','H',['H-AGE-01','H-GEN-01']),
  page('page-H-place-education','Your area and education','H',['H-LOC-01','H-EDU-01']),
  page('page-H-work-household','Work and household','H',['H-OCC-01','H-HH-TYPE-01']),
  page('page-H-household-details','Your household','H',['H-HH-SIZE-01','H-CHILD-01','H-FIN-01'])
]);
const byQuestion=new Map();
for(const page of COMPACT_PAGES)for(const id of page.question_ids){
  if(byQuestion.has(id))throw new Error(`Duplicate presentation group for ${id}`);
  byQuestion.set(id,page);
}

// Only consecutive question pages can merge. Intros, scenarios, practice, choices,
// comprehension feedback and the placement of experimental outcomes remain in order.
export function presentationPath(instrumentPath,state){
  if(layoutOf(state)!==COMPACT_LAYOUT)return instrumentPath;
  const result=[];
  for(let i=0;i<instrumentPath.length;){
    const step=instrumentPath[i],page=step.kind==='questions'?byQuestion.get(step.question_ids?.[0]):null;
    if(!page||page.section!==step.section||!step.question_ids.every(id=>byQuestion.get(id)===page)){result.push(step);i++;continue;}
    const question_ids=[];
    let j=i;
    while(j<instrumentPath.length){
      const next=instrumentPath[j];
      if(next.kind!=='questions'||next.section!==page.section||!next.question_ids?.every(id=>byQuestion.get(id)===page))break;
      question_ids.push(...next.question_ids);j++;
    }
    result.push({...page,kind:'questions',question_ids});i=j;
  }
  return result;
}
export const isFinalPage=step=>['intro-declined','intro-not-adult'].includes(step?.id)||step?.question_ids?.includes('H-FIN-01')===true;
