import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare_survey', ROOT / 'analysis/python/prepare_survey.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreparationTests(unittest.TestCase):
    def test_layout_is_metadata_for_both_legacy_and_compact_exports(self):
        instrument = json.loads((ROOT / 'public/v2/survey.json').read_text())
        base = {'schema_version': instrument['meta']['schema_version'], 'instrument_version': instrument['meta']['version'], 'instrument_content_sha256': instrument['meta']['content_sha256'],
                'record_kind': 'instrument_test', 'complete': True, 'site': 'tampere', 'seed': 1, 'settings': {},
                'route': {'technology': 'wpt', 'privateRoute': True, 'combTarget': 'current_condition_option'}, 'answers': {}, 'choices': []}
        records = [{**base, 'session_id': 'legacy'}, {**base, 'session_id': 'compact', 'layout_version': 'compact-2026-11-06', 'settings': {'review_both_dce': True}}]
        with tempfile.TemporaryDirectory(dir=ROOT, prefix='.guard-test-analysis-') as temp:
            temp = Path(temp)
            source = temp / 'layouts.json'
            source.write_text(json.dumps(records))
            report = module.prepare([source], temp / 'out', include_tests=True)
            self.assertEqual(report['layout_versions'], {'compact-2026-11-06': 1, 'pages-2026-11-04': 1})
            self.assertEqual(report['dce_review_modes'], {'both_drivers': 1, 'single': 1})
            with (temp / 'out/participants.csv').open(encoding='utf-8-sig') as f:
                rows = list(csv.DictReader(f))
            self.assertEqual([r['layout_version'] for r in rows], ['pages-2026-11-04', 'compact-2026-11-06'])
            self.assertEqual([r['dce_review_mode'] for r in rows], ['single', 'both_drivers'])
            source.write_text(json.dumps([records[0], {**records[1], 'session_id': 'legacy'}]))
            with self.assertRaisesRegex(ValueError, 'Conflicting records'):
                module.prepare([source], temp / 'conflict', include_tests=True)

    def test_baseline_and_repeated_intention_are_scored_at_separate_occasions(self):
        instrument = json.loads((ROOT / 'public/v2/survey.json').read_text())
        answers = {q['id']: 4 for q in instrument['questions'] if q.get('construct') in ['E-W-USE', 'E-W-EASE', 'E-W-ATT', 'E-W-BI', 'F-X-TRUST'] and q.get('occasion') != 'post_information'}
        record = {'schema_version': instrument['meta']['schema_version'], 'instrument_version': instrument['meta']['version'], 'instrument_content_sha256': instrument['meta']['content_sha256'],
                  'record_kind': 'instrument_test', 'complete': True, 'session_id': 'baseline-fixture', 'site': 'tampere', 'seed': 1, 'settings': {},
                  'route': {'technology': 'wpt', 'privateRoute': True, 'combTarget': 'current_condition_option'}, 'answers': answers, 'choices': []}
        with tempfile.TemporaryDirectory(dir=ROOT, prefix='.guard-test-analysis-') as temp:
            temp = Path(temp)
            source = temp / 'session.json'
            source.write_text(json.dumps(record))
            report = module.prepare([source], temp / 'out', include_tests=True)
            self.assertEqual(report['model_complete_cases']['wpt'], 1)
            with (temp / 'out/candidate_construct_scores.csv').open(encoding='utf-8-sig') as f:
                row = next(csv.DictReader(f))
            self.assertEqual(row['E-W-BI'], '4.0')
            self.assertEqual(row['E-W-BI__n'], '3')
            self.assertEqual(row['E-W-BI__post'], '')

    def test_missing_codes_are_not_scored_and_test_records_are_excluded_by_default(self):
        instrument = json.loads((ROOT / 'public/v2/survey.json').read_text())
        record = {'schema_version': instrument['meta']['schema_version'], 'instrument_version': instrument['meta']['version'], 'instrument_content_sha256': instrument['meta']['content_sha256'],
                  'record_kind': 'instrument_test', 'session_id': 'test-one', 'site': 'tampere', 'seed': 1, 'settings': {},
                  'route': {'technology': 'wpt', 'privateRoute': True, 'combTarget': 'current_condition_option'},
                  'answers': {'E-W-USE-01': 5, 'E-W-USE-02': 98, 'E-W-USE-03': 4},
                  'response_status': {'E-W-USE-01': 'answered', 'E-W-USE-02': 'cannot_judge', 'E-W-USE-03': 'answered'},
                  'choices': [], 'timing': {}, 'local_comments': {'x': 'must not enter analysis'}}
        with tempfile.TemporaryDirectory(dir=ROOT, prefix='.guard-test-analysis-') as temp:
            temp = Path(temp)
            source = temp / 'session.json'
            source.write_text(json.dumps(record))
            excluded = module.prepare([source], temp / 'excluded')
            self.assertEqual(excluded['records'], 0)
            self.assertEqual(excluded['excluded']['instrument_test'], 1)
            included = module.prepare([source], temp / 'included', include_tests=True)
            self.assertEqual(included['records'], 1)
            with (temp / 'included/candidate_construct_scores.csv').open(encoding='utf-8-sig') as f:
                row = next(csv.DictReader(f))
            self.assertEqual(row['E-W-USE'], '')
            self.assertEqual(row['E-W-USE__n'], '2')
            self.assertEqual(included['model_complete_cases']['wpt'], 0)
            for filename in (temp / 'included').glob('*'):
                self.assertNotIn('must not enter analysis', filename.read_text(encoding='utf-8-sig'))
            record['test_purpose'] = 'deployment_check'
            source.write_text(json.dumps(record))
            probe = module.prepare([source], temp / 'probe', include_tests=True)
            self.assertEqual(probe['records'], 0)
            self.assertEqual(probe['excluded']['deployment_check'], 1)

    def test_versions_and_synthetic_provenance_are_guarded(self):
        instrument = json.loads((ROOT / 'public/v2/survey.json').read_text())
        with tempfile.TemporaryDirectory(dir=ROOT, prefix='.guard-test-analysis-') as temp:
            source = Path(temp) / 'bad.json'
            source.write_text(json.dumps({'schema_version': 'old', 'answers': {}}))
            with self.assertRaises(ValueError):
                module.prepare([source], Path(temp) / 'out')
            source.write_text(json.dumps({'schema_version': instrument['meta']['schema_version'], 'instrument_version': instrument['meta']['version'], 'instrument_content_sha256': instrument['meta']['content_sha256'], 'record_kind': 'synthetic', 'answers': {}}))
            with self.assertRaisesRegex(ValueError, 'provenance'):
                module.prepare([source], Path(temp) / 'out', include_synthetic=True)


if __name__ == '__main__':
    unittest.main()
