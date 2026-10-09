# PROJECT-005 — independent QA

Verdict: **PASS**

- Base: `1edff933afe9f488f11137ffa9251bae6744c720`
- Target: `ff0085d047532492c7f6b0e9e540b139494fd2a0`
- Worktree: `E:\dev\TaCP\.worktrees\qa-project-005`
- Branch: `codex/qa/project-005`

## Scope

Production diff is limited to `backend/TkpApi/Program.cs` and
`backend/TkpApi.Tests/CabinetBatchConflictTests.cs`: 67 insertions and 1
deletion. The endpoint rejects exact duplicate cabinet IDs before tracking and
narrowly translates only PostgreSQL `23505` on `PK_project_cabinets` to 409.

## Verification

- `dotnet test backend/TkpApi.Tests --configuration Release`: PASS, 104/104.
- `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release --no-restore`:
  PASS, 0 errors. NuGet vulnerability feed was unavailable (`NU1900`); this did
  not affect compilation or tests.
- `pwsh -NoProfile -File qa/PROJECT-005.probe.ps1`: PASS, 32 checks against an
  isolated PostgreSQL 18 database and Release API.

The HTTP/SQL probe verifies:

- existing and intra-batch duplicate cabinet IDs return the same 409 and write
  no new cabinets or items; the target project's timestamp remains unchanged;
- a valid two-cabinet batch with nested items returns 200 and persists the full
  graph; an empty batch remains 200 without changes;
- IDs are case-sensitive (`valid-a` and `VALID-A` both persist);
- missing project returns 404; anonymous access is 401; engineer, manager, and
  admin each retain Staff access for valid batches;
- concurrent requests using one exact cabinet ID return one 200 and one 409 and
  persist exactly one cabinet;
- a nested item primary-key conflict and an unrelated nested segment primary-key
  conflict both remain 500 and roll back their containing cabinets.

## Defects and limits

No defects found in PROJECT-005 scope. The external NuGet vulnerability audit
was unavailable; backend tests and Release compilation completed successfully.
PROJECT-005 improves core-v1 stability and does not close a `NEED-*`.

## Hygiene

The probe stops the API and PostgreSQL in `finally`, clears generated runtime
credentials, and removes its temporary database directory. No commit or push
was made.
