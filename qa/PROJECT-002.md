# PROJECT-002 — independent QA

Verdict: **PASS**

- Base: `1edff933afe9f488f11137ffa9251bae6744c720`
- Target: `5c069431ded1d6bf6c8f600b7837384218dab89d`
- Worktree: `E:\dev\TaCP\.worktrees\qa-project-002`
- Branch: `codex/qa/project-002`

## Scope

Production diff is limited to `backend/TkpApi/Program.cs` and
`backend/TkpApi.Tests/ProjectNumberConflictTests.cs`: 71 insertions and 2
deletions. POST and PUT precheck exact project numbers and narrowly translate
PostgreSQL `23505` on `IX_projects_Number` to the same 409 response.

## Verification

- `dotnet test backend/TkpApi.Tests --configuration Release`: PASS, 104/104.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release --no-restore`:
  PASS, 0 errors. NuGet vulnerability feed was unavailable (`NU1900`); this did
  not affect compilation or tests.
- `pwsh -NoProfile -File qa/PROJECT-002.probe.ps1`: PASS, 31 checks against an
  isolated PostgreSQL 18 database and Release API.

The HTTP/SQL probe verifies:

- exact duplicate POST and PUT return 409 with the stable Russian detail;
- rejected PUT preserves prior scalar fields, cabinets, and items;
- keeping the project's own number and a unique rename return 200;
- a case-variant number remains distinct and returns 201;
- concurrent exact-number POST gives one 201 and one 409 and stores one row;
- concurrent PUT of two projects to one exact number gives one 200 and one 409;
  the losing project retains its original number, scalar fields, cabinet, and
  item;
- a different `23505` (`PK_projects`, duplicate id with a unique number) remains
  500 and leaves the existing project unchanged;
- admin, manager, and engineer retain Staff access; anonymous POST and PUT are
  401.

## Defects and limits

No defects found in PROJECT-002 scope. The external NuGet vulnerability audit
was unavailable; backend tests and Release compilation completed successfully.
PROJECT-002 improves core-v1 stability and does not independently close a
`NEED-*`.

## Hygiene

The probe stops the API and PostgreSQL in `finally`, clears generated runtime
credentials, and removes its temporary database directory. No commit or push
was made.
