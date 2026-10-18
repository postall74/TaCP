# DOOR-004/005 — independent integration QA

## Candidate

- Contract: `cabinet-door-geometry-v1` (ADR-015).
- Integration branch supplied by PM: `codex/pm/sync-001-010-integration`.
- Exact tested SHA: `8da4392d0e7ad472f55a9f2555840e514c00d25b`.
- QA branch: `codex/qa/door-004-005-integration`.
- Worktree: `C:/Users/Администратор/.codex/worktrees/door-004-005-integration-qa/TaCP`.

## Automated results

- `npm.cmd test -- src/utils/doorGeometry.test.ts src/store.doorGeometry.test.ts`: 2 files, 9/9 PASS.
  The tests cover the 0/500/1000 coordinate formula, one-decimal display,
  one/two-leaf boundaries, overlap/placement/layout mismatch, detached cloning,
  confirmed geometry before an immediate version snapshot, rejected writes, and
  explicit geometry clearing when restoring a legacy snapshot.
- `npm.cmd test`: 32 files, 186/186 PASS.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run build`: PASS. Vite reports the pre-existing circular vendor chunk
  warning; the build completes.
- `dotnet build backend/TkpApi/TkpApi.csproj -c Release`: PASS, 0 warnings/errors.
- `python qa/door_005_postgres_smoke.py`: 58/58 PASS against disposable
  PostgreSQL 18 and the integration SHA. Logs:
  `C:/Users/Администратор/.codex/worktrees/qa-artifacts/door-005-2e3507a9134d4e4b`.

The PostgreSQL/API probe covers clean and up/down/up migration, nullable JSONB,
legacy rows, exact fixture roundtrip, one/two-door bounds, 15 malformed geometry
variants with atomic 400, layout mismatch, DOOR-001 regression, old full-PUT
omission, version snapshot and DELETE, full-project atomicity, persisted future
schema 409, 401/403/404, and legacy project/snapshot behavior.

## Browser smoke

Performed in the Codex in-app Chromium browser at the available 1200 × 675
viewport in local-storage mode:

1. Created a demo project and confirmed the preflight names the cabinet and
   reports missing `doorLayout` when geometry exists alone.
2. Created a one-door layout and entered 800 × 1800 mm geometry with a
   700 × 1600 mm placement at 50/100 mm. The size badge, reload, version save,
   restore, and subsequent reload preserved geometry.
3. The dimension sheet appeared only after layout and geometry agreed. It showed
   outside-front axes, the entered dimensions, full element label, millimetre
   coordinates, and the mandatory “not for drilling/manufacturing” note.
4. Switched layout and geometry to two doors (origins 0 and 800 mm). The editor
   rejected the intermediate 2-layout/1-geometry mismatch, then accepted the
   completed two-leaf geometry. The dimension sheet rendered both non-overlapping
   leaves and both placement rectangles without clipping.
5. Light and dark application themes keep the printable sheet white and readable.
6. `Печать / PDF` opened the browser print workflow; it was dismissed with Escape
   after the smoke. The in-app browser does not expose native print-preview pages
   or PDF output to QA automation, so page count and the generated PDF file were
   not independently inspected here.

No DOOR-004/005 product defect was found.

## Environment limitations

- The in-app browser has no viewport override capability, so the author-reported
  1024/1440 checks were not independently repeated; this run used 1200 × 675.
- Native print preview/PDF output is outside the browser automation surface. The
  on-screen A4 sheet and print invocation passed, but exported PDF pagination is
  not independently proven by this run.
- Vite HMR attempted its configured WebSocket port 3000, which was occupied by
  another local process. This produced only development-console WebSocket errors;
  reload and application behavior remained functional. React Router also emitted
  its existing v7 future-flag warnings.

## QA-owned files for PM snapshot

- `src/utils/doorGeometry.test.ts`
- `src/store.doorGeometry.test.ts`
- `qa/door_005_postgres_smoke.py`
- `qa/DOOR-004-005-INTEGRATION.md`

Production code, PM documentation, and the roadmap were not changed.
