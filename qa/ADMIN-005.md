# ADMIN-005 — independent QA

- Worktree: `C:/Users/Администратор/.codex/worktrees/qa-admin-005/TaCP`
- Branch: `codex/qa/admin-005`
- Base: `1edff933afe9f488f11137ffa9251bae6744c720`
- Target: `6c60705b831d4557eb479c78d94c24e10850c5ce`
- PM criteria source: `051c0d1b` (`docs/ROADMAP.md`, ADMIN-005)
- Result: **PASS for ADMIN-005; NEED-001 remains partial**

## Verified behavior

The production diff is limited to `src/admin/components/StatisticsPage.tsx`.
Manufacturer statistics now use the historical `item.brand` and
`item.purchase` snapshots, including a zero purchase value, independently of a
changed catalog entry. The complete manufacturer collection is counted before
the separately displayed and exported TOP-20 slice.

QA added `src/admin/components/StatisticsPage.test.ts` with deterministic cases:

- historical brand and zero purchase remain unchanged after the catalog brand
  and price change;
- 22 manufacturers produce a card value of 22 while the table and manufacturer
  CSV contain exactly 20 data rows;
- TOP-20 order and purchase totals use line-item snapshots;
- empty projects render all empty states and export empty CSV payloads;
- the real CSV Blob and filename are inspected, rather than only checking the
  presence of an export button.

## Commands and results

| Command | Result |
|---|---|
| `npm ci` | PASS; 182 packages installed |
| `npm test -- src/admin/components/StatisticsPage.test.ts` | PASS; 1 file / 3 tests |
| `npm run typecheck` | PASS |
| `npm test` | PASS; 10 files / 88 tests |
| `npm run build` | PASS; 2011 modules |

The first targeted command used `.test.tsx`; current Vitest includes only
`src/**/*.test.ts`, so it found no files. The test contains no JSX syntax and
was renamed to `.test.ts`; all subsequent checks passed. This is a harness
constraint, not an ADMIN-005 product defect.

## Browser smoke

Local Vite UI was checked as the default administrator in both light and dark
themes. The Statistics page remained readable and showed zero cards, explicit
empty states and the separate `ТОП-20 производителей` section in both themes.
The populated 22-brand and CSV boundary is covered deterministically by the
component test to avoid mutating browser demo data.

## Defects and limitations

No ADMIN-005 product defect was found. Vite retains the known non-blocking
`vendor-other -> vendor-core -> vendor-other` circular chunk warning. `npm ci`
reported three moderate and two high dependency advisories and pending install
script review for esbuild; dependencies were not changed by this task.

ADMIN-005 does not add periods/status filters or close the broader analytics
need. NEED-001 therefore remains `partial`, as required by the PM criteria.

## Scope and hygiene

No API, DTO, backend, migration, rights or production file was edited by QA.
QA changes are limited to the test, this report and the QA journal entry. No
secret or tracked build artifact was added. Git add/commit/push were not run.
The temporary browser tab and Vite server were closed before handoff.
