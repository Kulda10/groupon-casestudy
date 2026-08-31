# Testing — how to know the prototype actually works

The submission is assessed on *"whether your claims survive us checking them against the data."*
The panel will type into this thing. Testing is not a final polish step here; it is the gate
between the engine and the UI.

## Gate 1 — the engine, in node, before any UI exists

Do not write a line of interface until all four of these pass. Write them as a script
(`test_engine.js`) that prints pass/fail counts and exits non-zero on any failure.

1. **Inventory cap.** For every one of the 1,322 distinct `(market, city, query)` keys in the log, the proposed engine's result count is ≤ that city's total deal count. **Expected violations: 0.**
2. **Determinism.** Run 100 randomly chosen queries twice each, in a fresh engine instance. Compare the full serialised output, not just the count. **Expected differences: 0.**
3. **Provenance.** Every returned card's `deal_id` exists in `deals.csv`, and its market and city match the selected market and city. **Expected orphans: 0.**
4. **Total coverage.** Feed all 8,997 raw queries through the engine. Every one returns one of the eight response types — never an exception, never an empty state that is not `NOT UNDERSTOOD`. **Expected crashes: 0.**

## Gate 2 — the ten acceptance queries

From `PRD.md` §10. Type each one into the built UI, in the stated city, and check the response line
and the count against the table. These numbers came from the CSVs, so a mismatch means the engine
is wrong, not the table.

| # | Query | City | Expected | Count |
|---|---|---|---|---|
| 1 | `back massage` | Manchester | `MATCHED` | 5 |
| 2 | `manicure` | Kraków | `THIN` | 1 (+1 adjacent) |
| 3 | `helicopter tour` | London | `NOT SOLD HERE` + `ABOVE CEILING` | 0, with alternatives |
| 4 | `deep tissue massage` | Berlin | `TRANSLATED` (EN→DE) | 9 |
| 5 | `susshi` | London | `CORRECTED` → `CATEGORY ONLY` | 13 dining |
| 6 | `sushi` | Madrid | `CATEGORY ONLY` | 7 dining |
| 7 | `brunch` | London | `MATCHED`, capped | 13 |
| 8 | `gym` | Manchester | `MATCHED`, never above 19 | 3 |
| 9 | `paintball` | London, twice | identical both runs | identical |
| 10 | `asdfgh` | any | `NOT UNDERSTOOD` + 5 categories | 0 + 5 |

## Gate 3 — adversarial typing

The panel will not stick to the chips. Try, at minimum: an empty submit; a single character; a
200-character string; `<script>alert(1)</script>`; a query in a fifth language in the wrong market
(`masaż` in Madrid); a real deal title pasted verbatim (`Wellness-Massage Paket`); a query with
emoji; leading and trailing whitespace; `MASSAGE` in caps; `Ma  ssage` with a double space. None
may crash, hang, or produce an unlabelled empty screen.

## Gate 4 — the page it lives in

The prototype is inserted into `../blueprint2.html`. After every edit to that file:

1. **Count the `<style>` blocks — there must be exactly 2** — and the `<script>` blocks (3, plus whatever the prototype adds). A previous session silently dropped 14 KB of CSS here and produced no console errors at all.
2. **Screenshot the whole page at 1440px and read it**, top to bottom. Not a console check — the failure mode that hurt before was purely visual.
3. **Screenshot at 390px.** No horizontal scroll anywhere. The two panes stack, Proposed first.
4. Check that nothing outside `#partb` moved: the nav, the Part A tabs, the charts, the findings table, the modal.
5. Verify no class or id the prototype introduces already exists elsewhere in the file.

## Gate 5 — the ten states, seen

Screenshot every one of the ten archetypes in the finished prototype and look at each image. A
state that has never been rendered has never been tested. Compare archetype 3 and 4 against
`mockups/archetype03.png` and `mockups/archetype04.png`.

## What "done" means

All four engine invariants green, ten acceptance queries correct, ten states screenshotted and
reviewed, the page unchanged outside `#partb`, and no console errors at any of the ten states.
Anything less is not done, however good it looks.
