# Version A on an existing survey Worker

The public partner demo is linked from the README. It keeps test answers and comments in the reviewer's browser tab and makes no database submissions.

Version A was deployed to the existing, separate survey Worker through the owner's configured local project on 2 November 2026. Owner-provided dashboard and Wrangler checks confirmed the production database binding, expected database UUID, EU jurisdiction, all 13 submission columns and both indexes from the original application's initial migration. The guarded installer reported a frontend backup and verified that the backend and configuration files were unchanged. Deployment output retained disabled collection and free text, the development environment and existing Turnstile variables.

A complete browser walkthrough on the deployed Worker passed: backgrounds, practice and four scored transport cards, ordinary-journey COM-B, the explicit already-used-mode clarification, a non-driver household plug-in charging route with multiple locations, saved comments, paused comment-entry timing, the completion summary and both feedback download controls. This is a functional review, not a completion-time estimate. The original application was left unchanged. No database migration, respondent-record copy or collection activation was part of this release; a comparison with every table in the current original live database remains outside the verified scope.

## Keep resource identities local

The public repository contains no account-specific Cloudflare configuration. The update tools read the expected target identities and protected original Worker names from a private JSON file that you keep outside version control. Use the deployment records of the already configured survey project to fill it in. Do not derive it by blindly copying an arbitrary project's configuration.

Create `.private/cloudflare-target.json` locally with this structure, replacing each placeholder:

```json
{
  "target": {
    "worker": "YOUR_NEW_SURVEY_WORKER",
    "database": "YOUR_SEPARATE_SURVEY_DATABASE",
    "id": "YOUR_EXISTING_SURVEY_D1_UUID",
    "binding": "YOUR_SURVEY_D1_BINDING"
  },
  "protected_workers": ["YOUR_ORIGINAL_APPLICATION_WORKER"]
}
```

The `.private/` directory is ignored by Git. The tools reject placeholders, a target listed as protected, and any destination whose Worker, database name, UUID or binding differs from the private file. No credential or API token belongs in this file.

## Use the already configured local project

Download or clone this frontend repository into a **separate directory** from the configured Cloudflare project. From the frontend repository, run these commands with the actual path to that configured project:

```bash
node scripts/audit-d1.mjs /path/to/configured-survey-project .private/cloudflare-target.json
node scripts/install-version-a.mjs /path/to/configured-survey-project .private/cloudflare-target.json
node scripts/install-version-a.mjs /path/to/configured-survey-project .private/cloudflare-target.json --apply
```

The destination must already contain the working Worker backend, installed Wrangler dependency and established deployment scripts. The installer supports an existing `wrangler.jsonc` or `wrangler.json`, the default environment and a `public/` asset directory. It stops for other configurations rather than guessing.

The first installation command is a dry-run. `--apply` backs up overwritten assets under `.review-backups/` in the destination, copies only the five reviewed frontend assets, checks their bytes, and verifies that the other project files were unchanged. Extra assets are retained. It does not install dependencies or contact Cloudflare.

Existing Worker code, security headers, API handlers, human-verification rules, collection controls, secrets, Wrangler configuration, migrations and deployment scripts stay in the configured project. The new frontend does not invoke the submission API, regardless of the backend's collection setting. No database migration is needed for this walkthrough.

Before deployment, compare the configured survey project's bindings and settings with its live Cloudflare deployment. Confirm that the survey binding points to its separate database and that existing security and collection settings will be retained. Then review the frontend diff and use the configured project's established checks and guarded deployment command. This frontend repository provides no generic Wrangler deployment configuration or replacement backend.

## Read-only D1 inspection

The audit uses the configured project's installed Wrangler and current login, following Cloudflare's [D1 command reference](https://developers.cloudflare.com/d1/wrangler-commands/). It requests `d1 info --json`, checks the target UUID against the private identity file, and runs only `PRAGMA table_info`, `index_list` and `index_info`.

It checks the 13 submission columns, types, defaults and constraints, plus two indexes against the original application's committed initial migration. It never selects participant records or runs a migration, import, export or DDL command. The output contains metadata and schema only; keep an account-specific report local.

The report distinguishes the local Wrangler binding from the live deployed Worker binding. It does not assert that the live Worker configuration has been verified. Any jurisdiction field is reported exactly as returned by Cloudflare; a location hint is not treated as proof of a jurisdiction restriction.

To compare with the current **original database schema**, provide its actual D1 database name from the original Worker's live binding:

```bash
node scripts/audit-d1.mjs /path/to/configured-survey-project .private/cloudflare-target.json --source-db ACTUAL_SOURCE_DATABASE_NAME
```

This compares the `submissions` table and its indexes, refuses a source with the same UUID, and leaves both databases unchanged. Other application tables are outside the comparison. A match to the committed initial migration alone is not proof that all later live schema changes have been copied.

## Return to the earlier frontend

The backup's `manifest.json` identifies which files existed before installation. Restore those backed-up files into the survey project's `public/` directory, review the diff, and use the established deployment process. No database rollback is involved.
