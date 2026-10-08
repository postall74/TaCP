# Backend continuity

- Thread: `01a0ca37-66ff-7f62-9c84-d47738886e31`.
- Reference main: `1edff933afe9f488f11137ffa9251bae6744c720`.
- Published PROJECT-001 target: `0ba8cc487d72a4bf45c50abad288e8c754b80696`,
  branch `codex/backend/project-001-segments`; independent QA is queued.
- Completed CATALOG-001 target `bda9f59b605184b39afea888395688411dd01557`;
  independent QA PASS `c6d6ceba98a0436631137d1b244cba83bf9e6c6f`.
- Current assignment: `VERSION-001 / project-version-v1`, accepted after
  read-only audit. New snapshots use camelCase; legacy PascalCase snapshots
  must normalize on read without rewriting stored JSON or arbitrary keys.
- Confirmed VERSION-001 trigger: actual backend snapshot contains PascalCase
  nested cabinets/items; current frontend restore receives missing `id/items`
  and `c.items.length` throws. Evidence:
  `C:/Users/Администратор/AppData/Local/Temp/tkp-projects-audit/result.json`
  and `C:/Users/Администратор/AppData/Local/Temp/tkp-version-audit/`.
- Scope: backend project-version handlers and, if needed, a backend-owned
  serializer. Do not change Models, permissions, calculations, price history,
  frontend, migrations, or arbitrary user JSON.
- Required handoff: worktree/branch/base SHA, paths, full diff/stat, compatibility
  notes, backend tests, Release build, isolated PostgreSQL HTTP checks for new
  camelCase and legacy PascalCase restore, authorization/status regression.
  Backend does not commit or push.
- Runtime blocker: RATE-001/OPS-001 still needs Docker Engine + Compose with
  PostgreSQL 17. Local PostgreSQL 18 is insufficient.
- Next step after context loss: read VERSION-001 in ROADMAP, inspect the assigned
  worktree, and continue only unmet acceptance criteria.
