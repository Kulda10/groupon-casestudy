#!/usr/bin/env python3
"""
Groupon case study — STEP 1 of 3: exploratory data analysis.

This script makes no claims and maps nothing. It describes what the two files
contain, so that anyone can see the raw shape of the data before any judgement
of mine is applied to it.

  01_explore.py   <- you are here.  What the data is.
  02_findings.py  ->                What appears to be broken, and why.
  03_validate.py  ->                An independent attempt to break 02.

Run: python3 01_explore.py       (needs pandas, numpy)
"""
import sys, os, numpy as np, pandas as pd

pd.set_option('display.width', 200)
pd.set_option('display.max_rows', 120)
pd.set_option('display.float_format', lambda v: f'{v:,.2f}')

def h(t):   print('\n' + '=' * 74 + '\n' + t + '\n' + '=' * 74)
def s(t):   print('\n--- ' + t + ' ' + '-' * max(0, 66 - len(t)))

def find(name):
    for d in ('.', '..', 'data', '../data', '../../data'):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    sys.exit(f'{name} not found. Run this from the folder holding the two CSVs.')

S = pd.read_csv(find('search_log.csv'))
D = pd.read_csv(find('deals.csv'))

# ============================================================ 1. WHAT WE HAVE
h('1. THE TWO FILES')
for name, df in [('search_log.csv', S), ('deals.csv', D)]:
    print(f'\n{name}: {len(df):,} rows x {len(df.columns)} columns')
    prof = pd.DataFrame({
        'dtype':   df.dtypes.astype(str),
        'nulls':   df.isna().sum(),
        'unique':  df.nunique(),
        'example': [df[c].dropna().iloc[0] if df[c].notna().any() else '' for c in df.columns],
    })
    print(prof.to_string())

s('First three rows of each')
print(S.head(3).to_string(index=False))
print()
print(D.head(3).to_string(index=False))

# ==================================================== 2. INTEGRITY, NOT OPINION
h('2. INTEGRITY CHECKS')
checks = [
    ('rows in search_log',                 len(S)),
    ('rows in deals',                      len(D)),
    ('null cells anywhere in search_log',  int(S.isna().sum().sum())),
    ('null cells anywhere in deals',       int(D.isna().sum().sum())),
    ('duplicate query_id',                 int(S.query_id.duplicated().sum())),
    ('duplicate deal_id',                  int(D.deal_id.duplicated().sum())),
    ('fully duplicated search rows',       int(S.duplicated().sum())),
    ('purchases without a click',          int(((S.purchased == 1) & (S.clicked == 0)).sum())),
    ('clicks on a zero-result search',     int(((S.clicked == 1) & (S.results_shown == 0)).sum())),
    ('clicked values outside {0,1}',       int((~S.clicked.isin([0, 1])).sum())),
    ('purchased values outside {0,1}',     int((~S.purchased.isin([0, 1])).sum())),
    ('negative result counts',             int((S.results_shown < 0).sum())),
    ('cities in the log but not in deals', len(set(S.city) - set(D.city))),
    ('cities in deals but not in the log', len(set(D.city) - set(S.city))),
]
for label, v in checks:
    print(f'  {label:<38} {v:>10,}')

# ========================================================== 3. COVERAGE / SHAPE
h('3. WHAT PERIOD, WHICH MARKETS, WHICH CITIES')
S['date'] = pd.to_datetime(S['date'])
print(f'date range      {S.date.min().date()}  ->  {S.date.max().date()}   ({S.date.nunique()} distinct days)')
print(f'searches / day  min {S.groupby("date").size().min()}   '
      f'median {S.groupby("date").size().median():.0f}   max {S.groupby("date").size().max()}')

s('Searches and deals side by side')
cov = pd.DataFrame({
    'searches': S.groupby('market').size(),
    'cities':   S.groupby('market').city.nunique(),
    'deals':    D.groupby('market').size(),
})
cov['searches_per_deal'] = cov.searches / cov.deals
print(cov.to_string())

s('By city')
bycity = pd.DataFrame({
    'searches': S.groupby('city').size(),
    'deals':    D.groupby('city').size(),
}).sort_values('deals')
bycity['searches_per_deal'] = bycity.searches / bycity.deals
print(bycity.to_string())

# ============================================================ 4. THE QUERIES
h('4. WHAT PEOPLE TYPED')
print(f'distinct raw query strings   {S.raw_query.nunique():,}')
print(f'searches per distinct string median {S.raw_query.value_counts().median():.0f}, '
      f'max {S.raw_query.value_counts().max()}')
print(f'strings searched only once   {(S.raw_query.value_counts() == 1).sum()}')

s('Twenty most common queries')
top = S.raw_query.value_counts().head(20).rename('searches').to_frame()
top['markets'] = [S.loc[S.raw_query == q, 'market'].nunique() for q in top.index]
print(top.to_string())

s('Query length in characters')
print(S.raw_query.str.len().describe().to_string())

# ======================================================= 5. THE RESULT COUNTS
h('5. HOW MANY RESULTS CAME BACK')
r = S.results_shown
print(r.describe().to_string())
print(f'\nmin {r.min()}  max {r.max()}')
print(f'values that never occur between 0 and {r.max()}: '
      f'{[i for i in range(r.max() + 1) if i not in set(r.unique())]}')

s('Full distribution')
vc = r.value_counts().sort_index()
for v, n in vc.items():
    bar = '#' * max(1, round(n / vc.max() * 46))
    print(f'  {v:>3}  {n:>6,}  {n/len(S)*100:>5.1f}%  {bar}')

s('Grouped into the four contiguous blocks the data forms')
def block(v):
    return 'A  0 results' if v == 0 else 'B  1-2' if v <= 2 else 'C  4-25' if v <= 25 else 'D  26-40'
S['block'] = r.map(block)
g = S.groupby('block').agg(searches=('query_id', 'size'),
                           clicked=('clicked', 'mean'),
                           purchased=('purchased', 'mean'))
g['share_%']  = (g.searches / len(S) * 100).round(1)
g['CTR_%']    = (g.clicked * 100).round(1)
g['CVR_%']    = (g.purchased * 100).round(1)
print(g[['searches', 'share_%', 'CTR_%', 'CVR_%']].to_string())

# ============================================================== 6. THE FUNNEL
h('6. THE FUNNEL, WHOLE MONTH')
print(f'searches   {len(S):,}')
print(f'clicks     {int(S.clicked.sum()):,}   ({S.clicked.mean()*100:.1f}% of searches)')
print(f'purchases  {int(S.purchased.sum()):,}   ({S.purchased.mean()*100:.1f}% of searches, '
      f'{S.purchased.sum()/max(S.clicked.sum(),1)*100:.1f}% of clicks)')

s('By market')
m = S.groupby('market').agg(searches=('query_id', 'size'), CTR=('clicked', 'mean'),
                            CVR=('purchased', 'mean'), median_results=('results_shown', 'median'))
m['zero_%'] = S.groupby('market').results_shown.apply(lambda x: (x == 0).mean() * 100).round(1)
m['CTR'] = (m.CTR * 100).round(1); m['CVR'] = (m.CVR * 100).round(1)
print(m.to_string())

s('By day of week')
S['weekday'] = S.date.dt.day_name()
order = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
w = S.groupby('weekday').agg(searches=('query_id','size'), CTR=('clicked','mean'),
                             CVR=('purchased','mean')).reindex(order)
w['CTR'] = (w.CTR*100).round(1); w['CVR'] = (w.CVR*100).round(1)
print(w.to_string())

# =========================================================== 7. THE CATALOGUE
h('7. WHAT IS ON THE SHELF')
print(f'deals {len(D):,}   distinct titles {D.title.nunique()}   '
      f'-> {len(D)/D.title.nunique():.1f} deals per title')

s('Category structure')
print(pd.crosstab(D.category_l1, D.category_l2).to_string())

s('Every distinct title, with how many deals carry it')
tt = D.title.value_counts().rename('deals').to_frame()
tt['cities'] = [D.loc[D.title == t, 'city'].nunique() for t in tt.index]
print(tt.to_string())

s('Prices (USD, as labelled in the file)')
print(D.price_usd.describe().to_string())
print('\ndeciles:', [round(v, 2) for v in D.price_usd.quantile(np.arange(0, 1.01, .1))])
print(f'\ndeals above $150  {(D.price_usd > 150).sum()}')
print(f'deals above $175  {(D.price_usd > 175).sum()}')
print(f'most expensive    ${D.price_usd.max():.2f}')

s('Ratings and bookability')
print(D.rating.describe().to_string())
print(f'\nrated below 4.0   {(D.rating < 4).sum()} of {len(D)}  ({(D.rating < 4).mean()*100:.1f}%)')
print(f'instantly bookable {int(D.is_bookable.sum())} of {len(D)}  ({D.is_bookable.mean()*100:.1f}%)')
print('\nbookable by market:')
print((D.groupby('market').is_bookable.mean() * 100).round(1).to_string())

# ==================================================== 8. WHAT IS *NOT* IN HERE
h('8. WHAT THESE FILES DO NOT CONTAIN')
print("""Listed because it bounds every conclusion drawn in step 2.

  no deal_id on a search   we know HOW MANY results appeared, never WHICH ones,
                           and never what was bought
  no user_id or session    a customer who searched, got nothing, retyped and then
                           bought appears as two unrelated rows
  no position or ranking   nothing about the order results were shown in
  no timestamp beyond day  no time of day, no ordering within a day
  no coordinates           no distances, so "the next city over" cannot be computed
  no currency field        prices are labelled USD across five non-US markets
  no relevance label       nothing states whether a result was correct. Step 2 has
                           to define that, and that definition is a judgement.""")

h('END OF STEP 1 — nothing above is an interpretation. Step 2 begins the argument.')
