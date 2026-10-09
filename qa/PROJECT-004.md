# PROJECT-004 — independent QA

Verdict: **PASS**

- Base: `1edff933afe9f488f11137ffa9251bae6744c720`
- Target: `04dbec401180f031e3d635393d1ca8b372f6894a`
- Worktree: `E:\dev\TaCP\.worktrees\qa-project-004`
- Branch: `codex/qa/project-004`

## Scope

Production diff is limited to `backend/TkpApi/Program.cs` and
`backend/TkpApi.Tests/CabinetItemQuantityTests.cs`: 38 insertions. After cabinet
and equipment lookup, the item endpoint rejects quantities not greater than
zero with a stable 400 problem response.

## Verification

- `dotnet test backend/TkpApi.Tests --configuration Release`: PASS, 106/106.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release --no-restore`:
  PASS, 0 errors. NuGet vulnerability feed was unavailable (`NU1900`); this did
  not affect compilation or tests.
- `pwsh -NoProfile -File qa/PROJECT-004.probe.ps1`: PASS, 31 checks against an
  isolated PostgreSQL 18 database and Release API.

The HTTP/SQL probe verifies:

- zero and negative quantities for new and existing items return 400 with the
  expected detail and leave database rows unchanged;
- a new quantity of 0.125 and increments of 0.375 and 1.250 return 200 and
  persist the exact final value 1.750;
- missing cabinet and equipment identifiers return 404 even when quantity is
  invalid;
- engineer, manager, and admin each successfully perform a positive add or
  increment; anonymous access is 401;
- malformed decimal binding remains 400;
- a positive quantity outside the database `numeric(12,3)` range remains 500,
  rolls back its new item, and does not change the existing item.

## Defects and limits

No defects found in PROJECT-004 scope. The external NuGet vulnerability audit
was unavailable; backend tests and Release compilation completed successfully.
PROJECT-004 improves core-v1 stability and does not close a `NEED-*`.

## Hygiene

The probe stops the API and PostgreSQL in `finally`, clears generated runtime
credentials, and removes its temporary database directory. No commit or push
was made.
