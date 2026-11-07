# V3 Option C questionnaire review

`/v3/` opens the core profile. Add `?profile=extended` for additional Option C questions or `?profile=extended&dce=both-drivers` for the driver comparison. The latter can show both technology DCEs when a personal driver can evaluate both and accepts both offer scenarios. The acceptance battery still refers to the primary assigned technology. The instrument uses fictional profiles for flow review.

| Respondent or condition | What v3 shows |
|---|---|
| Everyone who consents and confirms adulthood and a site | Travel background, nine everyday-travel ratings, practical barriers, relevant service or public questions, and demographics |
| Evaluable hypothetical trip and two or more transport modes | The transport practice and four scored choices |
| An actual recurring journey and identified current mode | Two current-mode habit items. The target selection and observed mode use are kept separate from habit. |
| A named journey option under present conditions, an option already used, or an alternative with explicit improvements | Two target-specific intention items, with the target status retained. A journey without a workable option still has the common barriers. |
| Recent personal ICE/HEV driving and no confirmed personal plug-in driving | Prospective EV openness and charging opportunity. Expanded review adds charging and range concerns. |
| Household plug-in access and knowledge of how it is charged | The current charging details and a hands-on question. Only people reporting hands-on charging see the new confidence and routine-fit items. |
| Relevant household or realistic future role and an evaluable private charging service | The assigned WPT or V2G acceptance and SRF block. Each DCE has a separate context gate. Reported charging and contract roles are separate fields. |
| No evaluable private service | Local public support, benefits and effects for a described service, including fairness and accessibility. This route has no household contract choices. |

V3 groups the new ratings into the compact layout and records the instrument hash, layout version, answers, eligible question and task IDs, presented offers, route diagnostics, and timing. Skips are recorded as `not_shown`. Screen comments can be downloaded and are excluded from collection. The adapted ratings are candidates for cognitive review. The DCE profiles carry over from v2 for a comparable walkthrough.

## Publish to the configured conjoint Worker

Use Node 22.13 or later and the existing Mac deployment project with its installed Wrangler and authenticated Cloudflare session. Clone this release into a separate directory. A dry run lists the files that would change.

```bash
node scripts/install-v3.mjs /path/to/configured/pulse-conjoint-survey \
  --database-id EXISTING_SURVEY_D1_UUID --collect-tests
```

Run the same command with `--apply --deploy` to publish and turn on v3 instrument-test collection. The installer verifies the existing EU D1 identity, compares the local v2 assets and settings with the live release, backs up changes, and dry-runs Wrangler. It adds the v3 table and indexes with a small schema-only query, then deploys the same survey Worker. The new Worker entry delegates existing paths to the installed v2 entry. Keep the installer source separate from the Cloudflare project.

When the existing development Turnstile key is configured, the installer reuses its validation secret and submits one fictional `deployment_check` for this instrument hash. It reads back only the receipt metadata, and verifies the live v2 config again. `published: true` with `collection_enabled: true`, `storage_ready: true` and a `receipt` confirms that path. A retry for the same release reuses the receipt. With a real Turnstile widget, complete one fictional test in the browser to obtain a receipt. The dummy Turnstile widget is for flow testing and does not screen bots. The default v3 daily cap is 100 records.

If Cloudflare authentication has expired, refresh Wrangler's login on the configured Mac project. If the installer reports a v2 mismatch, use the exact last-deployed local checkout. V3 release inputs are reproducible with `node scripts/build-v3.mjs .v3-build`. For a no-collection local walkthrough, serve `.v3-build/public` and open `/v3/`.

## Check a submitted round

Run this from the configured project after saving a fictional session. This metadata query filters out the deployment check.

```bash
./node_modules/.bin/wrangler d1 execute pulse_conjoint_survey --remote --json --command "
SELECT id AS receipt_id, received_at, site, technology, respondent_route,
       ROUND(active_ms / 60000.0, 1) AS active_minutes,
       json_extract(payload_json, '$.settings.option_c_extended') AS expanded_review
FROM survey_v3_test_submissions
WHERE json_extract(payload_json, '$.test_purpose') = 'flow_review'
ORDER BY received_at DESC LIMIT 5;"
```

The v2 preparation pipeline targets the v2 schema. V3 records use `pulse-response-v3.0` and should be kept separate when preparing analysis inputs.
