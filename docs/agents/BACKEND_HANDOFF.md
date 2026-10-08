# Backend continuity

- Thread: `01a0ca37-66ff-7f62-9c84-d47738886e31`.
- Reference main: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Current assignment: implement accepted `CATALOG-001` / `catalog-write-v1` in
  `backend/TkpApi/Program.cs`, preserving DTO, URL id, Staff policy, unknown-id
  upsert and tombstone behavior; no migrations or frontend changes.
- Confirmed trigger on main `1edff933`: valid existing-item PUT returns 500 with
  duplicate EF tracking and leaves old values; unknown-id PUT succeeds. Evidence
  is under `C:/Users/Администратор/AppData/Local/Temp/tkp-catalog001-confirm/`.
- Runtime blocker: RATE-001/OPS-001 still needs Docker Engine + Compose with
  PostgreSQL 17 for restart/recreate, named-volume persistence and two-tenant
  isolation. Local PostgreSQL 18 is insufficient and must not be repurposed.
- Required handoff: worktree/base SHA, paths, full diff/stat, backend tests,
  Release build, isolated HTTP existing/repeat/new-id/401/Staff/tombstone cases,
  compatibility and rollback. Backend does not commit or push.
- Next safe step after context loss: read accepted `CATALOG-001`, inspect its
  worktree and continue only unmet criteria; stop services before handoff.
