# PRD — Part B prototype: **Honest Search**

Status: draft v1, 2026-08-30. Written to be handed to Claude Code as the single build brief.
Owner: Ondřej Kulatka. Companion docs in this folder: `CLAUDE.md` (start here), `FINDINGS_TO_BEHAVIOUR.md` (why each
behaviour exists), `TESTING.md` (how to know it works). One level up: `../DEEP_DIVE_PART_A.md`
(the findings in full) and `../01_explore_output.txt` / `../02_findings_output.txt` /
`../03_validate_output.txt` (the numbers). Project rules: `../../CLAUDE.md`.

Every number in this document was recomputed against `search_log.csv` and `deals.csv` on
2026-08-30. If you change a number, rerun the check — do not copy a figure from the page.

---

## 0. One paragraph

A single-screen prototype that looks like a Groupon search result page, runs entirely in the
browser against the real 568-deal catalogue and the real 8,997-row search log, and answers **any**
query the reviewer types. Every answer is rendered twice, side by side: **Today** (what the log
actually returned for that query in that city) and **Proposed** (what a search that reads intent,
checks real city inventory and tells the truth would return). Under each pair, one line naming
which Part A finding this query exercises and what the change addresses.

The thing being demonstrated is not a better ranking algorithm. It is **honesty**: a search that
never returns more than exists, never returns nothing when something related exists, and says
plainly when the platform simply does not sell what was asked for.

---

## 1. Why this, and not something else

Part A's ICE ranking put six findings on top — vocabulary gap (432), impossible result counts
(420), retrieval ignoring stock (400), foreign-language conversion (378), instability (360),
overload (360). All six are solved by one build: **search that reads intent, checks real city
inventory, and tells the truth about what it found.**

The seventh, missing high-ticket supply (finding 06 — highest raw impact, Ease 2), is explicitly
**not** solvable by this prototype. That is a feature of the submission, not a gap: the brief says
*"what it does when it has no good answer tells us as much as what it does when it has one."*
Archetype 3 below is where the prototype refuses to pretend.

---

## 2. Goals and non-goals

**Goals**

1. Handle every kind of query found in Part A — the ten archetypes in §3, no dead ends.
2. Make the before/after difference legible in under five seconds, without stacked explanatory text.
3. Ground every claim in the real CSVs, so a reviewer typing an unlisted query still gets a truthful answer.
4. Name the finding behind each behaviour, so the prototype reads as a consequence of Part A rather than a search UI bolted on beside it.
5. Be honest about its own limits, in the UI, at the same size as the features.

**Non-goals**

- Production code quality, tests, build tooling. The brief explicitly does not assess these.
- Visual design as an end in itself. Match the case-study page's system; borrow Groupon's brand cues; stop there.
- A real ranking model, embeddings, or an LLM call. Everything is deterministic and inspectable — a reviewer must be able to reason about why a result appeared.
- Browse, homepage, category pages, checkout. Search only.
- Personalisation. There is no `user_id` in the data; inventing one would be dishonest.

---

## 3. The spine: ten query archetypes

This is the structure of the prototype. Findings hang off archetypes as explanation, not the
other way round. The brief asks the prototype to handle *every kind of query* — that is a
statement about queries.

The four segments already labelled in `searches_classified.csv` (core 6,557 / no-inventory 1,512 /
misspelling 581 / foreign-language 347) supply four of these; the remaining six are failure modes
of the retrieval layer that cut across segments.

| # | Archetype | Exemplar (real, from the log) | Today (from the log) | Proposed | Fixable by search? | Findings |
|---|---|---|---|---|---|---|
| 1 | **Healthy core query, real matching stock** | `back massage` · Manchester | 22 searches, returned 0–38 results | 5 real massage deals in Manchester, count fixed | Yes | F1, F2, F3 |
| 2 | **Thin real inventory** | `manicure` · Kraków | 6 searches, returned 2, 6, 12, 14, 22, 27 — city holds 10 deals total | 1 genuine match, stated as one, plus the adjacent beauty deal named as adjacent | Yes | F1, F7 |
| 3 | **No inventory at all, high ticket** | `helicopter tour` · London | 46 searches, returned 0 every time, 0 clicks, 0 purchases | Says Groupon does not sell this in London; offers the nearest real intent and a demand signal | **No** | F6 |
| 4 | **Foreign-language query** | `deep tissue massage` · Berlin | 8 searches, returned 0–19, **0 clicks, 0 purchases** — while 9 German-titled massage deals sit in Berlin | Resolves EN intent → DE catalogue, returns all 9, states the translation it made | Yes | F4 |
| 5 | **Misspelling** | `susshi` · London | 2 searches, returned 0 and 2 | Corrects to `sushi`, states the correction, then falls through to archetype 6 | Yes | F10 |
| 6 | **Customer vocabulary ≠ catalogue vocabulary** | `sushi` · Madrid | 44 searches, returned 0–38, 3 purchases — **Madrid holds zero sushi deals**; the 7 "matches" are generic dining packages (`Cena con Maridaje`, `Menú de 3 Platos`) | Says no deal in Madrid names sushi; offers the 7 dining deals labelled as category-level, not as sushi | Partly | F5, F9, F11 |
| 7 | **Overload** | `brunch` · London | 40 searches, returned up to 38 in one draw | Caps at genuine matches (13 dining deals), groups the rest behind one line | Yes | F8 |
| 8 | **Impossible result count** | `gym` · Manchester | 27 searches, returned up to **35** — Manchester's whole catalogue is 19 deals, of which 3 are fitness | Returns 3. The count can never exceed what the city holds | Yes | F7 |
| 9 | **Instability** | `paintball` · London, run twice | 54 searches returned everything from 0 to 29 | Same query, same city → identical answer, every time. Shown as a "run it again" control | Yes | F3 |
| 10 | **Unparseable / empty** | `asdfgh`, empty submit | Not in the log | Says it could not read an intent; offers the city's five largest real categories | n/a | — |

**Coverage claim to make on the page:** these ten archetypes cover 100% of the 8,997 logged
searches. Every row falls into at least one. Archetype 3 is the only one where the honest answer
is "we cannot fix this with search."

---

## 4. Product principles

1. **Never return more than exists.** The result count is a fact about the city's catalogue, not a number the UI produces. This alone kills findings 7 and 2.
2. **Never return nothing when something related exists.** Falling back is fine. Falling back silently is not.
3. **Name the move.** Every answer opens with one line stating what the system just did: *translated*, *corrected*, *matched by category*, *nothing here*. No result appears without its provenance.
4. **Refusal is a feature.** Archetype 3 must look deliberate and finished, not like an error state.
5. **The difference is the product.** Today and Proposed are always both visible. The prototype's argument dies the moment the reviewer has to remember what the old behaviour looked like.

---

## 5. UX specification

**Visual reference:** `mockups/archetype04.png` (and its `.html`) — a
static mockup of archetype 4 (foreign-language query, Berlin) with every number and deal title
taken from the real CSVs. It is the layout this section describes; build to it, do not redesign it.

### 5.1 Shell

A browser-window frame (rounded, hairline border, no shadow — the case-study page uses no
shadows) containing a Groupon-style header. Inside the frame:

- Groupon wordmark (reuse the base64 PNG in `v2/build/_logo.txt`).
- Search field, centred, pill-shaped, **2px green outline when focused** (`--green #007D25`), clear (×) button, round green submit button with a magnifier — matching the screenshot Ondřej supplied.
- Market + city selector to the right of the search field, rendered as a location pill: `📍 Berlin, Germany · Change`. Opens a panel listing all five markets and their cities, read from `deals.csv`. Each city shows its real deal count, e.g. `Kraków · 10 deals` — the number is itself a Part A finding on display.

The frame is **not** a browser chrome imitation with fake URL bars and tab strips. One thin top
bar, the Groupon header, done. It reads as "a product screen", not as a joke about screenshots.

### 5.2 Query chip rail

Directly under the search field: a horizontally scrolling rail of ten chips, one per archetype,
each labelled with the archetype name and preloading its exemplar query **and** its city.
This is how the reviewer sees all ten states in twenty seconds without guessing what to type.
Chips are secondary styling (outline, `--line`), the active one green-filled.

### 5.3 The two panes

Two columns, equal width, on one row.

| | Left — **Today** | Right — **Proposed** |
|---|---|---|
| Header | `TODAY` label, mono, `--ink3` | `PROPOSED` label, mono, white on `--green` |
| Chrome | Card on `--bg`, `--line` border, contents at 70% opacity, greyscale images/badges | Card on `--card` white, `--green` 1.5px border, full colour |
| Content | The result count the log actually returned, then generic placeholder rows | Real deal cards from `deals.csv` |

**The left pane is not a simulation.** For any query+city present in the log it replays the real
distribution: *"This query ran 22 times in Manchester. It returned between 0 and 38 results.
This run: 14."* with a "run again" control that redraws from the logged values. That single
interaction demonstrates finding 03 more convincingly than any chart — and it is honest, because
the numbers come from the log rather than from us. For a query not in the log, the left pane says
so and draws from the same band distribution the generator uses (0 / 1–2 / 4–25 / 26–40, no 3),
labelled as a reconstruction.

Mobile (<820px): stack, Proposed first, Today collapsed behind a `Show what happens today` toggle.

### 5.4 Result card (Proposed pane)

Title (local language, verbatim from the catalogue) · category · price · rating · instant-booking
badge. Price in Groupon's green, at Groupon's weight — but **no struck-through anchor price and no
discount pill**: the catalogue carries no original price, and inventing one would be the exact
dishonesty this prototype argues against. Rating as a star + number. No images — there are none in the data, and inventing them would be
the exact dishonesty this prototype argues against. A neutral category glyph instead.

### 5.5 The response line

Between the search bar and the panes, full width, one line, mono label + plain sentence:

- `MATCHED` — *5 deals in Manchester match "back massage".*
- `TRANSLATED` — *Read as German. "deep tissue massage" → Massage. 9 deals in Berlin.*
- `CORRECTED` — *Searched for "sushi" instead of "susshi".*
- `CATEGORY ONLY` — *No deal in Madrid is named "sushi". 7 dining deals, shown as dining.*
- `THIN` — *Kraków has 10 deals in total. One is a manicure.*
- `NOT SOLD HERE` — *Groupon does not list helicopter flights in London. This is not a search bug.*
- `ABOVE CEILING` — *The most expensive deal in this market is $179. Nothing here is priced like a helicopter flight.*
- `NOT UNDERSTOOD` — *Could not read an intent from that. Here is what London actually sells.*

These eight strings are the vocabulary of the whole prototype. Adding a ninth is a product
decision, not a copy tweak.

### 5.6 The finding strip

Below the panes, one full-width bar, collapsed by default to a single line:

`FINDING F4 · Wrong language` — *266 foreign-language searches produced 2 purchases.*
Expand → two short paragraphs: what the finding is, what this behaviour changes, and a link to
the same finding in Part A of the case-study page.

Never overlays the results. Never appears inside a pane. This is the rule Ondřej set: explanation
sits underneath, not across.

### 5.7 States

Loading is instant (everything is in memory) — do not add fake latency. Empty query on submit →
archetype 10. Every state has a Proposed pane; there is no blank screen anywhere in the product.

### 5.8 Accessibility

Carry over the case-study page's standard: AA contrast on every pair, visible focus rings, the
chip rail keyboard-navigable with arrow keys, `prefers-reduced-motion` respected, no horizontal
page scroll at 390px.

---

## 6. Engine specification

Reuse `engine.js` and `build_data.py` from the v1 prototype at the repo root — 566 lines that
already implement normalisation, Levenshtein distance with a cap, a 20-concept intent map across
five languages, and native-vs-foreign term detection. Do not rewrite them; extend.

Resolution order, first match wins:

1. **Normalise** — lowercase, strip diacritics, collapse whitespace, `ß→ss`.
2. **Exact intent term** → intent. Record the language the term belongs to.
3. **Fuzzy** — Levenshtein ≤2 against every intent term, shortest distance wins → `CORRECTED`.
4. **Foreign detection** — if the matched term is not native to the market (the v1 rule: asked 20+ times in this market, or ≥20% of the term's total volume), flag `TRANSLATED` and name both languages.
5. **Retrieve** — all deals in the selected city whose `category_l2` maps to the intent. Title-level match if the intent has a literal catalogue term; otherwise category-level, and say so (`CATEGORY ONLY`).
6. **No inventory** — intent resolved but the city holds zero matching deals. Two different cases, and they must not be collapsed:
   - **The concept exists elsewhere in the market** (thin local stock): `NOT SOLD HERE` plus the nearest city in the same market that holds it. "Nearest" means same market — there are no coordinates.
   - **The concept exists nowhere in the catalogue** — the six high-ticket ones. There is no nearest city; verified across all 568 deals. Say so explicitly, add the price-ceiling note, offer at most **one** hand-mapped adjacent deal labelled *"a different experience, not a replacement"* (`supercar track day` → Go-Karting; `helicopter tour` / `hot air balloon ride` → Guided City Tour; `skydiving`, `rafting`, `shark diving` → nothing, show nothing), and surface the demand signal with its real number. Mark the whole state as an unvalidated proposal — the data cannot say whether any of it converts. Full reasoning in `FINDINGS_TO_BEHAVIOUR.md`.
7. **Unresolved** → `NOT UNDERSTOOD`.

Hard invariants, assert them in code:

- `results.length <= dealsInCity.length`, always.
- Same `(query, city)` → byte-identical output. Sort by `(rating desc, price asc, deal_id asc)`; never random.
- No result is ever fabricated. Every card carries a real `deal_id` from `deals.csv`.

---

## 7. Data contract

One JSON bundle built at build time by a Python script, inlined into the page or fetched beside
it — no backend, no API key (the brief asks that any key be named; there is none).

- `deals[]` — all 568 rows, array-of-arrays to keep it small: `[deal_id, market, city, title, category_l1, category_l2, price_usd, rating, num_ratings, is_bookable]`.
- `cities[]` — market, city, deal count, per-category counts.
- `intents[]` — concept, catalogue category (or `null` for the six with no inventory), display label, terms across all five languages.
- `log{}` — for each `(market|city|query)` seen in the log: number of searches, and the list of `results_shown` values. This is what the Today pane replays. 1,322 distinct keys; store as compact arrays.

Target bundle size under 250KB uncompressed. The v1 bundle was 106KB with fewer log keys, so this
is comfortable.

---

## 8. Design

Inherit the case-study page's tokens exactly (`v2/build/01_head.part`):

```
--bg:#F7F7F5  --card:#FFF  --ink:#15140F  --ink2:#5D5C55  --ink3:#8B8A82
--line:#E5E4DF  --line2:#EFEEEA  --green:#007D25  --green-soft:#E8F2EA
--purple:#642C84  --purple-soft:#F0EAF4
--sans: Inter  --mono: ui-monospace / SF Mono / Menlo
```

Borrowed from the Groupon brand, and only these: the green focus outline on the search field, the
round green submit button, the green price treatment, the
location pill with `Change location`, the wordmark. No Groupon gradients, no shadows, no rounded
card stacks — the surrounding page has none and the prototype must not look pasted in from
another site.

Purple stays what it is on the case-study page: the failing series. Use it for the Today pane's
count, nowhere else.

---

## 9. What this prototype cannot do

State this in the UI, in a fixed footer strip inside the frame — not in a modal, not behind a link.

- **No `deal_id` on a search row.** We know how many results a search returned, never which ones. The Today pane replays counts, never actual results.
- **No `user_id` or session.** No personalisation, no journey, no "customers who searched this also…".
- **No ranking data.** Nothing in the log records what order results appeared in, so the Proposed pane's ordering is a defensible choice, not a reproduction.
- **No coordinates.** "Nearest city" uses market membership, not distance.
- **Prices are labelled USD across five non-US markets.** Shown as given; not converted.
- **The catalogue is 75 distinct titles across 568 deals.** Many "matches" are necessarily category-level. The prototype says so rather than hiding it.

---

## 10. Acceptance criteria

The prototype is done when each of these produces the stated response line and result count.
Verify by typing, not by reading the code.

| # | Type this | City | Expected response line | Proposed count |
|---|---|---|---|---|
| 1 | `back massage` | Manchester | `MATCHED` | 5 |
| 2 | `manicure` | Kraków | `THIN` — 10 deals in the city | 1 (+1 adjacent) |
| 3 | `helicopter tour` | London | `NOT SOLD HERE` + `ABOVE CEILING` | 0, with alternatives |
| 4 | `deep tissue massage` | Berlin | `TRANSLATED` (EN→DE) | 9 |
| 5 | `susshi` | London | `CORRECTED` then `CATEGORY ONLY` | 13 dining |
| 6 | `sushi` | Madrid | `CATEGORY ONLY` — no deal names sushi | 7 dining |
| 7 | `brunch` | London | `MATCHED`, capped, grouped | 13 |
| 8 | `gym` | Manchester | `MATCHED` — never exceeds 19 | 3 |
| 9 | `paintball` | London, twice | identical output both runs | identical |
| 10 | `asdfgh` | any | `NOT UNDERSTOOD` + city categories | 0 + 5 categories |

Plus two invariant tests, run in the console:

- For all 1,322 log keys: proposed result count ≤ that city's deal count. Zero violations.
- For 100 random queries run twice: identical output. Zero differences.

---

## 10b. Where it is inserted

Not a standalone app. The prototype replaces the three grey `Placeholder` cards inside
`<div id="partb">` in **`../blueprint2.html`** — one self-contained ~115 KB file, two `<style>`
blocks, three `<script>` blocks. The Part B section runs from the `id="partb"` div to the
`id="partc"` div.

- **Do not rebuild the page from `../build/*.part`.** Those fragments are stale — they diverge from the live page at the nav — and rebuilding from them would revert work. Edit `blueprint2.html` in place.
- Prefix every new CSS class `pb-`; put all new JS in one IIFE exposing a single global `window.PB`. Check for collisions before adding any class or id.
- Inherit the tokens from the page's first `<style>` block. Add the prototype's own rules as a third block only if that is cleaner than extending the second — and if you do, `TESTING.md` gate 4's block count changes to 3, so update it.
- The hero and the "Seven kinds of query" table above the placeholders stay as they are for now. Replacing that table is a separate, deferred task — see `CLAUDE.md`, "Deferred, on purpose".

## 11. Build order for Claude Code

1. Data bundle script (`build_prototype_data.py`) → JSON. Verify counts against the CSVs before touching UI.
2. Engine — port `engine.js`, add the eight response types and the two invariants. Test in node, no UI.
3. Static shell — frame, header, search, city selector, chip rail. No results yet.
4. Proposed pane + result cards.
5. Today pane + the log replay and "run again".
6. Response line and finding strip.
7. The ten acceptance queries, one by one.
8. Responsive pass at 390px, accessibility pass, limits footer.
9. Screenshot every one of the ten states. Any state that looks broken is broken.

Do not start step 3 before step 2 passes the four engine invariants in node — `TESTING.md` gate 1.
The argument of this prototype is that the retrieval is honest; a pretty shell over a wrong engine
is exactly the thing Part A is criticising.

Testing is specified separately and in full in **`TESTING.md`**: four engine invariants that gate
the UI work, the ten acceptance queries, an adversarial typing list, the page-integrity checks that
catch the CSS-dropping failure mode this repo has already hit once, and a requirement to screenshot
and actually look at all ten states. "Done" is defined there, not here.

---

## 12. Explicitly out of scope

Browse and category pages. Homepage. Checkout. Saved searches. A "notify me when this launches"
backend (the button can exist and say what it would do). Multi-city search. Currency conversion.
Anything requiring an ID that the data does not contain.
