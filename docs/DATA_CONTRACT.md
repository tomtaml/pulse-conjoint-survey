# Survey data and behavioural twin preparation

This release prepares instrument-test data. Finnish synthetic population generation follows the owner's flow review; no population, fitted behavioural twin or representative archetypes are produced now.

## Versions and provenance

Instrument: `pulse-v2-A0.9-test-2026-11-04`. Schema: `pulse-response-v2.0`.

Records contain random session ID, versions, purpose, selected test site, configuration, closed answers/statuses, derived route, displayed choice profiles/order, comprehension attempts and active timing. The server rebuilds derived fields. Comments never enter the API payload or stored record.

Browser/API records are `record_kind=instrument_test` and may contain fictional answers. `test_purpose=deployment_check` identifies the installer probe; preparation always excludes it. Normal tests use `flow_review`. Test site is not verified residence.

Future workflows reserve `study_response` and `synthetic` origins. Synthetic data require generation provenance and a separate import flag. Generation must later document sources, method, seed, calibration targets and validation. Agent narratives do not establish population weights.

| Site ID | Country | Display |
| --- | --- | --- |
| tampere | FI | Tampere |
| trikala | GR | Trikala |
| oxfordshire | GB | Oxfordshire |

Prototype prices use EUR. UK field levels need an agreed localisation rule.

## Private D1 export

```bash
node scripts/export-v2-tests.mjs /path/to/configured/survey-project EXISTING_SURVEY_D1_UUID /private/path/v2-tests.json
```

This uses the configured project's authenticated Wrangler and selects only the v2 test table. It refuses public-asset output. Keep data outside source control. A respondent can instead download their own session; local comments are ignored by preparation.

## Python preparation

Python 3 standard library only:

```bash
python3 analysis/python/prepare_survey.py --input /private/path/v2-tests.json --output analysis/output/review --include-instrument-tests
```

Tests are excluded without that explicit flag; synthetic data separately need `--include-synthetic`. Deployment probes are always excluded. Duplicate IDs with conflicting answers are rejected and versions cannot silently pool.

Outputs include participants, item-level answers/statuses, wide coded answers, provisional complete-item construct means, alternative-level choices, complete-case model inputs and an analysis manifest with hashes/exclusions. No model is fitted automatically. Structural skips and missing codes are not neutral scores. Multi-selects remain coded lists; practice choices remain identifiable.

Candidate means require every indicator to have a valid scale answer; valid-item counts are also exported. This is a reproducible test-preparation rule, not psychometric validation. Separate inputs cover mobility, private WPT and private V2G. Guiding values remain available when enabled. Check site/language/role and current/maintenance/conditional referents before grouping. No overall readiness sum is created.

## MATLAB scaffold

Add `analysis/matlab` to the MATLAB path. Inspect features without fitting:

```matlab
result = pulse_v2_pipeline("analysis/output/review", "wpt", 0, true);
```

The fourth argument explicitly permits non-study data for software testing. Optional exploratory clustering requires Statistics and Machine Learning Toolbox:

```matlab
result = pulse_v2_pipeline("analysis/output/review", "wpt", 3, true);
```

Mobility also requires an explicit target, such as `"current_condition_option"`. The function does not automatically pool current and conditional intentions. Clustering standardises non-constant candidate features, fixes the random seed and records centroids/assignments as test clusters. The MATLAB code has not been executed in this environment.

## Stages after flow review

1. Freeze the instrument/analytic units; calibrate measurement and choice designs.
2. Establish official site population/mobility targets and a statistical synthetic baseline, beginning with Tampere/Finland.
3. If useful, compare agentic generation against that baseline using the same constraints/provenance. Keep generated and observed records distinct.
4. Evaluate cluster stability, subgroup inclusion and external validity before constructing behavioural-twin archetypes for the three sites.
