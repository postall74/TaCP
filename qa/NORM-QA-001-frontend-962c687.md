# NORM-QA-001 — integrated frontend slice

- Worktree: `C:/Users/Администратор/.codex/worktrees/qa-norm-ui-001/TaCP`
- Integration SHA: `962c68765db3bd3103f5aef4c61659480a297b0c`
- Backend parent: `a38a468846fbf9f6ceb0517e44b48c81acf59d98`
- Result: **PASS**

## Automated checks

- TypeScript typecheck: PASS.
- Vitest: PASS, 8 suites / 81 tests.
- Production Vite build: PASS, 2011 modules.
- New regression: `src/components/CabinetDraft.test.ts` verifies that a
  cabinet with missing dimensions is labelled as a preliminary sketch, exposes
  conditional default dimensions, requires engineering review, and does not
  claim a GOST general view.
- Diff check confirms no changes to `src/types.ts`, `src/api/client.ts`, or
  `src/utils/**`; calculations and public frontend DTO remain unchanged.
- Targeted search found none of the removed UI claims: `Конфликтов не найдено`,
  `Общий вид шкафа (ГОСТ)`, `Чертежи шкафов (ГОСТ)`, `Подбор по СП 256`,
  `достаточно типа 2`, or `проверка сечения по ГОСТ`.

## Browser checks

Production build was exercised in local mode in light and dark themes.

- Empty project: neutral `нет замечаний по доступным правилам` plus
  `Соответствие нормативным требованиям не подтверждено`; no green success
  claim despite missing input.
- Wizard: opens locally, is labelled preliminary, requires engineering review.
  The UZIP step preserves wrong-scope uncertainty and states that input type
  alone does not prove sufficient protection.
- Document: demo project renders with the existing calculations and totals.
- Sketch: renamed to preliminary sketch; unknown dimensions/IP are explicitly
  described as conditional defaults and require engineering review.
- Existing warning/error state remains visible for a demo project with
  incompatible ratings.

## Limitations

The initial bundled-pnpm invocation attempted an automatic dependency install
and failed because build scripts were blocked/raced. Final gates used the
already installed project dependencies directly and passed. The known
non-blocking circular chunk warning remains in Vite build.

No production code was edited. Git add/commit/push were not run.
