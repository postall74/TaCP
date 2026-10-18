# DOOR-004 A4 Print/PDF — independent QA

## Candidate and result

- Contract: `cabinet-door-geometry-v1`, DOOR-004 acceptance for browser Print/PDF A4.
- Exact production SHA: `fe1d2c09cd5dd45f949b5aa700c0c8321c9fe520`.
- QA branch: `codex/qa/door-004-005-pdf`.
- Result: **FAIL** because the required `x=0, y=0` marker overlaps printable text.

## Reproduction

1. Serve the repository with Vite and open `qa/door_004_pdf_fixture.html`.
2. The fixture renders the production `DocumentTab` with a two-door cabinet and
   elements at normalized coordinates 0/0, 500/500, and 1000/1000.
3. Generate the browser PDF with headless Chrome 155:
   `chrome.exe --headless=new --no-pdf-header-footer --virtual-time-budget=5000 --print-to-pdf=<output> http://127.0.0.1:4175/qa/door_004_pdf_fixture.html`.
4. Render page 2 to PNG or open the generated PDF.

## Defect

- Severity: **P2 / medium**.
- Owner: **Frontend** (`src/components/DoorDimensionDrawing.tsx`).
- Expected: the marker for an element at the placement origin (`x=0, y=0`) and
  the label `Полотно 1 · 800 × 1800` are both legible and do not overlap.
- Actual: marker number `1` is drawn over the leaf heading. The rendered page
  visually reads `Пол1отно 1`; PDF text extraction also returns `Пол1отно 1`.
- Scope: reproducible in the real Chromium A4 PDF, page 2. The center and
  bottom-right markers do not overlap the table or page edge.
- Suggested retest: repeat the same fixture after moving/clamping callouts away
  from leaf labels and page/leaf boundaries; inspect x/y 0, 500, and 1000 for
  both leaves in the generated PDF.

## Passed PDF checks

- A real file was produced: 258,993 bytes, Chromium/Skia PDF 1.4.
- Exactly 2 pages; both are A4 `594.96 × 841.92 pt`, rotation 0.
- The dimension sheet starts on page 2 and does not split across pages.
- Required rows and computed coordinates are present:
  `50,0 / 100,0`, `400,0 / 900,0`, `1550,0 / 1700,0`.
- Both leaves, both placement rectangles, the full-label table, and the mandatory
  “не для сверления и изготовления” notice are present.
- Dimension-page text bounds are left 25.50, top 35.25, right 564.00,
  bottom 588.00 pt. Remaining margins are 25.50, 35.25, 30.96, and 253.92 pt;
  no page-edge clipping was detected.

## Evidence and commands

- PDF: `C:/Users/Администратор/.codex/worktrees/qa-artifacts/door-004-pdf-fe1d2c09/door-004-a4.pdf`.
- Rendered pages: the sibling `render/page-1.png` and `render/page-2.png`.
- `npm.cmd run typecheck`: PASS with the QA fixture.
- `python qa/door_004_pdf_inspect.py <pdf>`: FAIL on the source SHA by design:
  the regression gate requires readable `Полотно 1` and explicitly rejects
  extracted `Пол1отно 1`. Before that gate it confirms page count, A4 size and
  the isolated dimension sheet; the recorded bounds above come from the same PDF.
- Poppler reports warnings locating optional name-to-Unicode tables through the
  Cyrillic Windows profile path; rendering still succeeds. This is an environment
  warning, not a product defect.

## QA-owned files

- `qa/door_004_pdf_fixture.html`
- `qa/door_004_pdf_fixture.tsx`
- `qa/door_004_pdf_inspect.py`
- `qa/DOOR-004-PDF.md`

Production code, PM documentation, and roadmap were not changed.
