# CATALOG-001 — independent QA

- Worktree: `C:/Users/Администратор/.codex/worktrees/qa-catalog-001/TaCP`
- Branch: `codex/qa/catalog-001`
- Base: `1edff933afe9f488f11137ffa9251bae6744c720`
- Target: `bda9f59b605184b39afea888395688411dd01557`
- Production diff: `backend/TkpApi/Program.cs`, `+1/-1`
- Result: **PASS**

## Targeted HTTP/PostgreSQL matrix

An isolated PostgreSQL 18 cluster and database were created under the system
temporary directory. The Release API used random per-run JWT/bootstrap
credentials and localhost-only ports. The matrix completed 90 checks:

- anonymous PUT and GET return 401 and create no row;
- engineer, manager and admin can update an existing item;
- repeated existing-id PUT remains idempotent and keeps one row;
- the URL id overrides a different body id;
- GET persists `sku`, `name`, `brand`, `category`, `direction`, `unit`,
  `purchase`, `ratedCurrent` and `attrs`, including zero numeric values;
- engineer can upsert an unknown id and all fields survive GET;
- manager DELETE creates a tombstone, engineer PUT resurrects it and removes
  the tombstone;
- case-insensitive duplicate SKU on unknown-id PUT returns 409 and creates no
  row;
- GET is available to engineer, manager and admin through the Staff policy.

Full assertion output: `qa/CATALOG-001.probe.txt`.

## Role checks

| Command | Result |
|---|---|
| isolated HTTP/PostgreSQL probe | PASS, 90 checks |
| `dotnet test backend/TkpApi.Tests` | PASS, 100/100, 0 skipped |
| `dotnet build backend/TkpApi/TkpApi.csproj --configuration Release` | PASS, 0 warnings / 0 errors |

The test suite and Release build were completed before the first integration
probe and were not repeated because subsequent changes affected only the
temporary QA harness, not tests or production code.

## Harness incident and environment

The initial probe hung before `createdb`: `pg_ctl start | Out-Null` kept the
PowerShell pipeline open through PostgreSQL's inherited stdout. PostgreSQL had
started, while the API and assertions had not. The stale process was gone and
ports were free when the interrupted run was investigated. The leftover temp
cluster was verified and removed.

The QA harness was corrected to run every external process with a bounded
`WaitForExit`, redirect stdout/stderr to files, apply HTTP timeouts and always
stop the API/PostgreSQL before deleting the verified temp directory. A separate
argument-grouping error for `pg_ctl -o` then failed immediately before API
startup and was corrected. Neither event was a product failure. The final
matrix completed normally. The environment-specific temporary harness was
removed after producing the evidence file; it is not suitable as a portable
repository regression test.

## Hygiene

The disposable database, PostgreSQL cluster and generated credentials were
removed. API port 55103 and PostgreSQL port 55487 have no listeners. No secret,
production code, PM documentation or tracked build output was added by QA.
Git add/commit/push were not run.
