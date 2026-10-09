# PROJECT-003 — independent QA

Verdict: **PASS**

- Base: `1edff933afe9f488f11137ffa9251bae6744c720`
- Target: `87b2c1c11d168bec2abd1be3640ecb4054431a09`
- Worktree: `E:\dev\TaCP\.worktrees\qa-project-003`
- Branch: `codex/qa/project-003`

## Scope

Production diff is limited to `backend/TkpApi/Program.cs` and
`backend/TkpApi.Tests/RightsTests.cs`: 24 insertions and 1 deletion. Project
creation now applies the existing `PermForStatus`/`Forbid` matrix before adding
the entity graph to the database context.

## Verification

- `dotnet test backend/TkpApi.Tests --configuration Release`: PASS, 115/115.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release --no-restore`:
  PASS, 0 errors. NuGet vulnerability feed was unavailable (`NU1900`); this did
  not affect compilation or tests.
- `pwsh -NoProfile -File qa/PROJECT-003.probe.ps1`: PASS, 31 checks against an
  isolated PostgreSQL 18 database and Release API.

The HTTP/SQL probe verifies:

- engineer `won` and `lost` return 403 with the same existing Russian detail;
- rejected graphs leave zero matching rows in `projects`, `project_cabinets`,
  and `project_items`;
- engineer `draft`, `calc`, and `sent` return 201;
- manager and admin return 201 for all five statuses;
- anonymous creation is 401 and malformed JSON is 400;
- an unrelated `23505` on the project primary key remains 500 and leaves the
  existing graph unchanged.

## Defects and limits

No defects found in PROJECT-003 scope. The external NuGet vulnerability audit
was unavailable; backend tests and Release compilation completed successfully.
PROJECT-003 is an authorization correction and does not close a `NEED-*`.

## Hygiene

The probe stops the API and PostgreSQL in `finally`, clears generated runtime
credentials, and removes its temporary database directory. No commit or push
was made.
