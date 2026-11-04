"""Prepare versioned survey exports for Python/MATLAB analysis; no population generation.

Standard library only. Test/synthetic records require separate explicit flags.
Candidate scores require complete valid item sets and are not validated scales.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def unpack(value):
    if isinstance(value, list):
        for item in value:
            yield from unpack(item)
    elif isinstance(value, dict):
        if isinstance(value.get('payload_json'), str):
            yield json.loads(value['payload_json'])
        elif 'answers' in value and 'schema_version' in value:
            yield value
        elif isinstance(value.get('results'), list):
            yield from unpack(value['results'])
        else:
            raise ValueError('Unsupported export object; expected a session or D1 results.')
    else:
        raise ValueError('Unsupported export format.')


def csv_file(path, columns, rows):
    with path.open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)


def prepare(inputs, output, include_tests=False, include_synthetic=False):
    instrument = json.loads((ROOT / 'public/v2/survey.json').read_text())
    questions = {q['id']: q for q in instrument['questions']}
    families = {}
    for q in questions.values():
        if q.get('measurement_role') == 'candidate_reflective' and q.get('construct'):
            # Repeated intentions are the same concept at another occasion, not
            # extra interchangeable baseline indicators.
            family = q['construct'] + ('__post' if q.get('occasion') == 'post_information' else '')
            families.setdefault(family, []).append(q['id'])
    records, seen, excluded, input_hashes = [], {}, {}, {}
    for filename in inputs:
        filename = Path(filename)
        raw = filename.read_bytes()
        input_hashes[filename.name] = hashlib.sha256(raw).hexdigest()
        for record in unpack(json.loads(raw)):
            if record.get('schema_version') != instrument['meta']['schema_version']:
                raise ValueError('An export has a different response schema; use a versioned adapter.')
            if record.get('instrument_version') != instrument['meta']['version']:
                raise ValueError('Different instrument versions must not be pooled without a mapping.')
            if record.get('instrument_content_sha256') != instrument['meta']['content_sha256']:
                raise ValueError('Different questionnaire content requires an explicit versioned mapping.')
            kind = record.get('record_kind')
            if record.get('test_purpose') == 'deployment_check':
                excluded['deployment_check'] = excluded.get('deployment_check', 0) + 1
                continue
            if kind == 'instrument_test' and not include_tests:
                excluded['instrument_test'] = excluded.get('instrument_test', 0) + 1
                continue
            if kind == 'synthetic':
                if not record.get('synthetic_generation'):
                    raise ValueError('Synthetic records require generation provenance.')
                if not include_synthetic:
                    excluded['synthetic'] = excluded.get('synthetic', 0) + 1
                    continue
            if kind not in ['instrument_test', 'synthetic', 'study_response']:
                raise ValueError('Unknown record origin; it must be classified before analysis.')
            identity = record['session_id']
            signature = json.dumps({k: record.get(k) for k in ['instrument_version', 'answers', 'choices', 'seed', 'settings']}, sort_keys=True)
            if identity in seen:
                if seen[identity] != signature:
                    raise ValueError('Conflicting records share a session identifier.')
                continue
            seen[identity] = signature
            records.append(record)

    output = Path(output)
    if any(output.resolve() == p.resolve() or p.resolve() in output.resolve().parents for p in [ROOT / 'public']):
        raise ValueError('Analysis outputs must not be written into public assets.')
    output.mkdir(parents=True, exist_ok=True)
    participants, answer_rows, wide, scores, choice_rows = [], [], [], [], []
    metadata = ['session_id', 'record_kind', 'test_purpose', 'complete', 'instrument_version', 'site', 'technology', 'respondent_route', 'comb_target', 'active_ms']
    for record in records:
        route, answers = record['route'], record['answers']
        meta = {'session_id': record['session_id'], 'record_kind': record['record_kind'], 'test_purpose': record.get('test_purpose', ''), 'complete': int(bool(record.get('complete'))), 'instrument_version': record['instrument_version'],
                'site': record['site'], 'technology': route['technology'], 'respondent_route': 'private' if route['privateRoute'] else 'public',
                'comb_target': route.get('combTarget', ''), 'active_ms': record.get('timing', {}).get('active_ms', '')}
        participants.append(meta)
        wide_row, score_row = dict(meta), dict(meta)
        for id, q in questions.items():
            value = answers.get(id)
            status = record.get('response_status', {}).get(id, 'not_shown' if value is None else 'answered')
            answer_rows.append({**meta, 'item_id': id, 'type': q['type'], 'codes': json.dumps(value) if value is not None else '',
                                'response_status': status, 'construct': q.get('construct') or '', 'srf': q.get('srf') or ''})
            # Nominal codes are retained for explicit recoding, never fed to clustering automatically.
            wide_row[id] = value if isinstance(value, int) and status == 'answered' else ''
        for family, ids in families.items():
            maximum = 7 if family.startswith('values-') else 5
            values = [answers.get(id) for id in ids]
            valid = [v for v in values if isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= maximum]
            score_row[family + '__n'] = len(valid)
            score_row[family] = sum(valid) / len(valid) if len(valid) == len(ids) else ''
        wide.append(wide_row)
        scores.append(score_row)
        for choice in record['choices']:
            if choice.get('status') != 'answered':
                continue
            for alternative in choice['alternatives']:
                choice_rows.append({**meta, 'task_id': choice['task_id'], 'source_task_id': choice.get('source_task_id', ''),
                    'block': choice['block'], 'practice': int(choice['practice']), 'design_version': choice['design_version'],
                    'task_order': choice['task_order'], 'alternative_id': alternative['canonical_id'],
                    'display_position': choice['display_order'].index(alternative['canonical_id']) + 1,
                    'selected': int(alternative['canonical_id'] == choice['selected']),
                    'outside_option': int(alternative['canonical_id'] == (3 if choice['block'] == 'v2g' else 4)),
                    **(alternative.get('attributes') or {})})
    csv_file(output / 'participants.csv', metadata, participants)
    csv_file(output / 'answers_long.csv', metadata + ['item_id', 'type', 'codes', 'response_status', 'construct', 'srf'], answer_rows)
    csv_file(output / 'responses_wide.csv', metadata + list(questions), wide)
    csv_file(output / 'candidate_construct_scores.csv', metadata + [name for family in families for name in [family, family + '__n']], scores)
    attrs = ['cost', 'time', 'reliability', 'walk', 'price', 'detour', 'renewable', 'positioning', 'payment', 'reserve', 'weekdays', 'authorisation']
    csv_file(output / 'choices_long.csv', metadata + ['task_id', 'source_task_id', 'block', 'practice', 'design_version', 'task_order', 'alternative_id', 'display_position', 'selected', 'outside_option'] + attrs, choice_rows)
    model_features = {
        'mobility': ['C-PCAP', 'C-PSYC', 'C-POPP', 'C-SOPP', 'C-RMOT', 'C-HAB', 'C-INT'],
        'wpt': ['E-W-USE', 'E-W-EASE', 'E-W-ATT', 'E-W-BI', 'F-X-TRUST'],
        'v2g': ['E-V-USE', 'E-V-EASE', 'E-V-ATT', 'E-V-BI', 'E-V-PBC', 'E-V-MOBR', 'E-V-BATR', 'F-X-TRUST']}
    model_counts = {}
    for model, features in model_features.items():
        selected = [r for r in scores if (model == 'mobility' or r['technology'] == model and r['respondent_route'] == 'private') and all(r[f] != '' for f in features)]
        csv_file(output / ('model_input_' + model + '.csv'), metadata + features, selected)
        model_counts[model] = len(selected)
    report = {'schema_version': instrument['meta']['schema_version'], 'instrument_version': instrument['meta']['version'],
              'records': len(records), 'excluded': excluded, 'model_complete_cases': model_counts,
              'input_sha256': input_hashes, 'test_data_included': include_tests, 'synthetic_data_included': include_synthetic,
              'scoring': 'Candidate mean only when every indicator is a valid scale answer; no route-skip or missing-code imputation.',
              'models_fitted': False, 'population_weights': None, 'population_representativeness': 'not established',
              'site_interpretation': 'For instrument tests, site identifies the selected demo-site questionnaire, not verified residence.',
              'next_steps': ['validate adapted measurement', 'choose comparable behaviour/role/site groups', 'agree eligible clustering features and weights', 'validate archetypes against independent evidence']}
    (output / 'analysis_manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', action='append', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--include-instrument-tests', action='store_true')
    parser.add_argument('--include-synthetic', action='store_true')
    args = parser.parse_args()
    try:
        result = prepare(args.input, args.output, args.include_instrument_tests, args.include_synthetic)
        print(json.dumps(result, indent=2))
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
        parser.error(str(error))
