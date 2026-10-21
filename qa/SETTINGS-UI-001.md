# SETTINGS-UI-001 — independent QA

## Candidate and result

- PM integration SHA: `b6ceb7fccdeb9f54f74b8f099d71c00b24112e45`.
- Base SHA: `7b426d10d1dda76ffe811bec4a4021b2aceb90a6`.
- Production diff: `src/App.tsx`, `src/store.ts` only (65 insertions, 22 deletions).
- QA checkout: `E:/dev/TaCP/.worktrees/qa-settings-ui-001`, detached exact SHA.
- Result: **PASS**, including exact 1024/1440 responsive smoke.

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

## Exact responsive viewport retest

The remaining responsive criterion was repeated independently with the IAB
viewport capability and every effective size was read back from
`window.innerWidth` rather than inferred from the requested override.

- Effective `1024×768`: light and dark themes PASS. Eight company inputs were
  read-only, Save/Reset counts were zero, and Close remained enabled/reachable.
  The modal stayed horizontally inside the viewport (`left≈171`, `right≈843`).
  Its taller content uses the existing overlay `overflow-y:auto`, so the footer
  is reachable without content being cut off.
- Effective `1440×900`: light and dark themes PASS. Eight read-only inputs,
  zero Save/Reset controls, visible Close button, and the complete modal/footer
  fit in the viewport without horizontal or vertical clipping.
- The effective widths were obtained with calibrated IAB overrides and then
  verified directly: override 1096 produced `innerWidth=1024`; override 1541
  produced `innerWidth=1440`. These override numbers were not accepted without
  the direct measurements.
- The viewport override was reset after the checks.

## QA-owned file

- `src/store.settings-ui-001.test.ts`
- `qa/SETTINGS-UI-001.md`

Production code, PM documentation, and roadmap were not edited. Git
add/commit/push were not performed.
