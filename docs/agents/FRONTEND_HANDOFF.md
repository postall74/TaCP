# Frontend continuity

- Thread: `01a0ca37-b2cf-7461-b3d0-008ff133cd0f`.
- Reference main: `1edff933afe9f488f11137ffa9251bae6744c720`.
- PM specification branch: `codex/pm/admin-005-statistics`.
- Current assignment: `WIZ-UI-001`, active in
  `E:/dev/TaCP/.worktrees/wiz-ui-001`, branch
  `codex/frontend/wiz-ui-001-work-layout`, base `1edff933`. The current
  uncommitted diff changes only `src/components/Wizard.tsx` to a shared grid;
  npm clean install is complete and manual 1024 px validation is in progress.
  Continue from this worktree after interruption; do not recreate the diff.
- Required evidence: worktree, base SHA, changed paths, full diff/stat,
  typecheck/tests/build, manual light/dark checks at 1024 and 1440 px, stopped
  servers. Frontend does not commit or push.
- Queued next task: `AUTH-TYPES-001` after WIZ-UI-001 and its handoff. Align
  `src/api/client.ts` response types with existing auth-v2 fixture; no wire or
  backend changes. Do not start it in the WIZ worktree.
- Completed references: SEC-003 implementation `aff32110`, QA `e93828d8`, in
  main `1edff933`; ADMIN-005 implementation `6c60705b`, QA `676e2f1c`.
- Next safe step after context loss: read `AGENTS.md`, role docs and
  `WIZ-UI-001`, inspect current worktree, continue only its remaining criteria.
