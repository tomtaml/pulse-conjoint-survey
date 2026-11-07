import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {canonical} from '../public/v2/engine.mjs';
import {LAYOUT, PROFILES, VERSION, optionCInstrument} from '../v3/instrument.mjs';

const source = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, source), 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex');

// Generate a self-contained v3 from the checked-in v2 runtime. Fail if an
// upstream edit moves a hook instead of producing an unreviewed v3 build.
function replaceOne(text, from, to) {
  if (text.indexOf(from) < 0 || text.indexOf(from) !== text.lastIndexOf(from)) {
    throw new Error(`V3 build hook changed in v2: ${from.slice(0, 100)}`);
  }
  return text.replace(from, () => to);
}

function buildEngine() {
  let engine = read('public/v2/engine.mjs');
  const replace = (from, to) => { engine = replaceOne(engine, from, to); };
  replace("import {shuffle, ReviewClock} from '../v1/engine.mjs';",
    "import {shuffle, ReviewClock} from './review-clock.mjs';\nimport {optionCFlags, optionCRouteMatches, routeDiagnostics} from './routing.mjs';");
  replace("export const VERSION='pulse-v2-A0.9-test-2026-11-04';", `export const VERSION=${JSON.stringify(VERSION)};`);
  replace("C:'Your regular journey'", "C:'Everyday travel options'");
  replace("on=new Set((params.get('modules')||'').split(','))", 'on=new Set()');
  replace('return {values:', "return {option_c_extended:params.get('profile')==='extended',values:");
  replace('return {version:2,layout_version:', 'return {version:3,layout_version:');
  replace("  const reviewBoth=state.settings?.review_both_dce===true;",
    '  const optionC=optionCFlags(a,driving,informed);\n  const reviewBoth=state.settings?.review_both_dce===true;');
  replace('reviewBoth&&privateRoute&&driving===1&&eligibleW&&eligibleV', 'reviewBoth&&privateRoute&&optionC.personalDriving&&eligibleW&&eligibleV');
  replace('    driving,\n', '    driving,optionC,\n');
  replace('    default:return false;\n  }\n}', '    default:return optionCRouteMatches(route,r);\n  }\n}');
  replace('return routeMatches(item.route,a,state);});if(ids.length)',
    'return (!item.optional_module||state.settings?.[item.optional_module])&&routeMatches(item.route,a,state);});if(ids.length)');
  replace("q(id);\n  info('B','B');", "q(id);\n  q('A3-DRV-PT-01');\n  info('B','B');");

  const start = engine.indexOf("  if(r.journey){info('C','C'");
  const end = engine.indexOf("  info('D','D');");
  if (start < 0 || end <= start) throw new Error('V3 mobility build hooks changed in v2.');
  engine = engine.slice(0, start) + `  info('option-c-mobility','C');
  for(const id of ['M3-PSYC','M3-OPP','M3-SOC','M3-MOT','M3-ACCESS'])group(id);
  q('M3-BAR-01');
  if(r.journey){
    info('option-c-target','C');group('C-HAB');
    for(const id of ['C-ALT-01','C-ALT-USED','C-ALT-02','C-COND-01','C-BEH-01','C-CTX-01'])q(id);
    group('C-INT');q('C-BEH-02');
  }
` + engine.slice(end);
  replace("  for(const id of ['A-AWARE-W','A-AWARE-V','A-AWARE-P'])q(id);", `  q('D3-CHG-HANDS-01');group('D3-EXPERIENCE');group('D3-ICE');
  for(const id of ['A-AWARE-W','A-AWARE-V','A-AWARE-P'])q(id);`);
  replace("    group('F-positioning');", "    q('F3-V2G-CONN-01');q('F3-WPT-STOP-01');\n    group('F-positioning');");
  replace("  if(id==='A-CHG-LOC')delete a['A-CHG-MAIN'];", `  if(id==='A-CHG-LOC')delete a['A-CHG-MAIN'];
  if(['A-HH-PT-01','A-VEH-ACCESS-01','A-CHG-ROLE'].includes(id)&&stable(state.answers[id])!==stable(value))
    clear(a,['D3-CHG-','D3-EXPERIENCE-','F3-V2G-CONN-']);
  if(id==='A3-DRV-PT-01'&&stable(state.answers[id])!==stable(value))clear(a,['D3-ICE-']);`);
  replace("route:{...r,journey_selection:'respondent_chosen'}", "route:{...r,journey_selection:'respondent_chosen',diagnostics:routeDiagnostics(state.answers,r)}");
  return engine;
}

function buildLayout() {
  let layout = replaceOne(read('public/v2/layout.mjs'), "'compact-2026-11-06'", JSON.stringify(LAYOUT));
  layout = replaceOne(layout, 'Object.freeze([LEGACY_LAYOUT,COMPACT_LAYOUT])', 'Object.freeze([COMPACT_LAYOUT])');
  return replaceOne(layout, 'export const COMPACT_PAGES=Object.freeze([', `export const COMPACT_PAGES=Object.freeze([
  page('page-C3-planning','Planning and transport options','C',[...items('M3-PSYC',2),...items('M3-OPP',2)],true),
  page('page-C3-priorities','People, decisions and priorities','C',[...items('M3-SOC'),...items('M3-MOT')],true),`);
}

function buildApp() {
  let app = read('public/v2/app.mjs').replaceAll('/api/v2/', '/api/v3/').replaceAll('pulse-v2-', 'pulse-v3-')
    .replaceAll('pulse_v2_test', 'pulse_v3_test').replaceAll('PULSE v2', 'PULSE v3').replaceAll('End of v2 test', 'End of v3 test');
  const replace = (from, to) => { app = replaceOne(app, from, to); };
  replace('pulse-v3-A09-test-session', 'pulse-v3-option-c-test-session');
  replace(".map(([k])=>k==='review_both_dce'?'driver comparison of both technologies':k)",
    ".map(([k])=>k==='review_both_dce'?'driver comparison of both technologies':'expanded Option C questions')");
  replace('PULSE WP1 · v2 test version', 'PULSE WP1 · v3 Option C review');
  replace('Your real journey and charging circumstances', 'Everyday travel options and relevant charging experience');
  replace('One service, its offers and your priorities', 'A charging service or a public perspective');
  replace('You may use your circumstances or fictional answers.', 'Please use a fictional test profile.');
  replace('This is a questionnaire test, not the main study.', 'This is a questionnaire test. The main study is separate.');
  replace('<a href="?modules=values,information">Test values and information modules</a><a href="?dce=both-drivers">Drivers: compare both technology DCEs</a><a href="./routing.html">Survey routing guide</a><a href="../v1/">Earlier v1</a>',
    '<a href="./">Core questionnaire</a><a href="?profile=extended">Expanded Option C review</a><a href="?profile=extended&dce=both-drivers">Drivers: compare both technology DCEs</a>');
  replace("if(step.section!=='C'||!derive(state.answers,state).journey)return '';",
    "if(step.section!=='C'||!step.question_ids?.some(id=>id.startsWith('C-'))||!derive(state.answers,state).journey)return '';");
  replace('summary()+reviewComparisonNote()', 'summary()+reviewComparisonNote()+routeReview()');
  replace('function formatAttribute(', `function routeReview(){
  if(!state.settings.option_c_extended||state.answers['TEST-CONSENT-01']!==1||state.answers['TEST-ADULT-01']!==1)return '';
  const {route}=exportSession(data,state);
  const labels={transport:'Transport offers',wpt:'Wireless charging offers',v2g:'V2G offers',mobilityIntention:'Journey intention',chargingExperience:'Charging experience'};
  const status=code=>code.replaceAll('_',' ');
  return '<details class="test-options"><summary>Review routing decisions</summary><dl class="route-review">'+
    Object.entries(route.diagnostics).map(([key,code])=>'<div><dt>'+esc(labels[key])+'</dt><dd>'+esc(status(code))+'</dd></div>').join('')+'</dl></details>';
}
function formatAttribute(`);
  return app;
}

function buildHandler() {
  let handler = read('worker/v2-handler.mjs').replaceAll('/api/v2/', '/api/v3/').replaceAll('SURVEY_V2_', 'SURVEY_V3_')
    .replaceAll('../public/v2/', '../public/v3/').replaceAll('survey_v2_test_submissions', 'survey_v3_test_submissions')
    .replaceAll('createV2Handler', 'createV3Handler').replaceAll('pulse_v2_test', 'pulse_v3_test');
  const replace = (from, to) => { handler = replaceOne(handler, from, to); };
  replace("const secret=env=>env.SURVEY_V3_TURNSTILE_SECRET||env.TURNSTILE_SECRET_KEY||env.TURNSTILE_SECRET||'';",
    "const testKey=env=>env.ENVIRONMENT==='development'&&env.TURNSTILE_SITE_KEY==='1x00000000000000000000AA';\nconst secret=env=>env.SURVEY_V3_TURNSTILE_SECRET||(testKey(env)?env.SURVEY_V2_TURNSTILE_SECRET:null)||env.TURNSTILE_SECRET_KEY||env.TURNSTILE_SECRET||'';");
  replace("    const testKey=env.ENVIRONMENT==='development'&&env.TURNSTILE_SITE_KEY==='1x00000000000000000000AA';\n", '');
  replace('(!testKey&&', '(!testKey(env)&&');
  replace('payload.layout_version!==undefined&&!SUPPORTED_LAYOUTS.includes(payload.layout_version)', '!SUPPORTED_LAYOUTS.includes(payload.layout_version)');
  replace('  if(!plain(payload.answers)', `  for(const key of ['values','information','ranking','prosumer','convenience','conditions']){
    if(payload.settings[key]!==false)throw new Error('This test profile does not offer that module.');
  }
  if(!plain(payload.answers)`);
  replace('const state={version:2,', 'const state={version:3,');
  replace("scenario:'B',C:'C',", "scenario:'B','option-c-mobility':'C','option-c-target':'C',");
  replace('capabilities:{driver_dce_comparison:true}', `capabilities:{driver_dce_comparison:true,option_c_profiles:${JSON.stringify(PROFILES)}}`);
  replace('if(requested(env)&&env.DB&&secret(env))', 'if(requested(env)&&env.DB&&secret(env)&&env.TURNSTILE_SITE_KEY)');
  replace(':2000;', ':100;');
  replace("return fail(429,'test_limit'", "if(existing)return fail(409,'session_changed','This session was already submitted with different answers. Start another test.');return fail(429,'test_limit'");
  return handler;
}

export function buildV3() {
  const base = read('public/v2/survey.json');
  if (sha256(base) !== JSON.parse(read('instruments/v2-manifest.json')).sha256) throw new Error('The v2 instrument differs from its release manifest.');
  const data = optionCInstrument(JSON.parse(base));
  data.instructions.S.body = data.instructions.S.body.replace('You may use your circumstances or fictional answers.', 'Please use a fictional test profile.');
  data.meta.content_sha256 = sha256(canonical(data));
  const index = read('public/v2/index.html').replaceAll('v2', 'v3')
    .replace('v3 · compact presentation · 6 November 2026', 'v3 · Option C review · 7 November 2026')
    .replace('<a href="../v1/">Earlier v1</a>', '<a href="https://pulse-conjoint-survey.tom-tamlander.workers.dev/v2/">Earlier v2</a>');
  return {data, files: {
    'public/v3/index.html': index,
    'public/v3/app.mjs': buildApp(),
    'public/v3/engine.mjs': buildEngine(),
    'public/v3/layout.mjs': buildLayout(),
    'public/v3/routing.mjs': read('v3/routing.mjs'),
    'public/v3/review-clock.mjs': read('public/v1/engine.mjs'),
    'public/v3/matrix.mjs': read('public/v2/matrix.mjs'),
    'public/v3/styles.css': read('public/v2/styles.css') + '\n.route-review div { display: flex; flex-wrap: wrap; gap: .4em 1em; padding-block: .3em; }\n.route-review dt { font-weight: 650; }\n.route-review dd { margin: 0; }\n',
    'public/v3/survey.json': JSON.stringify(data, null, 2) + '\n',
    ...Object.fromEntries(['positioning.svg','wpt.svg','v2g.svg'].map(name => [`public/v3/assets/${name}`, read(`public/v2/assets/${name}`)])),
    'worker/v3-handler.mjs': buildHandler(),
    'migrations/0003_survey_v3_test.sql': read('migrations/0003_survey_v3_test.sql')
  }};
}

export function writeBuild(directory, files = buildV3().files) {
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, contents, {flag: 'wx'});
      fs.renameSync(temporary, target);
    } finally { fs.rmSync(temporary, {force: true}); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2] ?? '.v3-build');
  if (fs.existsSync(directory) && fs.readdirSync(directory).length) {
    throw new Error('Use a new or empty build directory.');
  }
  writeBuild(directory);
  console.log(`V3 assets built in ${directory}`);
}
