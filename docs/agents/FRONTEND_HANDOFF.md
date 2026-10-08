# Frontend continuity

- Thread: 01a0ca37-b2cf-7461-b3d0-008ff133cd0f.
- Reference main: 1edff933afe9f488f11137ffa9251bae6744c720.
- PM specification branch: codex/pm/admin-005-statistics.
- Published WIZ-UI-001 implementation 55364a556880fbb2b22eeec89ca579f05238a7ff; independent QA PASS fa69a714eaf17117af478481792b332f3bae2ce9.
- Published AUTH-TYPES-001 implementation 28d5683323f530f4fbbc18189c87947c82136c17; QA reports checks passed and PM is recovering evidence from its worktree.
- Current assignment: WIZ-UI-002 / measurements-select-readability from exact main 1edff933, separate branch codex/frontend/wiz-ui-002-measurement-selects.
- Confirmed trigger: WB-MAP3E, WB-MAP12H and the long panel ammeter label are truncated in closed selects at 1024/1440 in both themes; no form overflow or overlap.
- Scope: only measurement-step JSX/local classes in Wizard.tsx. Do not change shared SelectRow, options, selection logic, counts, DTO or persistence.
- Required handoff: worktree/base/files/full diff, light/dark screenshots at 1024/1440, zero and ordinary states, 12 CT result, transitions/add-to-project, typecheck/tests/build and stopped server. Frontend does not commit or push.
- Next step after context loss: read WIZ-UI-002 in ROADMAP and continue only unmet acceptance criteria in its worktree.
