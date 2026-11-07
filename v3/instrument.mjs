export const VERSION = 'pulse-v3-option-c-test-2026-11-07';
export const LAYOUT = 'option-c-compact-2026-11-07';
export const SCHEMA = 'pulse-response-v3.0';
export const PROFILES = ['core', 'extended'];

const mobilitySource = 'Ruoholahti EV/V2G questionnaire, pp. 31–32, and PULSE Option C shortlist';
const chargingSource = 'Ruoholahti EV/V2G questionnaire, pp. 33–36, and PULSE D1.1 Annex A';
const extended = {optional_module: 'option_c_extended'};
const option = (code, label, exclusive = false) => ({code, label, ...(exclusive ? {exclusive} : {})});
const cannotJudge = option(98, 'Cannot judge', true);
const decline = option(99, 'Prefer not to answer', true);
const notApplicable = option(97, 'Not applicable', true);
const yesNo = [option(1, 'Yes'), option(2, 'No'), cannotJudge, decline];

export function optionCInstrument(base) {
  const data = structuredClone(base);
  const original = new Map(base.questions.map(q => [q.id, q]));
  const scale = original.get('C-PSYC-01').options;
  const items = [];
  const groups = [];
  const add = (id, section, text, route, type, options, metadata = {}) => {
    items.push({id, section, text, route, type, options, required: true,
      source: 'PULSE Option C proposal', wording_version: VERSION, measurement_role: 'observed', ...metadata});
  };
  const ratings = (id, title, section, rows, route = 'always', metadata = {}) => {
    for (const [suffix, text, source_id, extras] of rows) {
      add(`${id}-${suffix}`, section, text, route, 'rating', scale, {
        source: mobilitySource, source_id, construct: id, measurement_role: 'candidate_indicator', ...metadata, ...extras
      });
    }
    groups.push({id, section, title, question_ids: rows.map(([suffix]) => `${id}-${suffix}`)});
  };

  add('A3-DRV-PT-01', 'A', 'Which types of car or light van have you personally driven for personal or household travel in the past four weeks?',
    'option_c_driving', 'multi', [...original.get('A-HH-PT-01').options.filter(o => o.code < 90),
      option(97, 'I have not driven for personal or household travel in this period', true), cannotJudge, decline]);

  ratings('M3-PSYC', 'Planning everyday journeys', 'C', [
    ['01', 'I know how to plan my everyday journeys using the transport options available to me.', 'C-PSYC-01'],
    ['02', 'I know how to adapt my travel plans if my usual way of getting somewhere is disrupted.', 'C-PSYC-03']
  ]);
  ratings('M3-OPP', 'Options where you live', 'C', [
    ['01', 'I have a practical way to make at least some of my everyday journeys without a private car.', 'C-POPP-01'],
    ['02', 'I can travel without a private car at the times I usually need to get somewhere.', 'C-POPP-02']
  ], 'always', {measurement_role: 'opportunity_diagnostic'});
  ratings('M3-SOC', 'People and decisions', 'C', [
    ['01', 'People important to me support the way I prefer to make my everyday journeys.', 'C-SOPP-01'],
    ['02', 'I have a say in how I make my everyday journeys.', 'M09', {measurement_role: 'autonomy_diagnostic'}],
    ['03', 'People I travel with would help me use a transport option that works better for me.', 'C-SOPP-03', extended]
  ]);
  ratings('M3-MOT', 'What matters for everyday travel', 'C', [
    ['01', 'It matters to me to travel in a way that reduces the environmental impact of my journeys.', 'M06'],
    ['02', 'It matters to me that my everyday way of travelling supports my wellbeing.', 'M06'],
    ['03', 'It would be difficult for me to get where I need to go without access to a private car.', 'M08', {measurement_role: 'dependence_diagnostic'}]
  ]);
  ratings('M3-ACCESS', 'Making everyday journeys', 'C', [
    ['01', 'I can manage the physical steps involved in my everyday journeys using any aids or support I normally use.', 'C-PCAP-01']
  ], 'always', {...extended, measurement_role: 'accessibility_diagnostic'});

  add('M3-BAR-01', 'C', 'What currently limits the ways you can make everyday journeys? Select any that apply.', 'always', 'multi', [
    option(1, 'Suitable routes, services or travel times'), option(2, 'Cost'), option(3, 'Safety or accessibility'),
    option(4, 'Unreliable services or difficult transfers'), option(5, 'Weather or seasonal conditions'),
    option(6, 'Linked stops, caring or carrying'), option(7, 'Help, information or equipment'), option(8, 'Other reason (category only)'),
    option(96, 'Nothing limits my options', true), option(97, 'I do not currently make everyday journeys', true), cannotJudge, decline
  ], {source: mobilitySource, source_id: 'C-CTX-01 / C-NOALT-BAR-01', measurement_role: 'barrier_categories'});

  ratings('D3-ICE', 'Thinking about an electric vehicle', 'D', [
    ['01', 'I would consider a battery-electric car or van for personal travel in the next five years if I had a say in the decision.', 'I01', {measurement_role: 'prospective_outcome'}],
    ['02', 'I could find somewhere practical to charge a battery-electric vehicle for my everyday travel.', 'I02', {measurement_role: 'anticipated_opportunity'}],
    ['03', 'If I used a battery-electric vehicle, I would worry that charging would disrupt my everyday travel.', 'I03', extended],
    ['04', 'If I used a battery-electric vehicle, I would worry that it would not have enough charge for some of my regular trips.', 'I03', extended]
  ], 'option_c_nonplug_driver', {source: chargingSource, measurement_role: 'anticipated_belief'});

  add('D3-CHG-HANDS-01', 'D', 'In the past four weeks, have you personally connected this plug-in vehicle to a charger or started its charging session?',
    'charging_details', 'single', [...yesNo.slice(0, 2), notApplicable, cannotJudge, decline], {source: chargingSource, source_id: 'E01 / E04'});
  ratings('D3-EXPERIENCE', 'Your charging routine', 'D', [
    ['01', 'I know what to do if this vehicle does not start charging as expected.', 'E04', {measurement_role: 'charging_confidence'}],
    ['02', 'Charging this vehicle fits into my everyday routine.', 'E02', {measurement_role: 'routine_compatibility'}],
    ['03', 'Arranging charging for this vehicle takes more effort than I would like.', 'E03', extended],
    ['04', 'I sometimes worry about finding a suitable charger when this vehicle needs one.', 'E06', extended]
  ], 'option_c_charges', {source: chargingSource, measurement_role: 'experienced_diagnostic'});

  add('F3-V2G-CONN-01', 'F', 'Could this plug-in vehicle stay connected for six hours overnight at a charging point where it usually parks on a weekday?',
    'option_c_current_v2g', 'single', yesNo, {...extended, source: chargingSource, source_id: 'V02 / SRF-08', measurement_role: 'reported_connection_opportunity'});
  add('F3-WPT-STOP-01', 'F', 'I would feel able to stop an ongoing wireless charging session if I needed to.',
    'w_private', 'rating', scale, {...extended, source: 'PULSE D1.1 Annex A', source_id: 'SRF-11', measurement_role: 'charging_control_diagnostic'});

  const retainedC = new Set(['C-ALT-01', 'C-ALT-02', 'C-ALT-USED', 'C-COND-01', 'C-HAB-01', 'C-HAB-02',
    'C-INT-01', 'C-INT-02', 'C-BEH-01', 'C-BEH-02', 'C-CTX-01']);
  data.questions = data.questions.filter(q => q.section !== 'C' || retainedC.has(q.id));
  for (const q of data.questions.filter(q => ['C-BEH-02', 'C-CTX-01'].includes(q.id))) Object.assign(q, extended);
  data.groups = data.groups.filter(g => g.section !== 'C' || ['C-HAB', 'C-INT'].includes(g.id));
  for (const g of data.groups.filter(g => g.section === 'C')) g.question_ids = g.question_ids.filter(id => retainedC.has(id));
  data.questions.push(...items);
  data.groups.push(...groups);
  Object.assign(data.instructions, {
    'option-c-mobility': {title: 'Your everyday travel options', body: 'Think about your travel options and circumstances as they are today, whether or not you drive. If you do not make these kinds of journeys, you can select Not applicable where it fits.'},
    'option-c-target': {title: 'One journey you already make', body: 'Think about your regular journey from the past four weeks. You can tell us about an option you already use, a change you could make, or say that none is practical. Only the questions that explicitly name improvements ask you to imagine different conditions.'}
  });
  const consent = data.questions.find(q => q.id === 'TEST-CONSENT-01');
  consent.options[0].label = 'Yes, I agree to take part. I can choose whether to submit at the end.';
  data.meta = {...data.meta, version: VERSION, schema_version: SCHEMA, parent_version: base.meta.version,
    parent_content_sha256: base.meta.content_sha256, mode: 'option_c_review',
    measurement_note: 'Adapted candidate items for cognitive review. Common mobility diagnostics, actual and anticipated charging experience, and separate technology outcomes are distinct. A route skip is missing by design.'};
  delete data.meta.content_sha256;
  return data;
}
