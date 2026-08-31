# From finding to behaviour — what the prototype actually does, and what it refuses to do

Companion to `PRD.md`. This document answers one question: for every thing Part A found
broken, what exactly does the prototype do differently, and where does it admit that search cannot
help. All numbers recomputed against the CSVs on 2026-08-30.

---

## The mechanism in one paragraph

Today's search behaves like a slot machine that never looks at the shelf. It draws a result count
from a fixed set of bands (0, 1–2, 4–25, 26–40 — the value 3 never occurs in 8,997 rows), and that
count has essentially no relationship to what the city holds (r = +0.02). The prototype replaces
this with three steps, in order:

1. **Understand what the person meant** — resolve the typed string to a concept, across languages and typos, instead of matching it against deal titles.
2. **Look at what the city actually holds** — retrieve from `deals.csv` for the selected city. The count is a fact about inventory, never a number the system invents.
3. **Say out loud what it just did** — translated, corrected, matched by category, or nothing here.

Every behaviour below is one of those three steps applied to one finding. Nothing else is going on.

---

## The one number that splits fixable from unfixable

2,633 searches returned nothing at all. Of those:

| | Searches | Share | Fixable by search? |
|---|---|---|---|
| The city holds nothing of the kind (helicopter, balloon, skydiving, rafting, supercar, shark diving) | 1,512 | 57% | **No.** Needs inventory. |
| The city holds matching deals, search failed to find them (851 core + 189 misspelled + 81 foreign-language) | 1,121 | 43% | **Yes.** |

That is the honest headline of Part B: **a better search recovers roughly two in five of the
searches that currently return nothing. The other three in five need someone to go and sign up a
helicopter operator.**

Conversion by segment, for scale: core queries 10.58%, misspellings 4.65%, foreign-language
0.58%, no-inventory 0.00% (1,512 searches, 0 clicks, 0 purchases — not one).

---

## Pillar 1 — Truthful retrieval

*The count is a fact about the catalogue, not a number the system produces.*

| Finding | What happens today | Real example | What the prototype does | Fixable |
|---|---|---|---|---|
| **F2 — Retrieval ignores stock** | The number of results has no relationship to matching inventory (r = +0.02, robust under three independent definitions of "matching"). | — | Result count = the number of deals in that city whose concept matches. There is no other source for the number. | **Fully** |
| **F7 — Impossible results** | 585 searches (6.5%) returned more results than the city holds deals in total. | `gym` in Manchester returned up to **35**. Manchester's entire catalogue is **19 deals**, of which 3 are fitness. | Hard cap asserted in code: `results ≤ deals in this city`. The prototype returns **3**. | **Fully** |
| **F3 — Instability** | The same query in the same city answers differently every time. Of 411 query-city pairs with ≥8 searches, **0 of the 337 that ever return anything are stable**; 80% hit both 0 and 20+. | `paintball` in London ran 54 times and returned everything from **0 to 29**. | Deterministic sort: rating desc, price asc, deal_id asc. Same query, same city, byte-identical answer, always. The Today pane keeps a "run it again" button so the contrast is visible. | **Fully** |
| **F1 — The funnel is a step, not a slope** | Conversion by band: 0 results → 0%, 1–2 → 1.7%, 4–25 → **17.8%**, 26–40 → 2.3%. | — | Not a behaviour — this is the scoreboard. It sets the goal: move a search **into** the 4–25 band. Inside the band, more results barely helps (4–9: 19.8%, 20–25: 17.3%), so the prototype never pads a result set to look fuller. | It's the target, not a bug |

---

## Pillar 2 — Understanding intent

*Match on meaning, not on strings. This is where cross-language lives.*

| Finding | What happens today | Real example | What the prototype does | Fixable |
|---|---|---|---|---|
| **F4 — Wrong language** | The query is matched against deal titles, and titles are in the local language. An English query in Germany matches nothing, so it returns nothing or noise. 347 foreign-language searches → 29 clicks → **2 purchases** (0.58%), against 10.58% for local queries. Foreign was worse in 54 of 55 market-and-intent cells. | `deep tissue massage` in **Berlin**: 8 searches, returned 0–19 results, **0 clicks, 0 purchases** — while Berlin holds **9 German-titled massage deals** (`Wellness-Massage Paket`, `Wohlfühl-Massage`). | The typed string resolves to a **concept** (`massage`), not to a title. The concept is language-independent, so all 9 Berlin deals come back regardless of what language their titles are written in. The response line says: *"Read as English in a German market. deep tissue massage → Massage. 9 deals in Berlin, all titled in German."* | **Fully** — and it is the cheapest high-value fix in the set |
| **F10 — Misspellings** | Misspelled queries return the **same number** of results as clean ones (p = 0.16) — just not the right ones. Healthy-band conversion drops 18.2% → 11.5% (p = 0.0099). 581 misspelled searches convert at 4.65%. | `susshi` in London returned 0 and 2 on its two runs. | Levenshtein distance ≤ 2 against every known concept term, shortest wins. Corrects to `sushi`, states the correction, then falls through to the vocabulary rule below. | **Fully** |
| **F5 — Vocabulary gap** | The catalogue names deals in generic package language; customers search in specific product language. Title-string matching therefore misses. | `sushi` in **Madrid**: 44 searches, 3 purchases. Madrid holds **zero deals naming sushi**. The 7 nearest things are generic dining packages — `Cena con Maridaje`, `Menú de 3 Platos para Dos`. | Two-level answer. If the catalogue names the concept, match it. If it only carries the category, return the category **and label it as such**: *"No deal in Madrid is named sushi. 7 dining deals, shown as dining."* The prototype never dresses a dining package up as a sushi result. | **Partly.** Search can be honest about it; only merchandising can retitle the deals |
| **F8 — Overload** | 26–40 results converts at 2.3% — worse than showing four. Too many is its own failure mode. | `brunch` in London returned up to **38** in a single draw. | Returns only genuine matches (13 dining deals in London), groups the tail behind one line. Never pads. | **Fully** |

---

## Pillar 3 — Honest refusal

*What the system does when it has no good answer. The brief says this is assessed as heavily as the successes.*

| Finding | What happens today | Real example | What the prototype does | Fixable |
|---|---|---|---|---|
| **F6 — Missing high-ticket supply** | Six named concepts — helicopter, hot-air balloon, skydiving, rafting, supercar track day, shark diving — return **zero results, every single time**. 1,512 searches in the segment, 0 clicks, 0 purchases. Folding in misspelled variants the Part A figure is 1,639 (18.2% of all searches). These six are **62.2% of every zero-result search**. Meanwhile the most expensive deal anywhere in the catalogue is **$179.46** (median $91.84) — which is the AOV gap in one number. | `helicopter tour` in London: 46 searches, 0 results, 0 clicks, 0 purchases. | Says so, deliberately, as a finished state rather than an error: *"Groupon does not list helicopter flights in London. This is not a search bug."* Then offers the nearest real concept, notes the price ceiling, and captures the demand signal. | **No.** No retrieval change creates a helicopter operator. Goes to merchandising / supply |
| **F11 — The catalogue repeats itself** | 75 distinct titles across 568 deals — a 7.6× repetition ratio. London lists 69 deals under 15 titles. | 6 of Berlin's 9 massage deals carry the identical title `Wellness-Massage Paket`. | Names the repetition instead of hiding it, and differentiates the cards on the axes that do differ: price, rating, instant booking. | **No.** Merchandising / content |
| **F12 — No quality floor** | 116 of 568 deals (20.4%) are rated below 4.0, with nothing visibly filtering them out. | — | Ranking policy: rating descending, so weak deals sink. The prototype does not hide them — it just stops leading with them. | **Partly.** Ranking helps; a listing policy is someone else's decision |
| **F13 — Instant booking collapses outside the UK** | 76% of UK deals are instantly bookable, against 48% DE, 57% FR, 43% ES, 43% PL (p = 3.2e-08). | — | Nothing. *Revised 2026-08-31: the badge was on every result card and carried almost no signal — roughly three cards in five showed it — so it was removed as noise. The finding is real and stays in Part A; the prototype simply is not where it is answered.* | **No.** Operations |

---

## The zero-result state in detail — finding 06, and what we can and cannot claim about it

This is the state the brief singles out (*"what it does when it has no good answer tells us as much
as what it does when it has one"*), so it is worth being exact about which parts are measured and
which parts are a proposal.

### What the data proves

- **Nineteen distinct queries, six concepts, five languages, always zero.** `helicopter tour`,
  `lot helikopterem`, `hubschrauber rundflug`, `tour en helicoptere`, `vuelo en helicoptero`,
  and the equivalents for hot-air balloon, skydiving, rafting, supercar track day and shark diving.
  1,512 searches, **maximum results shown = 0**. Not "usually zero" — zero every time.
- **Nothing in the catalogue matches any of them.** Checked all 568 deals across all five markets
  and all 19 cities: there is no helicopter, balloon, skydiving, rafting, supercar or shark-diving
  deal anywhere in the dataset. The catalogue is five categories deep — massage, dining,
  activities, fitness, beauty — with 15 titles each.
- **Therefore "try the next city" does not exist as a fallback for this finding.** There is no
  nearest city that holds one. (There are also no coordinates in the data, so "nearest" could only
  ever have meant "same market" anyway.) The nearest-city fallback is real for thin inventory —
  archetype 2 — and unavailable here.
- **Zero-result searches produced 0 clicks and 0 purchases.** Not "a few". Exactly zero, which is
  tautological — there is nothing to click. The band that produces the near-miss purchases is
  **1–2 results: 2,087 searches → 216 clicks → 35 purchases (1.7%)**.
- **Demand, by concept, in one month:** skydiving 366, helicopter 353, balloon 347, rafting 282,
  supercar 85, shark diving 79. By market: GB 449, ES 318, FR 296, DE 263, PL 186. The largest
  single city-concept cells are Paris skydiving (51), Madrid skydiving (50), London supercar (49),
  London helicopter (46).
- **Even the price band is wrong for it.** The most expensive deal in the entire catalogue is
  $179.46, median $91.84. A helicopter flight is not a $179 product. This is the AOV gap stated as
  a supply fact rather than a pricing one.

### What the data cannot say

- **Whether an alternative recommendation would convert.** There is no `user_id` or session, so a
  customer who searched, got nothing, and then did something else appears as unrelated rows. We
  cannot observe what anyone did after a zero. Any upsell is therefore a **hypothesis with a
  measurement plan**, never a finding.
- **Whether these customers would accept a substitute at all**, or left for a competitor.
- **What was actually bought on any search**, since search rows carry no `deal_id`.

### What the prototype does, and how it is labelled

**The goal is a screen that is still useful when the answer is no.** "No results" is a dead end;
what follows is a way back in. Visual reference: `mockups/archetype03.png`.

Three blocks, in this order, and the third is the point.

1. **The truth, plainly.** *"Groupon does not list helicopter flights in London. This is not a
   search bug — there is no such deal in any of the five markets."* Plus the ceiling note when the
   concept is high-ticket: *"The most expensive deal in this market is $179."*
2. **One adjacent thing that genuinely exists, labelled as different — not as a substitute.**
   Mapped by hand, and the map is a judgement call, so the UI says so:
   `supercar track day` → **Go-Karting Session** (London holds 3; the closest real motorsport
   experience). `helicopter tour` / `hot air balloon ride` → **Guided City Tour** (London holds 6;
   the same "see the city" intent from the ground). `skydiving` and `rafting` → **Go-Karting
   Session** (the nearest adrenaline experience the catalogue has at all); `shark diving` →
   **Guided City Tour**. Showing one deal labelled *"a different experience, not a replacement"*
   is more honest than three labelled "you might also like".

   *Revised 2026-08-31.* The last three were originally left empty, on the grounds that showing
   nothing beats reaching. Built and used, that was over-cautious: **skydiving is the most-searched
   of the six (387 searches) and rafting is third (312)**, and both were answering with a blank
   screen — the exact dead end this state exists to avoid. They now point at the nearest thing the
   catalogue holds, and the card says in as many words that **which substitute anyone would accept
   is not in the data** and that the mapping is a judgement while the demand figure beside it is
   measured.
3. **A way back into the catalogue, and a way to register the demand.** Two things, in one block:
   - **What this city actually has**, as five tiles with real counts — London: Fitness 17, Beauty 14, Dining 13, Activities 13, Massage 12, from its actual 69 deals. Each tile runs that search. This is the piece that turns a dead end into a next step, and it costs nothing to build because the counts already exist.
   - **Notify me when it launches.** *"Want helicopter flights in London? Tell us, and we'll go looking for an operator."* Honest microcopy underneath: *"We'll email you if one joins. Nothing else happens today."* For the reviewer, the finding strip carries the number the supply team would act on — 353 helicopter searches in one month, 1,512 across all six concepts.

**Copy rules for this state.** Say the thing in the first line, in the customer's words, and do not
apologise. Never "no results found" — that describes our system's state, not theirs. Never a grid
of nine unrelated deals: one labelled alternative reads as judgement, nine read as desperation. And
the diagnostics — the price ceiling, the search volumes, the confession that this is unvalidated —
live in the strip *below* the panes, where the reviewer reads them and the customer does not.

The whole state is marked in the interface as **unvalidated**: the adjacent-deal mapping and the
notify-me flow are proposals, and the data cannot say whether either converts. Part C carries how
it would be measured in production — instrument zero-result → alternative shown → click/purchase,
and treat the notify-me volume as a supply input with a target of pulling the six concepts out of
the zero band entirely.

---

## What no version of this prototype can prove

Stated in the UI, not buried in a footnote.

- **No `deal_id` on a search row.** We know how many results a search returned, never which ones, and never what was bought. The Today pane replays counts — it can never show the actual results a customer saw.
- **No `user_id` or session.** A customer who searched, got nothing, retyped and then bought looks like two unrelated rows. So every claim here is a **predictive signal, not proof of causation**. We can show that 9 Berlin massage deals exist and that today's search does not surface them for an English query. We cannot show that surfacing them would have produced a sale.
- **No ranking data.** Nothing records the order results appeared in, so the prototype's ordering is a defensible choice, not a reproduction of anything.
- **No coordinates.** "Nearest city" means "same market", not "closest".
- **Prices labelled USD** across five non-US markets. Shown as given.

---

## Summary — the three-line version

1. **Two of every five searches that return nothing today are recoverable by search alone** (1,121 of 2,633). The prototype recovers them by understanding intent and reading real inventory.
2. **Three of every five are not** (1,512 of 2,633). Those are six high-ticket experiences nobody has signed up in these markets, and the prototype's job is to say so cleanly rather than fake a result.
3. **Everything else — the impossible counts, the instability, the language failures — is a retrieval layer that never checks the shelf.** Making it check is a small change with the largest measurable effect in the data.
