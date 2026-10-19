# NEED-001 independent release-gate QA

## Scope and identity

- Candidate branch: `codex/pm/need-001-release`
- Exact candidate SHA: `feab4a2e3d93961204d32b40972b48856d8098b0`
- Candidate worktree: `E:/dev/TaCP/.worktrees/pm-need-001-release`
- QA worktree: `C:/Users/Администратор/.codex/worktrees/need-001-release-qa/TaCP`
- Checked NEED-001 composition: admin shell, users with email, catalog trash/restore, portfolio statistics, user guide and four current screenshots.
- Period/status filtering is outside the accepted NEED-001 scope.

## Result

**PASS for the NEED-001 product scenario on the exact candidate SHA.** No product defect was found. Closing NEED-001 still requires the release gates from `docs/USER_NEEDS.md`: merge this verified composition to `main`, green CI on the final SHA, remote SHA verification, and an annotated GitHub tag pointing to that same `main` commit.

## Evidence

| Area | Check | Result |
|---|---|---|
| Users and roles | Real API smoke: admin bootstrap/login/list/register, email validation and uniqueness, email update/preservation, login rename, JWT continuity, anonymous/engineer/manager denial, unknown user, concurrency, rollback and delete/login denial | PASS, 42/42; artifact `E:/dev/TaCP/.worktrees/qa-artifacts/admin006-42125c2676479a0d` |
| Catalog trash | Real PostgreSQL/API fixture: role matrix, delete/restore 204, full snapshot, tombstone removal, repeat, 404/409, concurrency, forced rollback and cleanup | PASS, 56/56; evidence `C:/Users/836D~1/AppData/Local/Temp/tkp-qa-admin002-12654db69c1440b497e91262a837d903` |
| Browser admin shell | Chrome at `http://127.0.0.1:4179`: admin navigation exposes Users, Catalog, Statistics and Time tracking; current Users table and add/edit controls render | PASS |
| Browser catalog | Active view renders 97 items and all expected filters/actions; Trash view renders the documented columns and empty state. Mutation was covered by the real API fixture above | PASS |
| Browser statistics | Created two local projects from NКУ and ASU templates. Statistics reports 2 projects, 2 directions, 12 manufacturers and aggregates every project line, including ASU rows | PASS |
| Snapshot-price regression | `npm.cmd test -- --run src/admin/components/StatisticsPage.test.ts src/admin/components/CatalogPage.sync006.test.ts src/store.sync006.test.ts` (only the Statistics file exists in this release composition) | PASS, 1 file / 3 tests |

## Screenshot and guide review

The four 1440×1000 images under `docs/images/admin-guide/` match the current routes, navigation, labels, tables and actions:

- `01-admin-shell.png`: Users overview and three-role presentation.
- `02-users.png`: add-user dialog includes Email, full name, password and role.
- `03-catalog-trash.png`: trash counters, search, audit columns and restore action match the implemented view.
- `04-statistics.png`: summary cards, direction chart, manufacturer table and CSV actions match the implemented statistics view.

The screenshots contain deterministic demonstration data and a historical capture date/count, while the live check used the current date and 97 catalog items. These data differences do not change the documented workflow or controls.

## Environment limitations and harness notes

- The first API smoke attempt inside the restricted sandbox stopped before assertions because PostgreSQL could not create a restricted Windows token (`pg_ctl`, error 87). Running the same approved QA harness outside the sandbox passed 42/42. This is an environment limitation, not a product defect.
- The first temporary PostgreSQL start command for the restore probe had an incorrectly quoted port argument and stopped before the application started. The invocation was corrected; the complete probe then passed 56/56 and removed its disposable database.
- Native account creation/deletion was not repeated through the browser because the same operations were already exercised against the real API and database fixtures. Browser coverage was used for rendering, navigation and portfolio aggregation.

## Retest and handoff

Retest is required only if the candidate SHA or release composition changes. Verify the final `main` SHA and CI/tag evidence before changing NEED-001 from `partial` to `closed`.
