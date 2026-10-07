# NORM-QA-001 — complete integration QA

- Worktree: `C:/Users/Администратор/.codex/worktrees/qa-norm-complete/TaCP`
- Branch: `codex/qa/norm-qa-001-complete`
- Base / integration target: `1edff933afe9f488f11137ffa9251bae6744c720`
- Frontend source SHA: `962c68765db3bd3103f5aef4c61659480a297b0c`
- Backend source SHA: `a38a468846fbf9f6ceb0517e44b48c81acf59d98`
- Result: **PASS within NORM-QA-001 scope; NEED-005 and related NEED items remain partial**

## Added QA evidence

- `qa/fixtures/norm-qa-v1.json` records negative fixtures for missing input and
  a wrong-scope UZIP conclusion.
- `src/components/NormativeClaims.test.ts` verifies that missing input cannot be
  presented as a normative green state, UZIP input type does not prove
  sufficiency, and removed/yearless normative claims stay out of rendered UI
  sources.
- Existing `src/components/CabinetDraft.test.ts` continues to protect the
  preliminary sketch, conditional dimensions and engineering-review wording.

The production diff preserves calculations, totals, cabinet dimensions and the
public compatibility field. Backend returns a preliminary assessment through
`ConnectionStandard`; the field explicitly says that normative compliance was
not checked. No DTO, migration or public HTTP contract changed.

## Commands and results

| Command | Result |
|---|---|
| `npm ci` | PASS; 182 packages installed |
| `npm test -- src/components/NormativeClaims.test.ts src/components/CabinetDraft.test.ts` | PASS; 2 files / 4 tests |
| `npm run typecheck` | PASS |
| `npm test` | PASS; 10 files / 88 tests |
| `npm run build` | PASS; 2011 modules |

The backend slice was not repeated: PM already recorded 7 targeted tests and a
Release build on `a38a4688`, and no backend or production files changed in this
QA worktree. Frontend-real-backend smoke is not needed for these wording and
pure-rule assertions because the public DTO is unchanged. The browser smoke in
`qa/NORM-QA-001-frontend-962c687.md` already covers empty input, wrong-scope
UZIP, preserved document calculations and preliminary sketch in both themes on
the same frontend production SHA; only QA files were added afterward.

## Defects and limitations

No product defect was found. Vite still reports the known non-blocking circular
chunk warning `vendor-other -> vendor-core -> vendor-other`. `npm ci` reports
three moderate and two high dependency advisories plus pending install-script
review for esbuild; dependencies were not changed in this QA task.

This result proves the limited first-wave presentation and regression scope. It
does not establish normative compliance, completeness of source data, or
acceptance of NEED-005 and related NEED work.

## Scope and hygiene

Only the two QA-owned files listed above and this report/journal entry are
changed. No production code, PM docs, roadmap, secrets, tracked build output,
commit, push or running service was introduced.
