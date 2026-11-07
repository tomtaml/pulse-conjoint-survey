# PULSE T1.2 — v3 Option C online-review specification (draft 0.1)

Status: design branch only; **not deployed**. Preserve `/v2/`, `/api/v2/`, the existing v2 D1 table, and the original PULSE Worker. Sources: PULSE D1.1 final; Ruoholahti EV/V2G survey draft; PULSE A0.8; Option C shortlist v0.1; revised two-slide General Assembly presentation.

## Design principles
1. Common mobility core for every consented adult, including non-drivers and people already using sustainable transport.
2. Separate **observed** context/behaviour (not reflective scale items), **candidate psychological ratings**, and **outcomes**.
3. Preserve current transport DCE, WPT and V2G DCE card designs for initial v3 flow comparison. These remain *prototype* choice designs, not fieldwork-optimised designs.
4. Distinguish actual BEV/PHEV charging experience from ICE/HEV anticipated beliefs, and private-service intention from public deployment support.
5. Vehicle ownership, driving, household influence, charging access, and technology evaluability are overlapping flags; no forced mutually exclusive archetype.
6. Keep WPT/V2G assignment one technology by default; allow dual-DCE partner review only when both contexts are meaningful. Preserve allocation probability and skipped-task reasons.
7. Do not add existing TAM/SRF constructs again as COM-B scales. Preserve existing usefulness, ease, attitude, intention, trust, control, reserve/battery concern items.
8. Every item requires stable ID, source/adaptation, scale, eligibility, intended model role, and missing-by-design code. Pilot cognitive understanding before fieldwork.
9. Never mix real pilot, partner test, deployment check, and synthetic records; label data provenance.
10. v3 collection remains OFF until the dedicated server-side validator, consent/Turnstile, EU D1 table, rate controls, and verification checks pass.

## Common mobility candidate core
The Option C shortlist proposes ~11 common ratings and two conditional intention items, **not 11 COM-B latent indicators by default**. Use `M02` knowledge (2), `M03` alternative opportunity (2), `M05` social support (2), `M06` reflective motivation (2), `M07` habit (reuse/retarget), `M08` car dependence (1), and `M09` autonomy (candidate); retain actual mobility, barriers and current journey as observed data. Ensure item language is meaningful to already sustainable non-car respondents. Record current habitual mode alongside habit score. Pilot 'not applicable' and 'cannot judge' rather than forcing midpoint.

## Routed extensions
- ICE/HEV drivers: prospective EV transition openness, anticipated charging availability and range/charging burden. Never phrase as actual charging experience.
- BEV/PHEV users: actual charging frequency/locations and authority; short charging confidence/routine compatibility measures only where existing questions do not cover them. A PHEV owner may not charge routinely.
- Non-driver household EV role: household influence and understanding; do not assume driving, charging skill, or contract authority.
- Non-car without EV role: maintenance/feasibility and public deployment/equity; future/shared service only if credible.
- Mixed households/professional drivers: independent flags; preserve actual household/organisational decision authority.
- WPT: parking/dwell opportunity and usability, but reuse existing WPT ease/usefulness/trust/attitude/intention.
- V2G: connection opportunity and decision authority, reuse existing reserve/battery/control/trust/intention.
- Public: support, accessibility, distributive and procedural fairness, without implying private adoption intention.

## Initial routing gates
Consent/adult/site -> mobility and household context -> transport DCE if evaluable -> common mobility core -> experience-specific extension -> charging context and neutral technology explanation -> WPT/V2G evaluability -> assigned private technology or public route -> technology DCE if scenario feasible -> benefits and demographic close.
Show route-preview and skip-reason log to reviewers. For both-technology review, preserve separate completion and timing for each block.

## PLS-SEM and archetype readiness
- Do not fit the entire common profile as one reflective factor.
- Pre-register candidate constructs vs observed predictors, and separate mobility, WPT and V2G measurement models.
- Check conceptual overlap and discriminant validity of ease, control, routine compatibility, and opportunity; test measurement invariance before comparing groups.
- Compare subgroup sample sizes and power, not just total N.
- For behavioural twin clustering, retain observed mode/vehicle/access/role and estimated DCE preferences alongside model scores; route-skipped indicators remain missing by design.
- H5 (archetypes) is exploratory validation objective, not a standard causal SEM hypothesis; target >=5 only if supported by data.

## Build plan / acceptance gates
1. Export machine-readable v2 question IDs, routes and wording. Build exact old->new crosswalk; flag deletions, duplicates and construct targets.
2. Create `public/v3/` assets, engine, compact matrix layout and reviewer routing diagnostics. Never modify `public/v2/`.
3. Implement and test route cases: ICE, HEV, BEV, PHEV not charging, mixed household, non-car EV household, non-car no EV role, professional driver, no feasible transport alternative, both technologies evaluable.
4. Add a **distinct** `survey_v3_test_submissions` table and `/api/v3/` handler. Validate server-side question eligibility, choices, timings, instrument hash, consent, and Turnstile. Collection disabled by default.
5. Deploy only through guarded installer that verifies Worker name, EU D1 UUID, binding and remote identity; do not alter existing v2 collection controls.
6. Compare v2 vs v3 route length, missingness, comprehension, completion time, and partner comments before enabling wider tests.

## Open decisions
- Exact common mobility 11-item selection and whether automaticity/habit is one item or a multi-item scale.
- Whether 'sustainable transport' needs a site-neutral operational definition or journey-specific alternatives.
- Whether information treatment and values are omitted from v3 default (proposed: yes).
- Public route: how to capture accessibility without assuming EV use.
- Whether WPT/V2G cross-over mode should show both acceptance scales as well as both DCEs (proposed: only explicit partner mode).
- Confirm choice-card attributes, V2G reserve example and payment direction before fieldwork.
