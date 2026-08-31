# Groupon case study — Senior Product Manager, AI (Discovery, International)

Ondřej Kulatka · ref R29944

**The submission is one page: <https://kulda10.github.io/groupon-casestudy/>** — Part A (what is broken), Part B (a working
prototype you can type into), Part C (the writeup) and the log. Everything in this repo is the
working behind it.

Nothing here is quoted from memory. Every figure on the page is produced by the scripts below from
`data/search_log.csv` and `data/deals.csv` exactly as they were supplied.

---

## Run Part A

Two CSVs, three scripts, in order. No API key — there isn't one to include.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
python3 part-a/01_explore.py      # profile, integrity checks, what the files cannot tell us
python3 part-a/02_findings.py     # the fifteen findings and the three traps
python3 part-a/03_validate.py     # an independent rewrite that tries to break them
```

The scripts find the CSVs whether you run them from the repo root or from `part-a/`. Each one's
output is committed beside it (`*_output.txt`), and **all three reproduce theirs byte for byte** —
so you can diff your run against mine, or read mine without running anything. `03_validate.py`
takes a couple of minutes; the other two are seconds.

`03_validate.py` is not a refactor of `02_findings.py` — it was written from scratch, deliberately,
to break the first pass. It broke four of nineteen claims. Those four, and what was wrong with them,
are in [`part-a/DEEP_DIVE.md`](part-a/DEEP_DIVE.md).

## Check Part B

The prototype's retrieval engine, with its invariants asserted against the full log:

```bash
node part-b/test_engine.js        # 187 checks; exits non-zero on any failure
```

That covers the inventory cap over all 1,308 query-and-city pairs, determinism, provenance of every
deal id, and that all 8,997 logged searches get one of the eight answers — plus the acceptance
queries and an adversarial typing list.

To rebuild from the CSVs and re-splice the page:

```bash
python3 part-b/build_prototype_data.py   # CSVs  -> part-b/prototype_data.json
python3 part-b/build_page.py             # engine + interface -> index.html
```

---

## What is where

| | |
|---|---|
| `index.html` | The page. One self-contained file — no build step, no dependencies. |
| `data/` | The two supplied CSVs, unmodified, plus `searches_classified.csv` (the same log with a segment label per row, for row-by-row checking). |
| `part-a/` | The three scripts, their committed output, and **[`DEEP_DIVE.md`](part-a/DEEP_DIVE.md)** — the fuller write-up: method, all fifteen findings, the three traps, the ICE ranking and the four corrections. |
| `part-b/` | The prototype: data build, engine, tests, interface. **[`PRD.md`](part-b/PRD.md)** is what it was built to, **[`FINDINGS_TO_BEHAVIOUR.md`](part-b/FINDINGS_TO_BEHAVIOUR.md)** ties every behaviour to the finding it answers, **[`README.md`](part-b/README.md)** records where the build differs from the PRD and why. |

## Two notes on method

**The two tables have no row-level key.** `search_log.csv` carries no `deal_id`, so no search can be
attributed to a specific deal, and no `user_id`, so no two rows can be attributed to the same person.
Nothing in the analysis or the prototype claims otherwise — the page states the limits at the same
size as the findings.

**The prototype's OLD pane is a replay, not a simulation.** Where a query appears in the June log it
shows the result counts that were actually recorded, and names the `query_id` so you can find the row
in the CSV. Which deals were shown is not in the data, and the pane says so rather than inventing them.
