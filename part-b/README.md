# Build notes — Honest Search (Part B prototype)

Built 2026-08-30 in Claude Code, against `PRD.md`, `FINDINGS_TO_BEHAVIOUR.md` and `TESTING.md`.
Everything below was verified against the CSVs; nothing is copied from the page or from memory.

## What is in this folder

| File | What it is |
|---|---|
| `build_prototype_data.py` | Reads `deals.csv`, `search_log.csv`, `searches_classified.csv` → `prototype_data.json`. Python stdlib only, no pandas. |
| `prototype_data.json` | 159 KB. 568 deals, 20 cities, 20 intents, 1,308 log keys with every individual `results_shown` value. |
| `pb_engine.js` | The engine. Runs in node and in the browser from the same file, so the tests test what ships. |
| `test_engine.js` | TESTING.md gates 1–3. `node v2/part_b_prototype/test_engine.js` — exits non-zero on any failure. |
| `page/pb.css` · `page/pb_markup.html` · `page/pb_ui.js` · `page/pb_partb.html` | The interface. Every class is `pb-`; all JS is one IIFE exposing one global, `window.PB`. The finding→behavior copy lives in `pb_ui.js` as `BEHAVIOUR`, transcribed from `FINDINGS_TO_BEHAVIOUR.md`. |
| `build_page.py` | Splices all of the above into `../blueprint2.html` **in place**, between sentinels, and re-emits `preview.html`. |
| `preview.html` | A standalone harness holding only the prototype, generated from the same files. Test artefact — not part of the submission. |

## Rebuilding

```
python3 v2/part_b_prototype/build_prototype_data.py   # only if the CSVs or the intent map change
node    v2/part_b_prototype/test_engine.js            # gate 1 — must pass before touching the UI
python3 v2/part_b_prototype/build_page.py             # splices into blueprint2.html + preview.html
```

`build_page.py` never rebuilds the page from `../build/*.part`. It edits `blueprint2.html`, keeps a
`.bak`, and **refuses to write** if the `<style>` count leaves 2, if `<div>`/`<section>`/`<script>`
tags stop balancing, or if `#parta`, `#partc`, `#log`, `#setup`, `#ftable` or `#ddpanel` disappear —
the class of failure that silently dropped 14 KB of CSS in an earlier session.

## Test results

122 checks, all green (`node v2/part_b_prototype/test_engine.js`). Gate 1, all four invariants, on
the full data:

- **Catalog cap** — 1,308 distinct `(market, city, query)` keys, **0 violations**.
- **Determinism** — 100 queries × 2 runs, plus a full re-init, **0 differences**.
- **Provenance** — every returned `deal_id` exists in `deals.csv` and sits in the selected city, **0 orphans**.
- **Coverage** — all 8,997 logged queries answered, **0 crashes**, every one carrying one of the eight
  response codes: MATCHED 36.0% · CATEGORY ONLY 30.3% · NOT SOLD HERE 22.4% · THIN 4.1% ·
  CORRECTED 4.1% · TRANSLATED 3.1%. The same figures are computed live in the browser and shown
  under the prototype.

Gate 2 — all ten acceptance queries produce the stated response line and count (one deliberate
deviation, below). Gate 3 — 20 adversarial inputs, none crashes, none produces an unlabeled screen,
nothing typed into the field reaches the DOM unescaped. Gate 5 — all ten states screenshotted at
1440 px and read; the refusal and foreign-language states compared against `mockups/archetype03.png`
and `mockups/archetype04.png`. Mobile checked at 375 px: no horizontal scroll, Proposed first,
Today behind its toggle. In the page: 5 charts, 6 Part A tabs, 6 glossary links, the 15-row findings
table and the nav all still render, no `pb-` class appears outside `#partb`, no console errors.

## Round two — what changed after the first review (2026-08-30)

Five things, all triggered by Ondřej reading the built prototype.

**1. Affinity ordering.** `paintball` in London led with a Guided City Tour, purely because that
deal is rated 4.7. The category fallback itself is defensible — searches the prototype answers with
`CATEGORY ONLY` convert at **10.6% today, against 10.5% for the ones it answers with `MATCHED`**, and
`paintball` alone is 275 searches → 113 clicks → **30 purchases (10.9%)**. Refusing them would throw
away demand that measurably converts. The *ordering* was the bug. Every deal now carries its own
concept (`dealTerms`, a separate question from `titleTerms`), and adjacent results are ranked by a
hand-written affinity map: paintball → karting → escape room → city tour, bowling → escape room
first, crossfit → the unlimited class pass first. It is a pure reordering — asserted in the tests —
and the interface says out loud that the ordering is a judgment, not a measurement.

**2. The nearest-city state was dead code.** The PRD's "we don't have it here, but the next city
does" branch could never fire: it hung off *category*-level emptiness, and every one of the 20
cities holds at least one deal in all five categories. Checked across all 400 (concept × city)
combinations — the state occurred zero times. Moved to *concept* level, where the gap is real:
**31 concept-and-city pairs carrying 374 searches** (4.2% of the month) — manicure in Marseille
while Paris holds 8, facial in Köln while München holds 5, gym in Madrid while Sevilla holds 2. All
31 previously collapsed into a bare `CATEGORY ONLY`, which buried the useful half of the answer.

**3. The findings are now inside the prototype, not beside it.** The eleven chips are grouped under
the three pillars from `FINDINGS_TO_BEHAVIOUR.md` — Truthful retrieval, Understanding intent, Honest
refusal — and under the panes the matching row of that table is rendered live: *what happens today* /
*this query, in the data* / *what the prototype does* / *fixable by search?* with a FULLY / PARTLY /
NO / TARGET badge. The second column is generated from the engine's own output, so the example is
always the query on screen rather than a canned one. Ten archetypes became eleven: "Not sold here"
split into **Not in this city** (Marseille) and **Not sold anywhere** (helicopter), which are
different answers and were sharing a name.

**4. Proof that the whole log is covered.** A strip under the prototype computes, live in the
browser, how all 8,997 logged searches divide across the response codes — MATCHED 3,243 · CATEGORY
ONLY 2,726 · NOT SOLD HERE 2,012 · THIN 372 · CORRECTED 365 · TRANSLATED 279 — and a **Try a real
logged search** button pulls an actual row out of the log. Every logged query now shows its
`query_id` in the Today pane, so a reviewer can grep the row in `search_log.csv` rather than take
the claim on trust. Asserted in the tests: all 1,308 pairs carry a real id.

**5. Part A: finding 07 folded into finding 02.** They were the same defect at two altitudes — 02 is
the measurement (r = +0.02), 07 is the existence proof (585 searches returned more than their city
holds). Tab 02 now leads with *Manchester holds nineteen deals; a gym search returned thirty-five*
and keeps the correlation underneath. A paragraph above the fifteen-findings table now says why the
six tabs are not the six highest ICE scores: score orders what to build first, the tabs order what
has to be understood first. **Nothing broke** — the tab code is generic (no `f1`…`f6` or chart name
appears anywhere in the page JS), so all six panels and all five charts were verified drawing after
the edit. The superseded "Seven kinds of query" table was deleted; Part B is now hero + prototype
and nothing else.

## Where the build differs from the PRD, and why

1. **`brunch` in London answers `CATEGORY ONLY`, not `MATCHED`** (PRD §10 row 7). No London deal is
   named brunch — the 13 are `Tasting Menu for Two`, `Three-Course Meal for Two`, `Dinner & Wine
   Experience`. Calling that a match is exactly the dishonesty `sushi`/Madrid exists to criticise, and
   the rule cannot fire for one dining word and not the other. The count is still 13 and the archetype
   still demonstrates overload (the log returned up to 38 for a city holding 13 dining deals).
2. **`THIN` fires on a result set of 1–2**, Part A's dead band (2,087 searches, 1.7% conversion against
   17.8% at 4–25) — not on a city-size threshold, which would have been arbitrary. This is what makes
   `manicure`/Kraków `THIN` (2) and `gym`/Manchester `MATCHED` (3), both as the PRD's table asks.
3. **1,308 log keys, not 1,322.** Normalisation collapses internal whitespace, so `supercar  track day`
   and `supercar track day` are one key. Every count in the UI is computed from these.
4. **Median deal price is $91.83, not $91.84** (even-length median, computed). Max price $179.46 as stated.
5. **Twenty cities, not nineteen** — 4 per market, counted from `deals.csv`.
6. **`TRANSLATED` requires the term's home market to hold ≥60% of its volume.** Below that it is a
   loanword every market types — brunch, sushi, crossfit, paintball, escape room, karting — and
   flagging those as foreign would be a false positive. This is why the response fires on 299 searches
   rather than the 347 in the foreign-language segment. Terms nobody types alone (`massage`, `masaz`)
   take their language from the longer logged queries that contain them.
7. **Spelling correction's edit budget scales with the query**: 0 for ≤3 characters, 1 for 4–6, 2 above.
   A flat budget of 2 "corrected" the single letter `a` to `spa`, which is guessing, not correcting.
8. **The response strip is green only in the `MATCHED` state** — when the search found the thing that was
   asked for. `THIN`, `CATEGORY ONLY`, `NOT SOLD HERE` and `NOT UNDERSTOOD` are neutral. Colour means
   one thing here, as the design principles ask.
9. **The active chip is green**, per PRD §5.2. `mockups/archetype03.png` shows it black; the project's
   design rules reject black active states.
10. **Each chip pins the finding it is the example for** (09 Unstable → F3, 06 Vocabulary gap → F5, and so
    on), with the other applicable findings listed after it. Without this, `paintball` under the
    "Unstable" chip led with F5, which reads as a mismatch. Typed queries that match no chip get the
    computed order.
11. **The Part B section keeps the page's white background** (`.hero+section{background:var(--card)}`),
    where the mockups sit the frame on warm grey. Changing it would regress the rule set in the
    round-3 pass. Easy to flip if the flatter reading is not wanted.

## Open, needs Ondřej

- **The Part B section keeps the page's white background** where the mockups sit the frame on warm
  grey. Still one line to flip if the flatter reading is not wanted.
- **`blueprint2.html.bak`** is written on every `build_page.py` run. Delete it whenever.

*(Resolved: the "Seven kinds of query" table was deleted on Ondřej's call — its volumes summed to
9,853 against 8,997 actual searches and the eleven archetypes supersede it. Part B is now hero +
prototype and nothing else.)*
