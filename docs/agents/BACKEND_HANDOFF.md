# Backend continuity

- Thread: 01a0ca37-66ff-7f62-9c84-d47738886e31.
- Reference main: 1edff933afe9f488f11137ffa9251bae6744c720.
- Published VERSION-001 target f0a59e5c567dbeebb6d612d708c599d4b2409844; independent QA is queued.
- Published PROJECT-001 target 0ba8cc487d72a4bf45c50abad288e8c754b80696; independent QA is active.
- Published CATALOG-001 target bda9f59b605184b39afea888395688411dd01557; independent QA PASS c6d6ceba98a0436631137d1b244cba83bf9e6c6f.
- Current assignment: CATALOG-002 / catalog-write-v2 from exact CATALOG-001 target bda9f59b. Existing/new PUT must reject another item's exact or case-variant SKU with one 409 and unchanged data while preserving own SKU, unique rename/upsert, Staff/tombstone behavior and the tracking fix.
- Race scope: catch PostgreSQL 23505 only for IX_equipment_catalog_Sku. Do not catch unrelated DB failures. Full concurrent case-insensitive uniqueness is outside this slice and requires a separate database or locking decision.
- Evidence: C:/Users/Администратор/AppData/Local/Temp/tkp-catalog-conflict-audit/. Exact conflict produced 500/23505 with rollback; case variant produced 200 and duplicate logical SKU; unknown duplicate already produced 409.
- Required handoff: worktree/branch/base SHA, paths, full diff/stat, compatibility and rollback, backend tests, Release build, isolated PostgreSQL exact/case/own/unique/unknown/repeat/auth matrix, stopped processes. Backend does not commit or push.
- Runtime blocker: RATE-001/OPS-001 still needs Docker Engine + Compose with PostgreSQL 17.
- Next step after context loss: read CATALOG-002 in ROADMAP, inspect its worktree, and continue only unmet acceptance criteria.
