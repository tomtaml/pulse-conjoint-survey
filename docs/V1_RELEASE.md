# PULSE conjoint survey

PULSE Version A citizen-survey walkthrough for wording, routing and timing review before fieldwork programming. The questionnaire text, numerical transport DCE profiles and study-specific test fixtures are included following explicit public-release authorisation on 2 November 2026.

The sequence follows the draft:

1. Mobility background, journey purposes and one ordinary journey.
2. A hypothetical 2030 transport experiment: one practice and four scored choices.
3. Ordinary-journey COM-B, intention and observed behaviour.
4. Parking opportunity and routed household BEV/PHEV charging experience.

The frontend has sequential Back/Continue navigation, screen-specific comments, active-time measurement and local review exports. Test answers remain in per-tab browser storage. No response API, analytics or D1 submission is implemented in this frontend.

## Preview

The shareable Version A partner demo is deployed at:

https://pulse-conjoint-survey.tom-tamlander.workers.dev/

An additional hosted preview is available at:

https://pulse-version-a-walkthrough.moderntern.chatgpt.site/

The existing survey Worker was updated through the owner's configured local deployment project on 2 November 2026. The original `tomtaml/pulseapp` project was left unchanged.

## Run locally

Node 20+ is sufficient for checks. Python 3 serves the static frontend locally. No package installation or build is required. The included `public/survey.json` supplies the Version A draft. Tests cover the software components and the study-specific routes and numerical profiles.

```bash
npm run check
npm run dev
```

Open http://localhost:8000/ after starting the local server.

## Content and routing

`public/survey.json` supplies 56 question records: 55 from the supplied Version A draft and one clarification that explicitly confirms an already-used alternative mode. It includes 22 COM-B/intention ratings, one transport practice and four scored transport tasks. All 60 numerical profile values were checked against the draft and previous P09/D15 review data. The application provides these routing behaviours:

- Non-car users and non-drivers remain in the survey. Transport choices depend on trip-specific feasibility.
- Purpose-specific mode questions appear only for purposes with reported journeys.
- One actual ordinary journey is recorded before the DCE. The candidate alternative mode is chosen after the DCE.
- Habit ratings use the actual usual mode. Other COM-B ratings use the confirmed candidate alternative.
- No recurring journey skips dependent COM-B; no confirmed alternative skips its dependent ratings without treating missing applicability as low motivation.
- Household BEV/PHEV access and charging knowledge determine actual-charging questions. A single reported charging location is derived as the main one with a flag; multiple locations prompt an explicit selection.
- Changing a journey or mode removes answers with an obsolete referent. Changing the transport offer set removes choices from the old set.

The application is a prototype for draft review. Production instrument selection, participant information, ethics activation and experimental-design approval remain separate decisions.

## Timing and comments

Timing begins on Start walkthrough and counts active visible-tab time, including revisits. Hidden tabs, manual pauses and comment editing pause respondent timing. Reloading requires Resume so time away is excluded.

At the end, Download comments and timing produces a TXT file to share with the research team. Test-session JSON additionally contains canonical answers, route/status information, actual displayed profiles and permutations, practice flags and durations. Unassigned DCE tasks are 96; unfinished assigned tasks are null. This is usability timing, not a validated completion-time estimate.

## Cloudflare integration

This repository contains the reviewed frontend and study content. The existing Worker source, guarded deployment scripts and D1 bindings remain in the already configured local Cloudflare project. They are not reconstructed or replaced by this import.

The guarded frontend installer and read-only D1 schema audit are documented in [CLOUDFLARE-UPDATE.md](CLOUDFLARE-UPDATE.md). They validate the separate survey Worker and database identities, preserve the existing backend and configuration, and make no migrations or deployments. Deployment to the existing survey Worker is complete. Owner-provided dashboard and Wrangler checks verified its production database binding, expected database UUID, EU jurisdiction and submission schema against the original application's initial migration. Deployment output retained disabled collection and free text, the development environment and the existing Turnstile variables. A complete browser walkthrough on the deployed Worker passed, including all five transport cards, COM-B, the non-driver household charging route, comments, timing and both feedback download controls. These checks do not assert that every table or later schema change in the original live database has been copied.

## Licence

Software is licensed under MIT; see `LICENSE`. Research-instrument content is documented separately in `CONTENT-LICENSING.md`; third-party materials retain their applicable terms. Participant responses, credentials, local Cloudflare state and test exports do not belong in the public repository.
