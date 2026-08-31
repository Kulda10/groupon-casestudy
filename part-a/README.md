# The analysis, in three steps

Three scripts, meant to be read in order. The order is the argument: describe the
data, then interpret it, then attack the interpretation.

```
python3 01_explore.py    > 01_explore_output.txt      # 378 lines out
python3 02_findings.py   > 02_findings_output.txt     # 172 lines out
python3 03_validate.py   > 03_validate_output.txt     # 547 lines out
```

Both CSVs are used exactly as they shipped — no cleaning, no outlier removal, no
reweighting. Each script looks for `search_log.csv` and `deals.csv` in the current
folder, then one level up.

Requires `pandas`, `numpy`, `scipy` and `statsmodels`.

---

## 01_explore.py — what the data is

No claims, no mapping, no interpretation. It profiles both files so anyone can see
the raw shape before any judgement of mine is applied.

- Column-by-column profile of both files: types, nulls, cardinality, an example value
- Fourteen integrity checks (duplicate ids, purchases without clicks, cities present
  in one file but not the other, values outside their allowed range)
- Coverage: the period, the five markets, the twenty cities, searches per deal
- The queries: 613 distinct strings, the twenty most common, length distribution
- **The result counts, as a full ASCII histogram.** This is where the shape of the
  data becomes visible without anyone arguing about it
- The funnel for the whole month, by market and by weekday
- The catalogue: category structure, all 75 distinct titles, prices, ratings, bookability
- A closing section listing **what these files do not contain** — this bounds every
  conclusion drawn in step 2

Two things in this output do most of the work later, and neither needs an opinion
to see: the value `results_shown = 3` never occurs, and inside each block of values
the counts are flat.

## 02_findings.py — what appears to be broken

Where interpretation starts, and it starts with a judgement stated out loud: nothing
in the data says whether a result was *correct*. So this script builds a
query → intent → inventory map by hand, prints it in full, and derives the fifteen
findings from it. Every line of that map can be disputed.

Prints every figure quoted in Part A, plus the three claims the data invites you to
make that do not survive a significance test.

## 03_validate.py — everything above, checked adversarially

Written from scratch rather than reviewed, because reading your own code only confirms
your own decisions. It recomputes every claim in step 2 by a different route and tries
to break it:

- The core correlation under **three independent definitions** of "a matching deal",
  including the catalogue's own category field and no mapping at all
- Forensics on the data generator, to test whether a finding is a real signal or an
  artefact of how the file was produced
- Better tests against the differences step 2 dismissed as noise, in case they were
  dismissed for the wrong reason
- The cross-language finding rebuilt from an independently written translation list
- A bootstrap interval on the revenue estimate, and a simulation replacing a p-value
  with something a non-statistician can check

**It corrected four numbers in step 2.** They are printed in section 12 of its output,
and they are listed in the case study's own log rather than quietly fixed.
