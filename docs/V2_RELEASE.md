# PULSE v2 instrument test release

## Compact presentation update, 6 November 2026

New tests use shared response grids, up to six statements at a time, with construct subheadings and separate uncertainty/non-response options. Related end questions, journey descriptors and household questions share pages. Count responses keep their codes and are displayed as numeric inputs. Original wording, scales, question IDs, routing, theoretical membership and all DCE card values remain unchanged.

`layout_version=compact-2026-11-06` distinguishes this presentation from the original pages. Old sessions and submissions remain supported. The instrument version and content fingerprint do not change because `survey.json` is byte-identical. The optional layout marker is stored inside `payload_json`; no new D1 schema is required. Python/MATLAB preparation treats layout as metadata, rather than a behavioural feature.

The partner routing guide is `/v2/routing.html` and [ROUTING.md](ROUTING.md). With the existing test table and indexes, installation skips the SQL import. Deployment readiness waits for the new layout to propagate before writing its labelled verification record. The established Worker/database targets and collection controls are preserved.

`/v2/?dce=both-drivers` is a separate partner-review option. Current drivers who are privately eligible for both services can compare both DCEs, each behind its own scenario gate. The assigned service goes first and retains the sole household acceptance battery; after the additional comparison, follow-up explicitly returns to that service. Maximum burden is 16 scored choices plus three practices, compared with the ordinary 10 plus two. Non-car respondents keep transport and meaningful household/future-service choices, with public views otherwise. The review flag is stored and exported as metadata, and old/default responses remain unchanged.

Browser visual QA for this update remains pending because managed preview infrastructure is unavailable. Automated routing, scale, keyboard-control markup, timing, layout compatibility and old-record checks are available in the test suite.

This release implements an A0.8-derived A0.9 test draft for respondent-flow review. It is not a frozen fieldwork instrument or an optimised design. GitHub source and Cloudflare publication are separate: the original repository kept the working backend/configuration in the owner's configured local project.

## Flow and scope

Test consent/site → mobility/background → transport practice and four scored choices where evaluable → one real-journey COM-B block → actual charging context → neutral concepts → one assigned WPT/V2G acceptance module or public route → one assigned technology practice and six scored choices where evaluable → benefit priorities/reflection → demographics.

Defaults omit general purchasing rows, purpose-frequency matrices, convenience/planning, prosumer probes, values, ranking, the additional conditions checklist and information treatment. Core mobility has 22 candidate ratings; WPT acceptance has 12 and V2G has 21. Operator trust adds three. Other SRF ratings remain separate diagnostics.

Optional review modules use `?modules=values,information,ranking,prosumer,convenience,conditions`, with any subset. Information is assigned 1:1 after DCE or context skip, before post-outcomes and shared benefit labels. It concerns later outcomes, not preceding choices.

`?technology=wpt` or `?technology=v2g` records a review override where eligible. Without an override, dual-eligible private participants are assigned 1:1; singly eligible people get that service; public respondents get a separate reference concept. Overrides are not random allocation.

W09/V09 preserve A0.8 candidate numbers with new scenario versions. W09 makes same-location fallback and a replacement €10 charge explicit. V09 defines no-dispatch availability payment and uses varying arrival charge rather than the non-binding 80%-arrival example. These hypothetical test terms require partner/technical confirmation; they do not promise services. Field designs and money-trade-off interpretation still need regeneration/piloting.

The public synopsis precedes support and fairness. Funding/siting remain unspecified and uncertainty is valid. V2H remains a documented Oxfordshire workshop/later-study gap. Mobility capability is not relabelled as charging capability.

## Guarded installation

Clone this release separately from the configured Cloudflare project. The installer needs no dependency installation. Use the established separate survey D1 UUID:

```bash
node scripts/install-v2.mjs /path/to/configured/pulse-conjoint-survey --database-id EXISTING_SURVEY_D1_UUID --collect-tests
node scripts/install-v2.mjs /path/to/configured/pulse-conjoint-survey --database-id EXISTING_SURVEY_D1_UUID --collect-tests --apply --deploy
```

The first command is a local dry-run. Alternatively use `--identity /path/to/cloudflare-target.json` instead of `--database-id`.

The procedure accepts only Worker `pulse-conjoint-survey`, database `pulse_conjoint_survey`, binding `DB` and the supplied existing UUID. It rejects unexpected resources, named environments and symlinks. Before installation it verifies remote database identity/EU jurisdiction and records the existing submissions schema without selecting participant rows.

Overwritten files are backed up. The original Worker source is byte-identical; an adapter handles only `/api/v2/*` and delegates other requests. Configuration/bindings remain intact except the new entrypoint, necessary v2 API routing and `SURVEY_V2_COLLECTION_ENABLED`. Legacy `COLLECTION_ENABLED`, free-text rules, environment and Turnstile variables are preserved.

Only `survey_v2_test_submissions` and its indexes are added when absent; an initialized test database skips the import. Legacy submissions are not copied, migrated or modified. With the established development test sitekey, a separate v2-only official dummy validation secret is added if absent; existing secrets are retained. The configured project checks run, followed by deployment with `--keep-vars`.

After publication the installer checks live v2 configuration, saves one labelled `deployment_check` record via the actual API and reads back only its receipt metadata from the target D1. The analysis pipeline always excludes this probe. This confirms API/D1 persistence; browser flow still needs review. Other Workers/account rules are outside the operation.

## Collection and export

Answers are submitted only after test consent and the final Submit action. Server checks include Turnstile, origin, body type/size, versions, coded answers, route, displayed offers, timing, idempotency and a daily cap of 2,000 tests. There is no public response-list/export endpoint. Comments remain local and are omitted from API/D1 records.

The UI reports `/api/v2/config` readiness and shows a saved receipt. Local downloads remain available if saving fails. Legacy `/api/config` may still report collection disabled because its control is unchanged.

`/v1/` preserves the earlier walkthrough. Existing extra assets, including a prior `/review/`, are retained. To roll back, restore the backed-up Wrangler config and root index, inspect and deploy through the configured project. No destructive database rollback is needed.

## Verification limits

Automated checks cover route masks, conditional wording, mixed powertrains, future/non-car/fleet roles, one technology, context skips, stable resume/assignment, stale-answer cleanup, missing statuses, payload/verification failures, actual SQLite schema/inserts, duplicate requests, quotas and install guards. Python tests cover origin/version exclusions and missing-score handling.

Managed browser preview infrastructure was unavailable, so visual browser QA is unverified. GitHub publication does not imply Cloudflare publication. Live state requires the guarded deployment result. MATLAB execution was unavailable. Test data are not population evidence.
