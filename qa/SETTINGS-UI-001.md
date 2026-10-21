# SETTINGS-UI-001 — independent QA

## Candidate and result

- PM integration SHA: `392dbc6113605b6626b5b4ebbe2cc6ef45dbf5ec`.
- Base SHA: `7b426d10d1dda76ffe811bec4a4021b2aceb90a6`.
- Production diff: `src/App.tsx`, `src/store.ts` only (65 insertions, 22 deletions).
- QA checkout: `E:/dev/TaCP/.worktrees/qa-settings-ui-001`, detached exact SHA.
- Functional result: **PASS**. Exact 1024/1440 responsive smoke has an environment limitation described below.

## Browser checks

- Created and logged in as a local `engineer` user.
- The company details modal displayed all eight fields: company name, tagline,
  phone, email, address, requisites, manager, executor.
- All eight fields exposed `aria-readonly=true`; there were no Save or Reset
  controls. The modal displayed the role explanation and only Close remained.
- Repeated the engineer check in dark and light themes. In both themes the
  modal remained readable and the same eight read-only controls/no Save/no
  Reset state was preserved.
- Logged in as the seeded local admin: Save and Reset were present; no company
  field was read-only.
- Created and logged in as a local manager: Save and Reset were present; no
  company field was read-only.

## Store regression checks

Added `src/store.settings-ui-001.test.ts` with the following checks:

- a direct engineer call changing company keys returns `false`, leaves the
  settings object unchanged, and adds an error toast containing the Engineer
  denial reason;
- manager and admin company mutations return `true` and change state;
- local mode (`user=null`) can save and reset to `DEFAULT_SETTINGS`;
- engineer remains able to change the non-company `apiBaseUrl` field.

Targeted result: **12/12 PASS** across the new test and `roles.test.ts`.

## Commands

- `npm.cmd test -- --run src/store.settings-ui-001.test.ts src/utils/roles.test.ts` — PASS, 2 files / 12 tests.
- `npm.cmd run typecheck` — PASS.
- `npm.cmd run build` — PASS, 2013 modules. Existing circular chunk warning only.
- `git diff --check -- src/store.settings-ui-001.test.ts` — PASS.

The first sandboxed Vitest start failed with `spawn EPERM` from esbuild; the
approved run outside the sandbox passed. This is an environment limitation.

## Responsive-width limitation

The connected Chrome provider advertises a viewport override capability, but
both `set({width:1024,height:768})` and a newly created tab continued to report
`window.innerWidth === 1920` (new tab `1920×1024`). Therefore exact 1024 and
1440 viewport evidence could not be produced in this environment, and this
report does not claim those two exact widths as executed. At the available
1920 width there was no clipping in either theme. No browser access barrier was
bypassed.

## QA-owned file

- `src/store.settings-ui-001.test.ts`
- `qa/SETTINGS-UI-001.md`

Production code, PM documentation, and roadmap were not edited. Git
add/commit/push were not performed.
