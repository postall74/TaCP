# RATE-001 — independent PostgreSQL/HTTP QA

## Candidate

- Backend candidate: `2cfa5632cf5cdb5c387fe3090ab540b4152e04f6`.
- Exact base: `7b426d10d1dda76ffe811bec4a4021b2aceb90a6`.
- Contract: `rates-persistence-v1`, ADR-009.
- QA checkout: `C:/Users/Администратор/.codex/worktrees/qa-rate-001/TaCP`, detached candidate SHA.
- Result: **PASS**.

## Runtime evidence

The QA harness created a disposable PostgreSQL 18 cluster on loopback with
three isolated databases and generated test-only credentials. No existing
database, user credential, or secret was read or modified.

Final run: **16/16 checks passed**.

- Fresh tenant A returned the contract defaults: Design 1800, Production 1800,
  Software 2200, Smr 1800, Pnr 1800.
- Admin PUT accepted the complete decimal fixture, including fractional,
  negative, and zero values, and returned the same five-property DTO.
- After stopping and starting a new API process against tenant A, GET returned
  the last successful PUT unchanged.
- Fresh tenant B still returned defaults, then accepted its different fixture.
- Subsequent independent API processes confirmed A retained only A values and B
  retained only B values.
- Legacy path was reproduced with existing application tables but without
  `__EFMigrationsHistory` and `rate_cards`. Startup recorded the initial
  baseline, applied `PersistTenantRates`, seeded defaults, and preserved all
  pre-existing users (the expected second bootstrap admin was the sole addition).
- Every API process authenticated through the normal login endpoint; GET/PUT
  were exercised over HTTP rather than by direct DbContext calls.

Final disposable evidence directory:
`C:/Users/Администратор/.codex/worktrees/qa-rate-001/TaCP/.worktrees/rate001-4e38234627d3`.
The PostgreSQL cluster and API processes were stopped after the run.

## Automated suite

- `dotnet test backend/TkpApi.Tests/TkpApi.Tests.csproj --no-restore`: **PASS**,
  101/101 tests.
- The first sandboxed test attempt could not write an MSBuild cache under
  `obj` (`UnauthorizedAccessException`); the approved run outside the sandbox
  passed. This was an environment limitation, not a product failure.
- `python qa/rate001_persistence_smoke.py`: **PASS**, 16/16 checks.

## Migration and rollback review

- Up creates singleton `rate_cards`, constrains `Id = 1`, uses unconstrained
  PostgreSQL `numeric`, and seeds the accepted defaults.
- Down drops only `rate_cards`.
- The handoff correctly states that volatile rates from the old process must be
  exported before upgrade and restored through authorized PUT; they cannot be
  inferred from the legacy database.
- Existing GET/PUT routes, DTO, `Staff`/`AdminOnly` policies, and calculation
  code were not changed.

## QA-owned files

- `qa/rate001_persistence_smoke.py`
- `qa/RATE-001.md`

Production code, PM documentation, and roadmap were not edited. Git
add/commit/push were not performed.
