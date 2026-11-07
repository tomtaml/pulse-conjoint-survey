// Fictional answers for automated route and collection checks.
export const fictionalDriver = {
  'TEST-CONSENT-01': 1, 'TEST-ADULT-01': 1, 'TEST-SITE-01': 1,
  'A-MOB-01': [3, 4], 'A-MOB-PRIMARY': 4, 'A-VEH-01': 4, 'A-PRO-DRIVE-01': 3,
  'A-VEH-ACCESS-01': 1, 'A-HH-PT-01': [1], 'A3-DRV-PT-01': [1], 'A-FUT-ROLE': 1,
  'A-JRN-01': 1, 'A-JRN-02': 4, 'B-TRIP-CONTEXT': 1, 'B-MODE-EVAL': [1, 3],
  'M3-BAR-01': [96], 'C-ALT-01': 4, 'A-CHG-ROLE': 1, 'A-CHG-LOC': [1], 'D3-CHG-HANDS-01': 1,
  'F-EVAL-W': 1, 'F-EVAL-V': 1, 'G-WPT-CONTEXT-01': 1, 'G-V2G-CONTEXT-01': 1
};

export function completeFixture(data, engine, overrides = {}, settings = {}, seed = 41327) {
  let state = engine.freshState(seed, settings);
  const answers = {...fictionalDriver, ...overrides};
  for (let pass = 0; pass < 500; pass++) {
    const step = engine.pathFor(data, state).find(s => engine.stepErrors(data, s, state).length);
    if (!step) return {...state, started: true, finished: true};
    if (step.kind === 'choice') {
      const snapshot = engine.taskSnapshot(step.task, state.answers, state, data);
      state.choices[step.id] = snapshot.display_order[0];
      state.choiceSnapshots[step.id] = snapshot;
      continue;
    }
    for (const {id} of engine.stepErrors(data, step, state)) {
      const q = data.questions.find(q => q.id === id);
      const first = engine.optionsFor(q, state.answers, state, data)[0].code;
      const value = answers[id] ?? (q.type === 'check' ? q.correct : ['multi','rank'].includes(q.type) ? [first] : first);
      state = engine.updateAnswer(data, state, id, structuredClone(value));
      if (q.type === 'check') state.checks[id] = {first: value, last: value, attempts: 1};
    }
  }
  throw new Error('The fictional v3 route did not converge.');
}

export function deploymentFixture(data, engine) {
  const state = completeFixture(data, engine, {}, {technology_override: 'wpt', option_c_extended: true});
  const hash = data.meta.content_sha256;
  // One stable receipt for this instrument, including on a repeated deployment.
  state.session_id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
  state.test_purpose = 'deployment_check';
  state.created_at = '2026-11-07T00:00:00.000Z';
  return engine.submissionPayload(data, state, {
    active_ms: 1700,
    by_step_ms: {'intro-S': 800, 'intro-option-c-mobility': 400, 'page-C3-planning': 500},
    visits: {'intro-S': 1, 'intro-option-c-mobility': 1, 'page-C3-planning': 1}
  });
}
