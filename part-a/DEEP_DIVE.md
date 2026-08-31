# Deep Dive: Part A — What is broken

This is the fuller write-up behind the six findings argued on the case study page. The page
states each claim; this document carries the reasoning, the paragraphs that didn't fit on the
page, the nine supplementary findings, the three traps in full, and the methodology behind all
of it. Every number here is reproducible — see [Case Materials → Analysis scripts] or run
`01_explore.py`, then `02_findings.py`, then `03_validate.py` yourself.

## Method

Three passes, each checking the one before it.

**01 — Explore.** No interpretation. File profiles, integrity checks (nulls, duplicate ids,
referential sanity), a full histogram of `results_shown`, and an catalog of what the two CSVs
do and don't contain. This is the pass that produced the "what the files cannot tell me" list
below — it's read off the data, not asserted.

**02 — Find.** The original analysis. Builds a query→intent map and a deal→intent map by hand,
and derives fifteen findings plus three claims that look like findings and aren't (the "traps").

**03 — Validate.** A second script, written from zero — not a review or a refactor of the first
— whose only job was to try to break every fragile claim. Four numbers moved as a result (below).
Reading your own code only confirms your own decisions; this is why a second, independent build
matters more than a second read-through.

## What the files cannot tell me

Bounds every conclusion below.

- **No `deal_id` on a search row.** I know how many results appeared on a search, never which
  ones — and never what was actually bought. Every claim about "what was shown" is inferred from
  a count, not observed.
- **No `user_id` or session.** A customer who searched, got nothing, retyped, and then bought
  looks like two unrelated rows. There is no way to trace one customer's journey.
- **No position or ranking.** Nothing states the order results were shown in.
- **No timestamp beyond the day.** No time of day, no ordering within a day.
- **No coordinates.** "The next city over" cannot be computed.
- **No currency field.** Prices are labeled USD across five non-US markets.
- **No relevance label.** Nothing states whether a result was a correct match. I had to define
  that myself — see the intent-mapping note below — and validated the definition three
  independent ways, but it's still a judgment call, not a measurement.

Because of this, several findings below are best read as **predictive signals, not proof**: a
pattern this consistent, across thousands of rows, is strong evidence — but without an ID chain
from one search to one outcome, it isn't the same as observing one customer's actual journey.

## The intent map

Nothing in the data says whether a search result was relevant. I built an explicit query →
intent → catalog map by hand and used it to compute "how many deals genuinely match this
search." Because that definition drives several findings, I tested it three independent ways
before trusting any result that depended on it:

1. My own fine-grained intent map (35 concepts).
2. The catalog's own `category_l2` field — no hand mapping at all.
3. No map whatsoever — just every deal in the city.

Where a finding holds under all three, it's reported as robust. Where it doesn't (findings 7, 8,
15 below), it's reported as a range and flagged low-confidence.

## Generator forensics (from `01_explore.py`)

`results_shown` is not drawn from a continuous distribution — it's drawn from four discrete
bands: 0, 1–2, 4–25, 26–40. Within each band the distribution is statistically uniform (chi-square
goodness-of-fit p = 0.95, 0.03, 0.79 respectively). The value 3 never occurs — not once in 8,997
rows. That is the strongest evidence in the whole dataset that whatever generates a result count
is decoupled from actual catalog: a real retrieval system ranking real catalog would not produce
a hard gap at exactly 3.

It also strengthens the "goal is to reach the band, not fill it" point on the page: inside the
4–25 band, moving from the low end to the high end makes essentially no difference to conversion
(4–9 results converts at 19.8%, 20–25 at 17.3%) — so a fix only needs to get a search out of the
failing bands, not maximize the count once it's healthy.

## The six findings, in full

### 01 — The funnel is a step, not a slope

Conversion does not decline gently as results get thinner. It falls off a cliff between three
results and two. Searches returning one or two results convert at 1.7%; searches returning four
to twenty-five convert at 17.8% — ten times better.

29.3% of searches return nothing, and every dashboard watches that number. The 23.2% that return
one or two results are watched by nobody, because they are not zero.

Inside the healthy band it makes no difference whether you show five results or twenty-five —
four to nine converts at 19.8%, twenty to twenty-five at 17.3%. The goal is to reach the band,
not to fill it. That decides what the prototype optimises for.

### 02 — The number of results has no relationship to the catalog

For every search I counted how many deals in that city genuinely match what the customer asked
for, then compared it with how many results the system returned. If retrieval worked, the two
would rise together. They do not move together at all: r = +0.02.

That number depends on my definition of "matching," so I tested three (see "The intent map"
above). My own intent map gives +0.02. The catalog's own five categories give +0.01. No map at
all — just every deal in the city — gives +0.02. The finding is not my judgment. It is in the
data.

The clearest case is paintball. 292 searches in the month. The catalog's 568 deals carry 75
distinct titles and none of them is paintball. The system returned a median of nine results
anyway, customers clicked 121 times, and thirty of them bought something. What they were shown,
the log does not say. It records the count, never the contents.

### 03 — The same query in the same city answers differently every time

Catalog is a single monthly snapshot. It does not change. Yet a repeated query in a fixed city
swings from zero results to forty across thirty days.

Of the 411 query-and-city pairs searched at least eight times, 337 ever return anything. Not one
of those 337 returns a stable count. 80.1% of them hit both zero and twenty-plus in the same
month. The typical spread is 31 results.

Seventy-four pairs are perfectly consistent. Every one of them consistently returns nothing. The
only thing this system does reliably is fail.

### 04 — Type it in the wrong language and the purchase never happens

A customer in Berlin searching *Gesichtsbehandlung* gets a median of eight results and buys 10.4%
of the time. The same intent, in the same city, typed as *facial*, gets a median of one.

The naive comparison is misleading, and it misled me first. Some English words are simply what
the local market types — Germans do search *escape room*, *brunch* and *crossfit*. Averaged
crudely, foreign-language queries look fine.

So a query counts as foreign only when that same market also searches that same intent in its
own language, and the comparison runs inside those pairs. That leaves 55 market-and-intent cells.
The foreign version is worse in 54 of them.

266 foreign-language searches produced two purchases. The 2,819 local-language searches for the
same intents produced 293.

Rebuilt independently with a from-scratch translation-pair list (`03_validate.py`): still 54 of
55, sign test p = 1.6e-15, odds ratio 6.61 (p = 5.7e-39). Under a stricter pairing rule the same
test gives 48 of 48 — the exact count moves a little with the inclusion threshold, the direction
never does.

### 05 — Catalog vocabulary misses customer vocabulary

Customers search for 128 distinct things. The catalog has 75 titles, and names them things
nobody types: *Full Body Massage Package*, *Tasting Menu for Two*, *Unlimited Fitness Classes*.

There is no sushi in the catalog. No pizza, no burger, no bowling, no paintball. There are spa
treatments, massages, generic dinners, gym passes, escape rooms, karting and city tours. That is
close to the whole catalog.

Those three generic families — massage, dining, classes — are 256 of the 568 deals. 45% of
everything in the catalog, described in words no customer has ever searched. (256 is a construction
— the three catalog categories whose titles are generic, added together. Counting strictly by
keyword match in the title gives 159; state which definition is in use.)

`01_explore.py` adds a strengthening detail: the 75 titles aren't 75 independent things — they
are 15 concepts × 5 markets (each concept translated once per market). The vocabulary gap is
structural, not a long tail of one-offs.

### 06 — The missing high-ticket floor explains the AOV gap

The brief notes that average order value outside the US runs at roughly 60% of US levels. The
data offers a direct explanation.

1,639 searches — 18.2% of the month — ask for skydiving, helicopter tours, hot air balloons,
rafting or supercar track days. There is no catalog for any of them. Every one of those searches
returns zero results. Zero clicks. Zero revenue. Always. (1,639 counts misspellings folded into
their intended query — *raffting*, *skydivving*. Strict string matching gives 1,565.)

And the ceiling underneath it: the most expensive deal in the entire catalog costs $179.46. The
median is $92. Prices run almost uniformly from $13 to $180 (Kolmogorov–Smirnov test against a
uniform distribution, p = 0.09) — the $179 ceiling looks like a property of how this dataset was
generated, not a market fact, and should be stated as such rather than left to look like an
oversight. A customer who arrived ready to spend €400 has nothing to buy. The average order
cannot be anything but low.

## The three traps

Claims the data invites you to make. All three are wrong.

**Trap 01 — "CrossFit converts better than Pilates."** Inside the healthy band, ranking queries
by conversion looks convincing: from 7.5% to 31.0%, a fourfold spread. So instead of trusting a
p-value few people can interpret, I simulated two thousand months in which every query has
exactly the same conversion rate, and measured how big a gap pure chance alone produces. A spread
of 23.5 percentage points or more turns up 77% of the time. The ranking is a dice roll.

**Trap 02 — "Poland is the worst market."** Poland has the highest zero-result rate — 32.6%
against Germany's 26.9%. The original analysis tested this by restricting to rows with an exact
stock match, which threw out 73.5% of the data and found p = 0.11 (not significant, but a weak
test — that's a loss of statistical power, not evidence of no effect). The independent rebuild
used a proper test instead: a logistic regression controlling for both query identity and
language. The real effect is small but genuine (p = 0.015), and it runs the other way: once
language is accounted for, Britain is slightly better than everyone else (27.3% vs 30.2%
zero-rate, about 3 points), and Poland is statistically indistinguishable from Spain or France.
Most of the original "Poland" gap was language wearing a flag.

**Trap 03 — "CTR shows relevance."** Among searches that returned at least one result, paintball
has one of the highest click-through rates in the dataset: 45.5% (restricted to searches with
≥1 result — unrestricted, paintball is 41.4%, 6th of 80 concepts, not the highest). The catalog
contains no paintball. People click because you showed them *something* — and sometimes they buy
it. That is why no dashboard has ever flagged this: in the numbers it looks like performance.

## The commercial size of it

If every search behaved like the healthy band, the month would have produced roughly 805 more
purchases. Priced at each city's median deal, that is about $74,332 against the $67,325 actually
earned (bootstrap 95% CI $69,556–$80,175).

**Read this before quoting the number.** The search log contains no `deal_id`, so I cannot know
what was actually bought — this uses each city's median deal price as a stand-in and assumes the
healthy-band conversion rate is reachable. The confidence interval covers sampling noise only. It
does not cover either assumption, and neither can be tested with this data. It is a direction of
travel, not a forecast, and the weakest number in this document. None of the six main findings
depend on it.

## The other nine findings

The first six carry the argument above. These nine are real but supplementary — background for
the backlog, not part of the case.

**07 — Results that cannot exist.** 585 searches (6.5%) return more results than the city holds
deals in total. Kraków's entire catalog holds ten deals; searches there returned up to
thirty-five.

**08 — Overload hurts too.** 26–40 results converts at 2.3%, worse than showing just four. Too
many results is its own failure mode, not just too few.

**09 — Catalog nobody searches by name.** Generic package titles (massage, dining, classes)
that appear in zero customer queries verbatim. 159–256 deals depending on definition — see
finding 05.

**10 — Misspellings get results, just wrong ones.** Same result count as clean queries (p = 0.16),
but healthy-band conversion drops from 18.2% to 11.5% (p = 0.0099). Misspelled queries return
something, just not the right something.

**11 — The catalog repeats itself.** 75 titles across 568 deals — a 7.6× repetition ratio.
London alone lists 69 deals under 15 titles.

**12 — One deal in five is rated below 4.0.** 116 of 568 (20.4%), with no visible quality floor
in what gets listed or surfaced.

**13 — Instant booking collapses outside the UK.** 76% of UK deals are instantly bookable against
49% everywhere else (p = 3.2e-08). An operations/merchandising gap, not a search gap.

**14 — False zeroes** *(low confidence — estimate, not a measurement)*. Searches that returned
nothing although matching catalog existed in the city. Estimated at 303–2,508 depending on the
matching definition — an 8× range, reported as a range on purpose.

**15 — False positives** *(low confidence — estimate)*. Results returned where no genuinely
relevant deal exists in that city. Estimated at 303–1,134 — a 4× range, same caveat.

## Prioritization (ICE: Impact × Confidence × Ease)

Six items score highest, and every one of them is solved by the same thing: search that reads
intent, checks real city catalog, and tells the truth about what it found.

| Rank | Finding | Impact | Confidence | Ease | Score |
|---|---|---|---|---|---|
| 1 | 05 — Catalog vocabulary gap | high | high | high | 432 |
| 2 | 07 — Impossible result counts | high | high | high | 420 |
| 3 | 02 — Retrieval ignores catalog | high | high | high | 400 |
| 4 | 04 — Foreign-language conversion | high | high | high | 378 |
| 5 | 03 — Result instability | high | high | med | 360 |
| 6 | 08 — Overload | high | high | med | 360 |
| — | 06 — Missing high-ticket supply | highest | high | **low (Ease 2)** | 200 |

Missing high-ticket supply (finding 06) has the single highest raw impact but the lowest Ease —
it needs new catalog from platform/merchandising teams, not a sprint. It belongs in "what I
need from other teams," not the prototype backlog, and that's exactly what the priority score is
for: a huge, certain problem that can't be touched this quarter should not sit at the top of an
engineering backlog.

## What survived independent validation, unchanged

Step function 0% / 1.7% / 17.8% / 2.3%. Zero-result rate 29.3% (2,633 searches); ≤2 results 52.5%
(4,720). r = +0.02 under three independent definitions of matching catalog. 585 (6.5%) searches
return more results than the city holds deals; Kraków has 10 deals, searches there returned up to
35. High-ticket demand 1,639 (18.2%) always zero (1,565 under strict keyword match). Price ceiling
$179.46, median $91.83. Misspellings: same result count (p = 0.16) but CVR drops 18.2% → 11.5%
(p = 0.0099). Instant booking GB 76% vs rest 49% (p = 3.2e-08). 116 deals (20.4%) rated below 4.0.
75 titles across 568 deals.

## The four corrections

1. **Paintball CTR is not the highest** — 41.4% unrestricted, 6th of 80 concepts. 45.5% only
   holds restricted to searches with ≥1 result.
2. **Trap 02 (Poland) was proved with a statistically weak test.** Rebuilt as a proper controlled
   test; the honest finding is smaller, and runs the other way (GB slightly better, not Poland
   worse).
3. **Revenue estimate: $74,332, not $83,000.** Bootstrap 95% CI $69,556–$80,175 — noise only, not
   validation of the underlying assumptions.
4. **"0 of 282 stable pairs" needed a qualifier.** 411 pairs meet the ≥8-search threshold; 74 of
   those are perfectly stable — and all 74 always return zero. Correct claim: 0 of the 337 pairs
   that ever return anything are stable.

One thing checked and explicitly ruled out: a suspected city-level supply/demand mismatch
(e.g. Manchester ~29 searches per deal vs Gdańsk ~5). Correlation between a city's search volume
and its deal count is r = 0.911 — supply tracks demand almost perfectly across cities. Not a
finding.
