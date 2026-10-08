# QA continuity

- Thread: `01a0ca39-0d43-7082-8714-a198f97acc92`.
- Current state: independently validating `CATALOG-001` target
  `bda9f59b605184b39afea888395688411dd01557` in a separate QA worktree. The
  next queued handoff is `WIZ-UI-001` after Frontend provides its exact SHA.
- Next expected handoffs: `WIZ-UI-001` from Frontend and `CATALOG-001` from
  Backend. For CATALOG-001 verify existing/repeat/unknown-id PUT, GET persistence,
  401/Staff authorization and tombstone regression on an isolated database.
  For WIZ-UI-001 verify only affected work rows, calculations and persistence
  in both themes at 1024 and 1440 px. Run role checks once per final QA diff.
- Accepted references: SEC-003 implementation `aff32110`, QA `e93828d8`, main
  `1edff933`; ADMIN-005 implementation `6c60705b`, QA `676e2f1c`; admin guide
  and screenshots `b9b0af0e`.
- Required handoff to PM: base/target ancestry, paths, targeted scenarios,
  commands and results, defects/environment limits, hygiene and stopped
  processes. QA owns tests but does not commit or push.
- Next safe step after context loss: wait for an exact target SHA; inspect old
  code only after a failure or confirmed link to the reported behavior.
