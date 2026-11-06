"""Build the versioned flow-test instrument from frozen A0.8 wording and explicit coding.

The generated JSON is committed and used by both browser and server validation.
No Word comments, respondent records or Cloudflare identities enter the public build.
"""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'instruments/a08-wording.json').read_text())
legacy = json.loads((ROOT / 'public/v1/survey.json').read_text())
words = source['wording']
questions = []


def opts(labels, start=1):
    return [{'code': i, 'label': label} for i, label in enumerate(labels, start)]


DK = {'code': 98, 'label': 'Cannot judge', 'exclusive': True}
REF = {'code': 99, 'label': 'Prefer not to answer', 'exclusive': True}
NA = {'code': 97, 'label': 'Not applicable', 'exclusive': True}
AGREE = opts(['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree']) + [NA, DK, REF]


def add(id, section, route='always', labels=None, text=None, type='single', **extra):
    q = {'id': id, 'section': section, 'route': route, 'type': type,
         'text': text or words[id], 'options': labels if labels is not None else [],
         'wording_version': 'A0.8-adapted-v2', 'source': 'A0.8', **extra}
    questions.append(q)
    return q


def rating(id, section, route, construct=None, srf=None):
    q = add(id, section, route, AGREE, type='rating', construct=construct,
            measurement_role='candidate_reflective' if construct else 'observed_diagnostic')
    if srf:
        q['srf'] = srf
    return q


# This is round-specific test consent, not a replacement for approved fieldwork consent.
add('TEST-CONSENT-01', 'S', labels=opts(['Yes, I agree to submit test answers and timing', 'No, I do not agree']),
    text='Do you agree to take part in this questionnaire test?', source='v2 test protocol')
add('TEST-ADULT-01', 'S', labels=opts(['Yes', 'No']), text='Are you aged 18 or over?', source='v2 test protocol')
add('TEST-SITE-01', 'S', labels=opts(['Tampere, Finland', 'Trikala, Greece', 'Oxfordshire, United Kingdom']),
    text='Which demonstration area are you testing this questionnaire for?', source='v2 test protocol')

retained = ['A-MOB-01', 'A-MOB-PRIMARY', 'A-VEH-01', 'R-DRIVE-01', 'A-VEH-ACCESS-01',
            'A-OPP-01', 'A-AFF-01', 'A-FUT-ROLE', 'A-JRN-01', 'A-JRN-02', 'A-JRN-03',
            'A-JRN-04', 'A-JRN-05', 'B-TRIP-CONTEXT', 'B-MODE-EVAL', 'C-ALT-01',
            'C-ALT-USED', 'C-ALT-02', 'C-BEH-01', 'C-BEH-02', 'C-CTX-01',
            'A-DEC-01', 'A-TIME-01', 'A-PV-01', 'A-PARK-CHG', 'A-CHG-ROLE',
            'A-CHG-LOC', 'A-CHG-MAIN', 'A-CHG-OUT', 'A-CHG-SCHED']
for old in legacy['questions']:
    if old['id'] in retained or old['id'].startswith(('C-PCAP', 'C-PSYC', 'C-POPP', 'C-SOPP', 'C-RMOT', 'C-HAB', 'C-INT')):
        q = dict(old)
        q['text'] = words.get(q['id'], q['text'])
        q['wording_version'] = 'A0.8-adapted-v2'
        if q['id'].startswith('C-INT-'):
            q['text'] = q['text'].replace('[Conditional route only: With those changes,] ', '')
            q['route'] = 'intention'
        if q['id'] == 'C-BEH-02':
            q['text'] = q['text'].replace('[Conditional route only: With those changes,] ', '')
            q['route'] = 'intention'
        if q['id'] == 'R-DRIVE-01': q['route'] = 'ask_driving'
        if q['id'] == 'A-DEC-01': q['route'] = 'plug_access'
        if q['id'] == 'A-TIME-01': q['route'] = 'household_vehicle'
        if q['id'] == 'A-AFF-01': q['options'] = opts(['Not at all', 'A little', 'A moderate amount', 'Quite a lot', 'Very much']) + [REF]
        if q['id'].startswith(('C-PCAP', 'C-PSYC', 'C-POPP', 'C-SOPP', 'C-RMOT', 'C-HAB', 'C-INT')):
            q['construct'] = q['id'].rsplit('-', 1)[0]
            q['measurement_role'] = 'candidate_reflective'
            q['options'] = AGREE
        questions.append(q)

powertrains = opts(['Battery-electric: no petrol/diesel engine', 'Plug-in hybrid: can be charged from a plug',
                   'Hybrid that cannot be plugged in', 'Petrol or diesel, excluding the hybrids above', 'Another powertrain']) + [DK, REF]
add('A-PRO-DRIVE-01', 'A', labels=opts(['Yes, regularly', 'Yes, occasionally', 'No']) + [REF])
add('A-PRO-PT-01', 'A', 'professional', powertrains, type='multi')
add('A-HH-PT-01', 'A', 'household_vehicle', powertrains, type='multi')
add('A-HH-DEC-VEH-02', 'A', 'household_or_future',
    opts(['I mainly decide', 'I share the decision', 'Someone else mainly decides']) + [NA, DK, REF],
    text='How are decisions about choosing a household vehicle or its charging/energy service usually made?', source='Independent review candidate; A0.8 vehicle/service row')
add('C-COND-01', 'C', 'named_conditional', opts(['A suitable route or service', 'Journey or service times that fit my day',
    'Lower cost', 'Safer or more accessible routes or stops', 'More reliable service or easier transfers',
    'Better seasonal maintenance', 'Better arrangements for linked stops, caring or carrying', 'Another change I cannot specify here']) + [DK, REF], type='multi')
add('C-NOALT-BAR-01', 'C', 'no_alternative', opts(['A suitable route or service', 'Shorter or more convenient journey time',
    'Lower cost', 'Safer or more accessible route', 'More reliable service or easier transfers', 'Better seasonal maintenance',
    'Help with linked stops, caring or carrying', 'Another change (category only)', 'I do not want or need to change this journey']) + [DK, REF], type='multi')
add('A-CHG-PACE-01', 'D', 'charging_details', opts(['Mainly during a longer parking stay, such as home, work or a destination',
    'Mainly at short fast-charging stops', 'A mixture', 'It has not been charged recently']) + [DK, REF])

for tech, label in [('W', 'stationary wireless EV charging'), ('V', 'vehicle-to-grid or V2G'), ('P', 'automatic parking or vehicle positioning')]:
    add('A-AWARE-' + tech, 'E', labels=opts(['Yes', 'No', 'Not sure']) + [REF], text='Before today, had you heard of ' + label + '?')
for tech, label in [('W', 'stationary wireless charging'), ('V', 'a household V2G arrangement')]:
    add('F-EVAL-' + tech, 'E', labels=opts(['Yes', 'No']) + [DK, REF],
        text='Even if you do not currently have an electric vehicle, can you meaningfully consider hypothetical choices about ' + label + ' for yourself or your household?')
    add('A-EXP-' + tech, 'E', tech.lower(), opts(['No direct experience', 'Seen a demonstration, not used', 'Used personally or in my household']) + [DK, REF],
        text='Before this survey, what was your direct experience with ' + label + '?')
add('A-EXP-P', 'E', 'w_private', opts(['No direct experience', 'Seen a demonstration, not used', 'Used personally or in my household']) + [DK, REF],
    text='Before this survey, what was your direct experience with automatic parking or vehicle positioning?')
add('F-AUTH-V-01', 'E', 'v_private', opts(['I could agree myself', 'I could agree jointly with someone else',
    'Only someone else could agree', 'There is no current arrangement']) + [DK, REF],
    text='For the vehicle you have in mind, who is currently allowed to agree to a contract that sends electricity from its battery to the grid?',
    source='Independent review candidate; analytic context, not an exclusion gate')

checks = [
 ('D-WPT-CHECK-01', 'w', 'What is needed for stationary wireless charging?', ['A compatible vehicle correctly positioned above compatible equipment', 'Any EV in any parking place', 'An app alone']),
 ('D-WPT-CHECK-02', 'w', 'What does stationary wireless charging mean?', ['Charging a compatible vehicle while parked', 'Charging while the vehicle moves', 'Automatically exporting power to the grid']),
 ('D-V2G-CHECK-01', 'v', 'When the vehicle supplies energy in V2G, where does that energy go?', ['To the electricity grid', 'To another parked car', 'Only from the grid into the vehicle']),
 ('D-V2G-CHECK-02', 'v', 'What determines whether the battery may export energy?', ['An agreed arrangement with reserve and user settings', 'Parking on a pad alone', 'Charging without an export agreement']),
 ('D-PARK-CHECK-01', 'w_private', 'What is the purpose of automated positioning?', ['Moving a compatible vehicle into a specified position', 'Scheduling electricity', 'Calculating payment']),
 ('D-PARK-CHECK-02', 'w_private', 'Does automated positioning itself authorise V2G export?', ['No, a separate export agreement is needed', 'Yes, whenever a compatible pad is used', 'Yes, parking permission is enough'])]
for id, route, text, labels in checks:
    add(id, 'E', route, opts(labels) + [{'code': 98, 'label': 'Do not know'}, REF], text=text, type='check', correct=1,
        explanation='Please review the explanation above. ' + labels[0] + '.', wording_version='A0.9-test-checks', source='A0.8 checks; options restored for flow testing')

srf = {'USE': 'SRF-03', 'EASE': 'SRF-04', 'ATT': 'SRF-01', 'BI': 'SRF-26', 'PBC': 'SRF-11', 'MOBR': 'SRF-19', 'BATR': 'SRF-14'}
for tech in ['W', 'V']:
    families = ['USE', 'EASE', 'ATT', 'BI'] + (['PBC', 'MOBR', 'BATR'] if tech == 'V' else [])
    for family in families:
        for n in range(1, 4): rating(f'E-{tech}-{family}-{n:02}', 'F', tech.lower() + '_private', f'E-{tech}-{family}', srf[family])
for id in ['E-P-BEN-01', 'E-P-CTRL-01', 'E-P-BI-01']: rating(id, 'F', 'w_private')
for n in range(1, 4): rating(f'F-X-TRUST-{n:02}', 'F', 'private', 'F-X-TRUST', 'SRF-10')
for id, code in [('F-X-RELIAB-01', 'SRF-27-candidate'), ('F-X-RECOVER-01', 'SRF-27-candidate'),
                 ('F-X-CLEAR-01', 'SRF-12'), ('F-X-FIT-01', 'SRF-19'), ('F-X-SOC-01', 'SRF-09')]:
    rating(id, 'F', 'private', srf=code)
add('F-X-ACCESS-BAR', 'F', 'private', opts(['Reaching or moving within the parking/charging space',
    'Physical positioning or connection steps', 'Using an app or controls', 'Understanding messages, permissions or payment information',
    'Stopping the service or getting help', 'Another difficulty (category only)']) + [dict(NA, label='No such difficulty'), dict(DK, label='Not enough information to judge'), REF], type='multi', srf='SRF-25/05/06/12; category-specific')
for id in ['G-EMF-01', 'G-W-EMF-CONC-01']: rating(id, 'F', 'w_private')
for id in ['G-DATA-CONC-01', 'G-DATA-USE-01', 'G-ACCESS-01']: rating(id, 'F', 'private')

add('G-WPT-CONTEXT-01', 'G', 'w_private', opts(['Yes', 'No, I cannot picture a stop like that']) + [DK, REF],
    text='Imagine a place where you would already park for two hours. Could you compare charging offers for that stop, even if you usually charge somewhere else?', wording_version='A0.9-test')
add('G-V2G-CONTEXT-01', 'G', 'v_private', opts(['Yes', 'No, I cannot picture comparing contracts like these']) + [DK, REF],
    text='With the hypothetical vehicle and terms just described, can you compare these V2G offers?', source='New evaluability check for flow testing')
for tech in ['W', 'V']:
    for n in range(1, 4):
        q = rating(f'G-{tech}-BI-POST-{n:02}', 'G', tech.lower() + '_post', f'E-{tech}-BI', 'SRF-26')
        q['occasion'] = 'post_information'
for id in ['G-PUB-SUPPORT-POST-01', 'G-PUB-ATT-POST-01']: rating(id, 'G', 'public')
for n in range(1, 5):
    add(f'G-BEN-IMP-{n:02}', 'G', labels=opts(['Not at all important', 'Slightly important', 'Moderately important', 'Very important', 'Extremely important']) + [dict(NA, label='Not relevant'), DK, REF],
        text='How important would this possible benefit be [BENEFICIARY]? [BENEFIT]', type='rating', measurement_role='observed_priority')
add('G-BEN-RANK-01', 'G', 'ranking', text='Which possible benefits matter most to you? You can stop after one, or add a second and a third.',
    labels=opts(['Benefit 1', 'Benefit 2', 'Benefit 3', 'Benefit 4']) + [dict(NA, label='None of these benefits matters to me'), DK, REF], type='rank')
add('G-REF-CON-01', 'G', labels=opts(['Price or payment uncertainty', 'Positioning, connection or access', 'Dependable operation and fallback',
    'Travel reserve or readiness', 'Battery wear or protection', 'Permissions or loss of control', 'Electromagnetic-field concern',
    'Data use', 'Unclear information or help', 'Another concern (category only)']) + [dict(NA, label='No concern mattered'), DK, REF], type='multi', max_selections=3,
    text='Which concerns about [TECH], if any, mattered most to you? Select up to three.', option_filter='technology_concerns')
add('G-REF-MIN-01', 'G', 'private', opts(['Clear price/payment and conditions', 'Ability to stop or change participation',
    'Confidence that vehicle needs are met', 'Accessible steps and support', 'Dependable operation and recovery',
    'Clear data rules and responsibilities', 'Fair sharing of benefits and costs', 'Another condition (category only)']) + [dict(NA, label='I would not consider it under these conditions'), DK, REF],
    type='multi', max_selections=3, text='Which conditions would matter most before you would consider [TECH]? Select up to three.', optional_module='conditions')
add('G-PUB-MIN-01', 'G', 'public_conditions', opts(['Clear local costs and funding', 'Accessible spaces and controls', 'Information about who benefits and who is affected',
    'Clear responsibilities and support', 'An opportunity for affected people to influence decisions']) + [dict(NA, label='I would oppose introduction under these conditions'), DK, REF],
    type='multi', max_selections=3, text='What conditions would matter most before this service was offered in your local area? Select up to three.', source='Independent review candidate')
for id in ['G-PUB-FAIR-01', 'G-PUB-NONUSER-01']: rating(id, 'G', 'always')
add('G-PUB-VOICE-01', 'G', labels=opts(['Accessible information about costs and benefits', 'An opportunity to give feedback',
    'Involvement of affected residents and non-users', 'Involvement of people with access needs', 'A clear response to concerns or complaints']) + [dict(NA, label='No additional involvement needed'), DK, REF],
    type='multi')
for id in ['G-V-PROS-01', 'G-V-PROS-02', 'G-V-PROS-03']: rating(id, 'G', 'prosumer')
for id in ['C-CONV-01', 'C-PLAN-EFFORT-01']: rating(id, 'C', 'convenience')
for n in range(1, 14):
    family = 'values-egoistic' if n in [1, 2, 5, 7, 11] else 'values-altruistic' if n in [3, 9, 10, 12] else 'values-biospheric'
    add(f'AE1r{n}', 'V', 'values', opts(['Not important at all', 'Of little importance', 'Somewhat important', 'Moderately important', 'Important', 'Very important', 'Extremely important']) + [REF],
        type='rating', construct=family, measurement_role='candidate_reflective', wording_version='A0.8-adapted-values-1to7-soft-cap')

demo = {
 'H-AGE-01': ['18–24 years', '25–34 years', '35–44 years', '45–54 years', '55–64 years', '65–74 years', '75 years or older'],
 'H-GEN-01': ['Woman', 'Man', 'Non-binary or another gender identity'],
 'H-LOC-01': ['City centre', 'Other urban area, including suburbs', 'Smaller town', 'Village or rural area'],
 'H-EDU-01': ['Basic education or below', 'Upper-secondary general qualification', 'Upper-secondary vocational qualification', 'Bachelor’s degree or equivalent', 'Master’s degree or equivalent', 'Licentiate or doctoral degree'],
 'H-OCC-01': ['Self-employed / entrepreneur', 'Managerial, professional or expert employee', 'Administrative or clerical employee', 'Manual, service or other employee', 'Student', 'Retired', 'Other situation, including unemployment or caring'],
 'H-HH-TYPE-01': ['I live alone', 'With a partner, without children', 'With a partner and children', 'With my children, without a partner', 'With parent(s) or guardian(s)', 'Another household arrangement'],
 'H-FIN-01': ['Very easy', 'Easy', 'Fairly easy', 'With some difficulty', 'With difficulty', 'With great difficulty']}
for id, labels in demo.items(): add(id, 'H', labels=opts(labels) + ([dict(NA, label='Other qualification / unable to map')] if id == 'H-EDU-01' else []) + [REF])
for id, minimum in [('H-HH-SIZE-01', 1), ('H-CHILD-01', 0)]:
    add(id, 'H', labels=opts([str(n) for n in range(minimum, 21)], start=minimum) + [REF], type='number', minimum=minimum, maximum=20)

groups = []
titles = {'C-PCAP': 'Physical demands', 'C-PSYC': 'Planning and knowledge', 'C-POPP': 'Routes and opportunities',
          'C-SOPP': 'People around you', 'C-RMOT': 'Your view of this option', 'C-HAB': 'Your usual way of travelling', 'C-INT': 'The next four weeks'}
for family, title in titles.items():
    groups.append({'id': family, 'title': title, 'section': 'C', 'question_ids': [q['id'] for q in questions if q.get('construct') == family]})
for tech in ['W', 'V']:
    for family, title in [('USE', 'Possible usefulness'), ('EASE', 'Using the service'), ('ATT', 'Your view of the service'),
                          ('BI', 'Your household choice'), ('PBC', 'Control over participation'), ('MOBR', 'Travel and reserve concerns'), ('BATR', 'Battery concerns')]:
        ids = [q['id'] for q in questions if q['id'].startswith(f'E-{tech}-{family}-')]
        if ids: groups.append({'id': f'E-{tech}-{family}', 'title': title, 'section': 'F', 'question_ids': ids})
groups += [{'id': 'F-X-TRUST', 'title': 'The service operator', 'section': 'F', 'question_ids': [f'F-X-TRUST-{n:02}' for n in range(1, 4)]},
           {'id': 'F-service', 'title': 'How the service would work', 'section': 'F', 'question_ids': ['F-X-RELIAB-01', 'F-X-RECOVER-01', 'F-X-CLEAR-01', 'F-X-FIT-01', 'F-X-SOC-01']},
           {'id': 'F-positioning', 'title': 'Positioning the vehicle', 'section': 'F', 'question_ids': ['E-P-BEN-01', 'E-P-CTRL-01', 'E-P-BI-01']},
           {'id': 'G-benefits', 'title': 'Possible benefits', 'section': 'G', 'question_ids': [f'G-BEN-IMP-{n:02}' for n in range(1, 5)]}]

tasks = []
for t in legacy['tasks']:
    task = dict(t, id=t['id'].replace('T-', 'T09-'), source_task_id=t['id'], block='transport', section='B', design_version='T09-flow-prototype')
    tasks.append(task)
tables = source['tables']
for block, start, prefix, label in [('wpt', 7, 'W09', 'Wireless'), ('v2g', 15, 'V09', 'V2G')]:
    for i in range(7):
        rows = tables[start + i]['rows']
        profiles = []
        for col in range(1, 4):
            values = [rows[n][col] for n in range(1, 6)]
            if block == 'wpt':
                attrs = {'price': float(values[0].replace('€', '')), 'detour': int(values[1]), 'reliability': int(values[2]), 'renewable': int(values[3]), 'positioning': values[4]}
            else:
                reserve = int(values[1].split('%')[0]) if '%' in values[1] else None
                attrs = {'payment': float(values[0].replace('€', '')), 'reserve': reserve, 'weekdays': int(values[2]), 'authorisation': values[3], 'renewable': int(values[4])}
            profiles.append({'id': col, 'label': rows[0][col], 'attributes': attrs})
        task_id = prefix + ('-P' if i == 0 else f'-{i:02}')
        tasks.append({'id': task_id, 'source_task_id': ('W08' if block == 'wpt' else 'V08') + ('-P' if i == 0 else f'-{i:02}'),
                      'practice': i == 0, 'profiles': profiles, 'block': block, 'section': 'G', 'design_version': prefix + '-flow-prototype'})

instructions = dict(legacy['instructions'])
instructions.update({
 'journey': {'title': 'One real journey', 'body': 'Think about one real one-way journey you have made regularly during the past four weeks, for example for work or study, errands or care, or leisure. Please use this same journey for the ordinary-travel questions. We will return to it after the separate hypothetical 2030 trip. If you have no recurring journey, you can say so.'},
 'S': {'title': 'About this questionnaire test', 'body': 'This version tests the flow and clarity of questions about everyday travel, parked wireless charging and vehicle-to-grid services. You may use your circumstances or fictional answers. Please do not enter names or contact details. If you choose Submit at the end, your test answers, route and active time are saved for improving the questionnaire. Screen comments stay in this browser tab and can be downloaded separately. You may leave before submitting. This is not the main research survey and does not activate any service.'},
 'E': {'title': 'Two possible charging and energy services', 'body': 'These are hypothetical services for testing the questions. A suitable compatible vehicle and equipment are assumed only where the scenario says so. Wireless charging, vehicle-to-grid export and automated positioning are separate capabilities.'},
 'wpt': {'title': 'Stationary wireless charging', 'body': words['D-CARD-W'], 'image': 'wpt.svg'},
 'v2g': {'title': 'Vehicle-to-grid or V2G', 'body': words['D-CARD-V'], 'image': 'v2g.svg'},
 'positioning': {'title': 'Automated positioning', 'body': words['D-CARD-P'], 'image': 'positioning.svg'},
 'F': {'title': 'Consider the service for your own role', 'body': 'Imagine a suitable compatible vehicle and the described service were available to you or your household. Answer for your own role in using it or taking part in decisions. The operator means the organisation running the service and dealing with users’ requests. No particular organisation is named. Choose Cannot judge if you need more information.'},
 'wpt_gate': {'title': 'A planned parking stop', 'body': 'Imagine a place where you would already park for two hours, such as work, shops or another destination. You are comparing charging during that stay, rather than an urgent fast-charging stop.'},
 'wpt_terms': {'title': 'The same parking stay and energy', 'body': 'In this hypothetical comparison, compatible equipment is provided, there is no queue and setup takes two minutes. Both cable and wireless options deliver 20 kWh to the battery during the same two-hour stay. The displayed total price includes conversion losses. Extra round-trip driving is a detour outside the two hours. €10 for 20 kWh means €0.50 per delivered kWh.\n\nNo-restart sessions means completion without interrupting the session to restart it, out of 100 attempts. If wireless needs a restart, cable fallback is available at the same location, with connection assistance if needed. For this test scenario its €10 total replaces the wireless charge; there is no double charge, and 20 kWh is still delivered before departure.\n\nDriver with guidance means an authorised driver positions the vehicle. Automatic positioning uses an authorised system with supervision and a stop control. Neither means driverless road travel. Renewable share is the annual purchased-supply allocation, not the electricity mix at that moment. These are proposed test terms, not a service guarantee.'},
 'v2g_terms': {'title': 'A hypothetical V2G arrangement', 'body': 'Imagine a compatible 60 kWh EV and suitable charging point. Compare offers over 12 months. Equipment, installation and joining have no additional household charge. No V2G means ordinary one-way smart charging, no grid export and no availability payment.\n\nOn the agreed one, three or five weekdays each week, the vehicle is connected for a six-hour overnight window. At most one export event occurs on an active weekday, lasting at most two hours and exporting at most 6 kWh. Arrival charge varies. Export stops at the protected reserve; if arrival charge is below that reserve, no export is permitted until charging raises it above the reserve. The reserve is a floor for export, not a promise of current charge or driving range.\n\nYou can stop export or unplug immediately. Restoration to 80% charge for a declared departure needs at least four hours’ notice. An unexpected departure does not promise immediate restoration. Each-event approval, automatic notice and automatic with a dashboard record differ; all retain a stop control and withdrawal.'},
 'v2g_payment': {'title': 'The provider pays your household', 'body': 'Payment is for the agreed availability hours, up to the monthly maximum shown. Connected hours with the agreed permissions count even if the provider requests no export; the agreed reserve does not by itself reduce payment. Disconnected hours or hours affected by declining/overriding a requested event do not count. There is no extra fine or exit fee.\n\nExample: at a €60 monthly maximum, meeting half the agreed hours pays €30 to your household. Exported electricity, restoration electricity and extra conversion losses are reimbursed separately. Ordinary travel-energy costs remain yours and are equal across offers.\n\nThe hypothetical contract covers independently verified additional battery damage attributable to V2G, excluding normal ageing. It uses battery status, declared departure and energy-flow information, without route tracking. Renewable share is an annual purchased-supply allocation, not guaranteed instantaneous renewable power or emissions savings. These proposed terms need partner testing; they do not promise earnings or home backup power.'},
 'public': {'title': 'Now consider people in the local area', 'body': 'Think about making [TECH] available in [SITE], including people who might never use it. Some households would have compatible vehicles or equipment and others would not. The operator would run the service, but local locations and who funds installation are not settled in this description. No service is being approved by this survey. Choose Cannot judge if these missing facts prevent a judgement.'},
 'benefits': {'title': 'Possible benefits and your priorities', 'body': 'These are possible benefits, not promises. A benefit can be unimportant or irrelevant to you. Please give your own view rather than what you think the project wants to hear.'},
 'values': {'title': 'Guiding principles in your life', 'body': 'How important is each value as a guiding principle in your life? Use 1 Not important at all to 7 Extremely important. Please try not to give more than two values a seven; you can still continue or prefer not to answer. This is a test of the adapted values format.'},
 'H': {'title': 'A few final background questions', 'body': 'These help us check how the questions work for different circumstances. You can prefer not to answer any of them.'}
})
benefits = {
 'wpt': [{'id': 'WB1', 'label': 'Less cable handling'}, {'id': 'WB2', 'label': 'Charging during routine parking'},
         {'id': 'WB3', 'label': 'Help reaching the charging position'}, {'id': 'WB4', 'label': 'More independent access for some users'}],
 'v2g': [{'id': 'VB1', 'label': 'Availability income for participating households'}, {'id': 'VB2', 'label': 'Helping balance the electricity system'},
         {'id': 'VB3', 'label': 'Supporting variable renewable electricity'}, {'id': 'VB4', 'label': 'An active role in managing stored energy'}]
}
info_cards = {tech: [words['G-INFO-W' if tech == 'wpt' else 'G-INFO-V']] for tech in ['wpt', 'v2g']}
# Explanations are explicit and balanced; only the assigned optional treatment sees them.
info_cards['wpt'] += [
 'With a compatible vehicle and correctly placed pad, wireless charging can avoid manually connecting a cable.',
 'A suitable installation can fit a planned parking stay. Cable charging can also do this; this is not a wireless speed advantage.',
 'Authorised positioning assistance may help place the vehicle correctly, with supervision and stop controls.',
 'Avoiding cable handling may support independent use if layout, controls and support suit the person’s needs.']
info_cards['v2g'] += [
 'A household may receive compensation under agreed availability conditions, potentially below the maximum; energy reimbursement is separate.',
 'Agreed battery export may help match electricity supply and demand, depending on service and grid conditions.',
 'Coordinated charging/export may support variable renewable generation. The effect depends on timing, supply and operation.',
 'Households may contribute stored energy under their reserve, schedule and permissions while retaining stop and withdrawal controls.']

data = {'meta': {'version': 'pulse-v2-A0.9-test-2026-11-04', 'schema_version': 'pulse-response-v2.0', 'language': 'en',
        'mode': 'instrument_flow_test', 'source_document': source['source'], 'source_sha256': source['source_sha256'],
        'alignment_document': 'PULSE D1.1 V1.0 Final, delivered 2 November 2026', 'design_status': 'clarity prototypes; not optimised fieldwork designs',
        'currency': 'EUR', 'currency_note': 'Euro prototype levels for flow testing; UK field levels require localisation.',
        'defaults': {'values': False, 'information': False, 'ranking': False, 'prosumer': False, 'convenience': False, 'conditions': False},
        'scenario_decisions': 'W09 fallback and V09 availability are explicit hypothetical test terms requiring partner confirmation.'},
        'sites': [{'code': 1, 'id': 'tampere', 'country': 'FI', 'label': 'Tampere'}, {'code': 2, 'id': 'trikala', 'country': 'GR', 'label': 'Trikala'}, {'code': 3, 'id': 'oxfordshire', 'country': 'GB', 'label': 'Oxfordshire'}],
        'questions': questions, 'groups': groups, 'tasks': tasks, 'instructions': instructions, 'benefits': benefits, 'information_cards': info_cards}
anchors = {
    'COM-B': {'authors': 'Michie, van Stralen and West (2011); Keyworth et al. (2020)', 'doi': ['10.1186/1748-5908-6-42', '10.1111/bjhp.12417'], 'status': 'Expanded journey-specific candidate adaptations; not a verbatim validated battery'},
    'SRBAI': {'authors': 'Gardner et al. (2012)', 'doi': ['10.1186/1479-5868-9-102'], 'status': 'Four adapted current-mode automaticity items'},
    'TPB': {'authors': 'Ajzen (1991)', 'doi': ['10.1016/0749-5978(91)90020-T'], 'status': 'Theory anchor; PULSE wording and narrower control facet'},
    'TAM-PU-PEOU': {'authors': 'Davis (1989)', 'doi': ['10.2307/249008'], 'status': 'Household hypothetical adaptations'},
    'TAM-model': {'authors': 'Davis, Bagozzi and Warshaw (1989)', 'doi': ['10.1287/mnsc.35.8.982'], 'status': 'Attitude/intention model anchor; adapted indicators'},
    'V2G-context': {'authors': 'Helferich et al. (2024); Ghotge et al. (2022)', 'doi': ['10.1016/j.enpol.2024.114240', '10.3390/en15134907'], 'status': 'Domain evidence; not exact item-scale validation'},
    'trust': {'authors': 'McKnight, Choudhury and Kacmar (2002)', 'doi': ['10.1287/isre.13.3.334.81'], 'status': 'Integrity/permission-focused adaptation, not the whole multidimensional instrument'},
    'values': {'authors': 'De Groot and Steg (2007; 2008)', 'doi': ['10.1177/0022022107300278', '10.1177/0013916506297831'], 'status': 'Adapted 1–7 anchors and soft maximum-two-sevens instruction; format decision remains open'},
    'SDT': {'authors': 'Ryan and Deci (2000)', 'doi': ['10.1037/0003-066X.55.1.68'], 'status': 'Prosumer diagnostics are not an autonomy/competence/relatedness scale'}
}
data['theoretical_anchors'] = anchors
register = {}
for q in questions:
    family = q.get('construct')
    if not family:
        continue
    anchor = 'SRBAI' if family == 'C-HAB' else 'TPB' if family == 'C-INT' or family.endswith('-PBC') else 'COM-B' if family.startswith('C-') else 'trust' if family == 'F-X-TRUST' else 'values' if family.startswith('values-') else 'TAM-PU-PEOU' if family.endswith(('-USE', '-EASE')) else 'V2G-context' if family.endswith(('-MOBR', '-BATR')) else 'TAM-model'
    register.setdefault(family, {'anchor': anchor, 'measurement_role': 'candidate_reflective', 'validation': 'not_established_in_PULSE', 'item_ids': [], 'occasions': []})
    register[family]['item_ids'].append(q['id'])
    if q.get('occasion', 'baseline') not in register[family]['occasions']:
        register[family]['occasions'].append(q.get('occasion', 'baseline'))
data['construct_register'] = register
data['meta']['measurement_note'] = 'Baseline and post-information BI are separate occasions, not six baseline indicators. Single SRF diagnostics and prosumer facets are not pooled into latent readiness or motivation scores.'
ids = [q['id'] for q in questions]
assert len(ids) == len(set(ids)), 'Duplicate item IDs'
assert len(tasks) == 19 and sum(not t['practice'] for t in tasks) == 16
assert sum((q.get('construct') or '').startswith('C-') for q in questions) == 22
data['meta']['content_sha256'] = hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
serialized = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
(ROOT / 'public/v2/survey.json').write_text(serialized)
(ROOT / 'instruments/v2-manifest.json').write_text(json.dumps({'version': data['meta']['version'], 'sha256': hashlib.sha256(serialized.encode()).hexdigest(), 'questions': len(questions), 'tasks': len(tasks), 'source_sha256': source['source_sha256']}, indent=2) + '\n')
with (ROOT / 'instruments/v2-codebook.csv').open('w', newline='') as f:
    w = csv.writer(f, lineterminator='\n')
    w.writerow(['item_id', 'section', 'type', 'route', 'construct', 'occasion', 'measurement_role', 'srf', 'theoretical_doi', 'wording_version', 'text', 'response_codes'])
    for q in questions:
        anchor = register.get(q.get('construct'), {}).get('anchor')
        w.writerow([q['id'], q['section'], q['type'], q['route'], q.get('construct', ''), q.get('occasion', 'baseline') if q.get('construct') else '', q.get('measurement_role', 'observed'), q.get('srf', ''), '; '.join(anchors.get(anchor, {}).get('doi', [])), q.get('wording_version', ''), q['text'], json.dumps(q['options'], ensure_ascii=False)])
print(f'Built {len(questions)} items and {len(tasks)} candidate choice cards; one technology per respondent.')
