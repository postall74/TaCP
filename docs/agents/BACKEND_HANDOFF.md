# Backend continuity

- Thread: `01a0ca37-66ff-7f62-9c84-d47738886e31`.
- Reference main: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Completed feature and independent QA: `CATALOG-001` target
  `bda9f59b605184b39afea888395688411dd01557`, branch
  `codex/backend/catalog-001-existing-put`; one-line `Program.cs` fix, 100 tests,
  Release build and 42 author HTTP assertions passed. Independent QA PASS:
  `c6d6ceba98a0436631137d1b244cba83bf9e6c6f`, 90 HTTP assertions.
- Completed read-only auth audit: frontend type mismatch confirmed without a
  current runtime failure; queued as Frontend `AUTH-TYPES-001`. Evidence:
  `C:/Users/Администратор/AppData/Local/Temp/tkp-auth-contract-audit/`.
- Current assignment: implement accepted `PROJECT-001 / project-segments-v1`
  from main `1edff933`, limited to project handlers in `Program.cs` and
  backend-owned tests. Preserve DTO/schema/roles/status behavior and full project
  replacement semantics.
- Confirmed PROJECT-001 evidence:
  `C:/Users/Администратор/AppData/Local/Temp/tkp-projects-audit/`; persisted
  segment is missing from GET and repeat PUT fails with PostgreSQL 23505, while
  the no-segments control passes.
- Confirmed trigger on main `1edff933`: valid existing-item PUT returns 500 with
  duplicate EF tracking and leaves old values; unknown-id PUT succeeds. Evidence
  is under `C:/Users/Администратор/AppData/Local/Temp/tkp-catalog001-confirm/`.
- Runtime blocker: RATE-001/OPS-001 still needs Docker Engine + Compose with
  PostgreSQL 17 for restart/recreate, named-volume persistence and two-tenant
  isolation. Local PostgreSQL 18 is insufficient and must not be repurposed.
- Required PROJECT-001 handoff: worktree/base SHA, paths, full diff/stat,
  backend tests, Release build, isolated PostgreSQL HTTP segment lifecycle,
  authorization/status regression, compatibility and rollback. Backend does
  not commit or push.
- Next safe step after context loss: read accepted `PROJECT-001`, inspect its
  worktree and continue only unmet criteria; stop services before handoff.
