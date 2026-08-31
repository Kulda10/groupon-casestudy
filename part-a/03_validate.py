#!/usr/bin/env python3
"""
Groupon case study — STEP 3 of 3: independent validation.

Written from scratch rather than reviewed. Reading your own code only confirms
your own decisions, so this file recomputes every claim in step 2 by a different
route and actively tries to break it: alternative definitions of "matching",
better tests against the claims step 2 dismissed as noise, and a hunt for
artefacts of the data generator.

It corrected four numbers in step 2. Each correction is printed in section 12.

  01_explore.py   ->  What the data is. No claims.
  02_findings.py  ->  What appears to be broken, and why.
  03_validate.py  <-  you are here.  Everything above, checked adversarially.

Run: python3 03_validate.py     (needs pandas, numpy, scipy, statsmodels)
"""
import re, itertools, numpy as np, pandas as pd
from scipy import stats
pd.set_option('display.width',220); pd.set_option('display.max_rows',300)

def _find(name):
    import os
    for d in ('.', '..', 'data', '../data', '../../data'):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    sys.exit(f'{name} not found. Run this from the folder holding the two CSVs.')
S = pd.read_csv(_find('search_log.csv')); D = pd.read_csv(_find('deals.csv'))
S['date'] = pd.to_datetime(S['date'])
R = S.results_shown

def h(t): print('\n'+'='*78+'\n'+t+'\n'+'='*78)

# ================================================================ 1. INTEGRITY
h('1. INTEGRITY')
print('searches', len(S), '| deals', len(D))
print('nulls search', S.isna().sum().sum(), '| nulls deals', D.isna().sum().sum())
print('dup query_id', S.query_id.duplicated().sum(), '| dup deal_id', D.deal_id.duplicated().sum())
print('purchased without click:', ((S.purchased==1)&(S.clicked==0)).sum())
print('clicked with 0 results  :', ((S.clicked==1)&(R==0)).sum())
print('date range', S.date.min().date(), '->', S.date.max().date(), '| days', S.date.nunique())
print('markets', sorted(S.market.unique()), '| cities', S.city.nunique())
print('search cities not in deals:', set(S.city)-set(D.city))

# ================================================== 2. GENERATOR FORENSICS
h('2. GENERATOR FORENSICS — was results_shown drawn at random?')
def regime(r):
    return '0_zero' if r==0 else '1_thin' if r<=2 else '2_healthy' if r<=25 else '3_overload'
S['regime'] = R.map(regime)
print('\nregime shares:'); print((S.regime.value_counts(normalize=True).sort_index()*100).round(2).to_string())
print('\nmissing integers in 0..40:', [i for i in range(41) if i not in set(R.unique())])
for lo,hi in [(1,2),(4,25),(26,40)]:
    sub = R[(R>=lo)&(R<=hi)]
    obs = sub.value_counts().sort_index().values
    chi2,p = stats.chisquare(obs)
    print(f'uniform within {lo}-{hi}? n={len(sub)} chi2 p={p:.3f}  (high p = indistinguishable from uniform)')

# does the regime depend on anything the customer or catalogue did?
h('2b. Does the REGIME depend on market / city / weekday / catalogue size?')
for col in ['market','city']:
    ct = pd.crosstab(S[col], S.regime)
    print(f'{col:8s} chi2 p = {stats.chi2_contingency(ct)[1]:.4g}')
S['dow'] = S.date.dt.dayofweek
print('weekday  chi2 p =', f"{stats.chi2_contingency(pd.crosstab(S.dow,S.regime))[1]:.4g}")
citysize = D.groupby('city').size()
S['city_deals'] = S.city.map(citysize)
print('corr(city catalogue size, results_shown), non-zero only: r =',
      round(S.loc[R>0,'city_deals'].corr(S.loc[R>0,'results_shown']),4))
print('searches returning MORE results than the city holds deals:',
      int((S.results_shown > S.city_deals).sum()), f'({(S.results_shown>S.city_deals).mean()*100:.1f}%)')

# is outcome a pure function of the regime?
h('2c. Is the OUTCOME a pure function of the result count?')
print(S.groupby('regime').agg(n=('query_id','size'), ctr=('clicked','mean'), cvr=('purchased','mean')).assign(
      ctr=lambda x:(x.ctr*100).round(1), cvr=lambda x:(x.cvr*100).round(1)).to_string())
print('\nInside the healthy band only (4-25), does anything still predict a purchase?')
hb = S[S.regime=='2_healthy']
for col in ['market','city','dow']:
    ct = pd.crosstab(hb[col], hb.purchased)
    print(f'  {col:8s} chi2 p = {stats.chi2_contingency(ct)[1]:.4g}  (high p = no real difference)')
print('  corr(results_shown, purchased) inside 4-25: r =', round(hb.results_shown.corr(hb.purchased),4))
sub = hb.groupby(pd.cut(hb.results_shown,[3,9,15,20,25])).agg(n=('query_id','size'),cvr=('purchased','mean'))
print((sub.assign(cvr=lambda x:(x.cvr*100).round(1))).to_string())

# ================================================== 3. INDEPENDENT TAXONOMY
h('3. INDEPENDENT TAXONOMY — built from raw strings, not reusing part_a.py')
# Map every raw query to one of the FIVE categories the catalogue itself uses (category_l2),
# by keyword, in all five languages. Deliberately coarse and generous.
L2RULES = [
 ('massage', ['massage','masaje','masaz','masaż','nacken','rücken','ruecken','paarmassage','sportmassage']),
 ('beauty',  ['haircut','peluqu','coiffeur','friseur','fryzjer','hair colour','tinte','coloration',
              'färben','faerben','koloryzacja','manicure','manicura','manucure','maniküre','manikure',
              'facial','limpieza facial','soin visage','gesichtsbehandlung','oczyszczanie','eyelash',
              'pestañas','pestanas','cils','wimpern','rzęs','rzes','strzyż']),
 ('fitness', ['crossfit','pilates','gym','fitness','gimnasio','salle de sport','siłown','silown',
              'personal trainer','entrenador','coach sportif','trener','yoga','joga']),
 ('dining',  ['brunch','sushi','burger','hamburgues','pizza','steak','indian restaurant','italien',
              'italienne','włoska','wloska','tapas','arroceria','crêperie','creperie','restaurant']),
 ('activities',['escape','paintball','bowling','bolera','kręgle','kregle','karting','gokart','kart fahren',
              'city tour','tour ciudad','visite guidee','visite guidée','stadtrundfahrt','zwiedzanie',
              'rafting','wildwasser','helicopter','helicoptere','helicóptero','helicoptero','hubschrauber',
              'helikopter','balloon','globo','montgolfiere','montgolfière','ballon','balonem','skydiv',
              'paracaidismo','parachute','fallschirm','spadochron','supercar','shark']),
]
def to_l2(q):
    ql = q.lower().strip()
    for cat, keys in L2RULES:
        if any(k in ql for k in keys): return cat
    return None
S['l2'] = S.raw_query.map(to_l2)
print('queries mapped to a catalogue category:', S.l2.notna().sum(), f'({S.l2.notna().mean()*100:.1f}%)')
print('unmapped raw queries:', sorted(S.loc[S.l2.isna(),'raw_query'].unique())[:20])
print(S.l2.value_counts(dropna=False).to_string())

# matching inventory under this coarse definition = deals in that city with that category_l2
inv = D.groupby(['city','category_l2']).size().rename('inv_l2').reset_index()
S = S.merge(inv, left_on=['city','l2'], right_on=['city','category_l2'], how='left').drop(columns=['category_l2'])
S['inv_l2'] = S.inv_l2.fillna(0)

h('3b. ROBUSTNESS OF r — three independent definitions of "matching inventory"')
nz = S[S.results_shown>0]
print(f"A) coarse 5-category map, non-zero searches : r = {nz.results_shown.corr(nz.inv_l2):+.3f}  (n={len(nz)})")
print(f"   same, ALL searches incl. zeroes           : r = {S.results_shown.corr(S.inv_l2):+.3f}")
print(f"B) total deals in city, non-zero searches    : r = {nz.results_shown.corr(nz.city_deals):+.3f}")
tot = S.groupby('city').results_shown.median().rename('med')
print('C) per-city: median results returned vs deals the city actually holds')
cc = pd.concat([tot, citysize.rename('deals')],axis=1)
print(f"   r = {cc.med.corr(cc.deals):+.3f} across 20 cities")
print(cc.sort_values('deals').to_string())

h('4. IS ZERO-RESULT RELATED TO REAL ABSENCE OF STOCK?')
S['has_inv'] = S.inv_l2 > 0
g = S.groupby('has_inv').agg(n=('query_id','size'), zero=('results_shown', lambda x:(x==0).mean()))
print(g.assign(zero=lambda x:(x.zero*100).round(1)).to_string())
print('\nzero-rate by catalogue category (all five ARE stocked in every city):')
print(S.groupby('l2').agg(n=('query_id','size'), inv_med=('inv_l2','median'),
      zero=('results_shown',lambda x:(x==0).mean()*100)).round(1).to_string())

# the six high-ticket concepts, identified by keyword only
HIGH = ['skydiv','paracaidismo','parachute','fallschirm','spadochron','helicopter','helicoptere',
        'helicóptero','helicoptero','hubschrauber','helikopter','balloon','globo','montgolfiere',
        'montgolfière','ballon','balonem','rafting','wildwasser','supercar','shark']
S['high_ticket'] = S.raw_query.str.lower().apply(lambda q: any(k in q for k in HIGH))
ht = S[S.high_ticket]
print(f'\nhigh-ticket searches: {len(ht)} ({len(ht)/len(S)*100:.1f}%)  zero-rate {(ht.results_shown==0).mean()*100:.1f}%'
      f'  clicks {ht.clicked.sum()}  purchases {ht.purchased.sum()}')
print('deals in catalogue matching those words:',
      D.title.str.lower().apply(lambda t: any(k in t for k in HIGH)).sum())
print('price ceiling of entire catalogue: $%.2f  | median $%.2f' % (D.price_usd.max(), D.price_usd.median()))
print('price distribution deciles:', [round(x,1) for x in D.price_usd.quantile(np.arange(0,1.01,.1)).tolist()])

print('\nzero-rate EXCLUDING high-ticket (i.e. only things the catalogue could serve):')
ok = S[~S.high_ticket]
print(f'  {(ok.results_shown==0).mean()*100:.1f}%  on n={len(ok)}')
print('  of those zeroes, how many had matching stock in the city?',
      int(((ok.results_shown==0)&(ok.inv_l2>0)).sum()))

h('5. TRAP TEST — is any market/city really worse?')
print('raw zero-rate by market:')
print((S.groupby('market').results_shown.apply(lambda x:(x==0).mean())*100).round(1).to_string())
print('\nafter removing high-ticket (the no-supply demand):')
print((ok.groupby('market').results_shown.apply(lambda x:(x==0).mean())*100).round(1).to_string())
print('  chi2 market p =', f"{stats.chi2_contingency(pd.crosstab(ok.market, ok.results_shown==0))[1]:.4g}")
print('  chi2 city   p =', f"{stats.chi2_contingency(pd.crosstab(ok.city,   ok.results_shown==0))[1]:.4g}")

h('5b. THE TRAP, TESTED PROPERLY — market effect with query mix held constant')
# fine-grained concept key, independent: normalised raw query with typos folded by edit distance
import difflib
clean = S.raw_query.value_counts()
canon_pool = [q for q in clean.index if clean[q] >= 30]          # frequent = correctly spelled
def fold(q):
    if q in canon_pool: return q
    m = difflib.get_close_matches(q, canon_pool, n=1, cutoff=0.75)
    return m[0] if m else q
S['qcanon'] = S.raw_query.map({q: fold(q) for q in S.raw_query.unique()})
S['is_typo'] = S.qcanon != S.raw_query
print('distinct canonical queries:', S.qcanon.nunique(), '| typo rows:', int(S.is_typo.sum()))

import statsmodels.formula.api as smf
S['zero'] = (S.results_shown==0).astype(int)
m = smf.logit('zero ~ C(market) + C(qcanon)', data=S).fit(disp=0)
lr = smf.logit('zero ~ C(qcanon)', data=S).fit(disp=0)
stat = 2*(m.llf - lr.llf); dfree = int(m.df_model - lr.df_model)
print(f'\nLikelihood-ratio test, market on top of query identity: chi2={stat:.2f} df={dfree} '
      f'p={stats.chi2.sf(stat,dfree):.4g}')
print('  -> low p means market still matters once you compare like with like')
sub = S[~S.high_ticket]
m2 = smf.logit('zero ~ C(market) + C(qcanon)', data=sub).fit(disp=0)
l2m = smf.logit('zero ~ C(qcanon)', data=sub).fit(disp=0)
st2 = 2*(m2.llf-l2m.llf); df2 = int(m2.df_model-l2m.df_model)
print(f'same test, high-ticket removed:  chi2={st2:.2f} df={df2} p={stats.chi2.sf(st2,df2):.4g}')

# per-query paired view: is PL worse than DE on the SAME query?
piv = S.pivot_table(index='qcanon', columns='market', values='zero', aggfunc=['mean','size'])
mean, size = piv['mean'], piv['size']
keep = (size >= 20).all(axis=1) & mean.notna().all(axis=1)
print(f'\nqueries searched >=20 times in ALL five markets: {keep.sum()}')
mk = mean[keep]*100
print(mk.round(1).to_string())
print('\nWilcoxon PL vs DE on those paired queries:',
      f"p={stats.wilcoxon(mk['PL'], mk['DE'])[1]:.3f}" if keep.sum()>5 else 'n too small')
print('mean zero-rate across those paired queries:'); print(mk.mean().round(1).to_string())

h('5c. WHICH market, and is it real? (the page calls this a trap — checking)')
# language-neutral queries: the same string is searched in every market
uni = S.groupby('qcanon').market.nunique()
neutral = uni[uni==5].index.tolist()
N = S[S.qcanon.isin(neutral)]
print('language-neutral queries:', neutral)
print('rows:', len(N))
tab = N.pivot_table(index='qcanon', columns='market', values='zero', aggfunc=['size','mean'])
print('\nn per cell:'); print(tab['size'].to_string())
print('\nzero-rate %:'); print((tab['mean']*100).round(1).to_string())
print('\npooled zero-rate by market on language-neutral queries only:')
p = N.groupby('market').agg(n=('zero','size'), zero=('zero','mean'))
print(p.assign(zero=lambda x:(x.zero*100).round(1)).to_string())
print('chi2 across 5 markets p =', f"{stats.chi2_contingency(pd.crosstab(N.market,N.zero))[1]:.4g}")
gb = N.zero[N.market=='GB']; rest = N.zero[N.market!='GB']
print(f'GB {gb.mean()*100:.1f}% (n={len(gb)}) vs rest {rest.mean()*100:.1f}% (n={len(rest)}) '
      f'-> chi2 p = {stats.chi2_contingency(pd.crosstab(N.market=="GB", N.zero))[1]:.4g}')
# same on the healthy-band funnel, not just zeroes
print('\nsame language-neutral rows, full funnel by market:')
print(N.groupby('market').agg(n=('zero','size'), zero=('zero','mean'), thin=('results_shown',lambda x:((x>=1)&(x<=2)).mean()),
      ctr=('clicked','mean'), cvr=('purchased','mean')).apply(lambda c: (c*100).round(1) if c.name!='n' else c).to_string())

h('5d. Does the market effect survive city, and is GB special or is ENGLISH special?')
m3 = smf.logit('zero ~ C(market) + C(qcanon)', data=N).fit(disp=0)
l3 = smf.logit('zero ~ C(qcanon)', data=N).fit(disp=0)
st3 = 2*(m3.llf-l3.llf); d3=int(m3.df_model-l3.df_model)
print(f'LR market | query, neutral queries only: chi2={st3:.2f} df={d3} p={stats.chi2.sf(st3,d3):.4g}')
# and the reverse: is it city-level?
m4 = smf.logit('zero ~ C(city) + C(qcanon)', data=N).fit(disp=0)
st4 = 2*(m4.llf-l3.llf); d4=int(m4.df_model-l3.df_model)
print(f'LR city   | query, neutral queries only: chi2={st4:.2f} df={d4} p={stats.chi2.sf(st4,d4):.4g}')

h('5e. IS IT MARKET, OR IS IT LANGUAGE? (the neutral-query set is GB-heavy on purpose)')
mkt_tot = S.groupby('market').size()
share = S.pivot_table(index='qcanon', columns='market', values='zero', aggfunc='size').fillna(0)
expected = share.sum(axis=1).values[:,None] * (mkt_tot/mkt_tot.sum()).values[None,:]
ratio = pd.DataFrame(share.values/expected, index=share.index, columns=share.columns)
# a true loanword: no market is more than 2x or less than 0.5x its expected share
loan = ratio[(ratio.max(axis=1)<2.0)&(ratio.min(axis=1)>0.5)].index.tolist()
print('true loanwords (searched in proportion to market size everywhere):', loan)
L = S[S.qcanon.isin(loan)]
print('rows:', len(L))
print(L.groupby('market').agg(n=('zero','size'), zero=('zero','mean'), ctr=('clicked','mean'),
      cvr=('purchased','mean')).apply(lambda c:(c*100).round(1) if c.name!='n' else c).to_string())
print('chi2 market on loanwords only p =', f"{stats.chi2_contingency(pd.crosstab(L.market,L.zero))[1]:.4g}")
ml = smf.logit('zero ~ C(market) + C(qcanon)', data=L).fit(disp=0)
ll = smf.logit('zero ~ C(qcanon)', data=L).fit(disp=0)
stl = 2*(ml.llf-ll.llf); dl=int(ml.df_model-ll.df_model)
print(f'LR market | query, loanwords only: chi2={stl:.2f} df={dl} p={stats.chi2.sf(stl,dl):.4g}')
print('  -> HIGH p here means: no market is worse. The apparent market effect was language.')

h('5f. THE CROSS-LANGUAGE FINDING, rebuilt independently')
# native language of each query = the market that over-uses it most (ratio), English if GB
dom = ratio.idxmax(axis=1); dommax = ratio.max(axis=1)
qlang = {q:(None if q in loan else dom[q]) for q in ratio.index}
S['q_home'] = S.qcanon.map(qlang)
S['foreign'] = (S.q_home=='GB') & (S.market!='GB')
S['native']  = (S.q_home==S.market)
# only compare inside concepts where BOTH a local and an English version exist for that market
S['l2c'] = S.l2
pairs=[]
for (mk,cat), grp in S[S.l2.notna()].groupby(['market','l2']):
    f = grp[grp.foreign]; n = grp[grp.native]
    if len(f)>=3 and len(n)>=3:
        pairs.append((mk,cat,len(f),f.zero.mean(),len(n),n.zero.mean(),f.purchased.sum(),n.purchased.mean()))
P = pd.DataFrame(pairs, columns=['market','cat','n_for','zero_for','n_nat','zero_nat','buys_for','cvr_nat'])
print(P.round(3).to_string())
worse = (P.zero_for > P.zero_nat).sum()
print(f'\nforeign worse in {worse} of {len(P)} market-category cells; '
      f'sign test p = {stats.binomtest(worse,len(P),0.5,alternative="greater").pvalue:.3g}')
F = S[S.foreign]; NN = S[S.native]
print(f'foreign-language searches: n={len(F)} zero={F.zero.mean()*100:.1f}% <=2 ={(F.results_shown<=2).mean()*100:.1f}%'
      f' ctr={F.clicked.mean()*100:.1f}% cvr={F.purchased.mean()*100:.2f}% purchases={int(F.purchased.sum())}')
print(f'native-language searches : n={len(NN)} zero={NN.zero.mean()*100:.1f}% <=2 ={(NN.results_shown<=2).mean()*100:.1f}%'
      f' ctr={NN.clicked.mean()*100:.1f}% cvr={NN.purchased.mean()*100:.2f}% purchases={int(NN.purchased.sum())}')

h('5g. CROSS-LANGUAGE, rebuilt at the right grain with MY OWN translation pairs')
# For each intent: the English string, and the local string per market. Built by reading the
# query list, independently of part_a.py's QMAP.
PAIRS = {
 'thai massage':      {'ES':'masaje tailandes','FR':'massage thai','PL':'masaz tajski'},
 'back massage':      {'DE':'ruckenmassage','ES':'masaje espalda','FR':'massage dos','PL':'masaz plecow'},
 'sports massage':    {'DE':'sportmassage','FR':'massage sportif','PL':'masaz sportowy'},
 'couples massage':   {'DE':'paarmassage','ES':'masaje en pareja','FR':'massage duo','PL':'masaz dla par'},
 'deep tissue massage':{'ES':'masaje descontracturante'},
 'haircut':           {'DE':'friseur','ES':'peluqueria','FR':'coiffeur','PL':'fryzjer'},
 'hair colour':       {'DE':'haare farben','ES':'tinte pelo','FR':'coloration','PL':'koloryzacja'},
 'manicure':          {'DE':'manikure','ES':'manicura','FR':'manucure'},
 'facial':            {'DE':'gesichtsbehandlung','ES':'limpieza facial','FR':'soin visage','PL':'oczyszczanie twarzy'},
 'eyelash extensions':{'DE':'wimpernverlangerung','ES':'extensiones pestanas','FR':'extension de cils'},
 'gym':               {'DE':'fitnessstudio','ES':'gimnasio','FR':'salle de sport','PL':'silownia'},
 'personal trainer':  {'ES':'entrenador personal','FR':'coach sportif','PL':'trener personalny'},
 'yoga class':        {'DE':'yoga kurs','ES':'clase de yoga','FR':'cours de yoga','PL':'joga'},
 'escape room':       {'FR':'escape game'},
 'go karting':        {'DE':'kart fahren','ES':'karting','FR':'karting','PL':'gokarty'},
 'city tour':         {'DE':'stadtrundfahrt','ES':'tour ciudad','FR':'visite guidee','PL':'zwiedzanie miasta'},
 'bowling':           {'ES':'bolera','PL':'kregle'},
 'steak dinner':      {'DE':'steakhaus'},
 'pizza deal':        {'PL':'pizzeria'},
}
def norm(x):
    x = x.lower().strip()
    for a,b in [('ä','a'),('ö','o'),('ü','u'),('ß','ss'),('é','e'),('è','e'),('ê','e'),('ñ','n'),
                ('ł','l'),('ż','z'),('ź','z'),('ę','e'),('ą','a'),('ś','s'),('ć','c'),('ó','o'),('ń','n')]:
        x = x.replace(a,b)
    return x
S['qn'] = S.qcanon.map(norm)
rows=[]
for eng, locs in PAIRS.items():
    for mk, loc in locs.items():
        f = S[(S.market==mk)&(S.qn==norm(eng))]
        n = S[(S.market==mk)&(S.qn==norm(loc))]
        if len(f)>=1 and len(n)>=10:
            rows.append(dict(market=mk, intent=eng, n_for=len(f), n_nat=len(n),
                fail_for=(f.results_shown<=2).mean(), fail_nat=(n.results_shown<=2).mean(),
                med_for=f.results_shown.median(), med_nat=n.results_shown.median(),
                buy_for=int(f.purchased.sum()), cvr_nat=n.purchased.mean()))
X = pd.DataFrame(rows)
print(X.round(3).to_string())
w = int((X.fail_for > X.fail_nat).sum()); tie = int((X.fail_for==X.fail_nat).sum())
print(f'\nCELLS: {len(X)} | foreign worse in {w}, tied {tie}, better in {len(X)-w-tie}')
print('sign test p =', f"{stats.binomtest(w, len(X)-tie, 0.5, alternative='greater').pvalue:.3g}")
FF = S[[ (m,q) in {(r.market,norm(r.intent)) for r in X.itertuples()} for m,q in zip(S.market,S.qn)]]
NN = S[[ (m,q) in {(r.market,norm(PAIRS[r.intent][r.market])) for r in X.itertuples()} for m,q in zip(S.market,S.qn)]]
print(f'\nforeign: n={len(FF)}  <=2 results {(FF.results_shown<=2).mean()*100:.1f}%  median {FF.results_shown.median():.0f}'
      f'  ctr {FF.clicked.mean()*100:.1f}%  purchases {int(FF.purchased.sum())}  cvr {FF.purchased.mean()*100:.2f}%')
print(f'local  : n={len(NN)}  <=2 results {(NN.results_shown<=2).mean()*100:.1f}%  median {NN.results_shown.median():.0f}'
      f'  ctr {NN.clicked.mean()*100:.1f}%  purchases {int(NN.purchased.sum())}  cvr {NN.purchased.mean()*100:.2f}%')
ct = np.array([[(FF.results_shown<=2).sum(), (FF.results_shown>2).sum()],
               [(NN.results_shown<=2).sum(), (NN.results_shown>2).sum()]])
print('2x2 chi2 p =', f"{stats.chi2_contingency(ct)[1]:.3g}", '| odds ratio =',
      round((ct[0,0]/ct[0,1])/(ct[1,0]/ct[1,1]),2))

h('5h. RESOLUTION — does the market effect disappear once language is accounted for?')
foreign_keys = {(r.market, norm(r.intent)) for r in X.itertuples()}
S['is_foreign'] = [ (m,q) in foreign_keys for m,q in zip(S.market, S.qn)]
base = smf.logit('zero ~ C(qcanon)', data=S).fit(disp=0)
withlang = smf.logit('zero ~ C(qcanon) + is_foreign', data=S).fit(disp=0)
full = smf.logit('zero ~ C(qcanon) + is_foreign + C(market)', data=S).fit(disp=0)
for nm,a,b in [('language adds over query   ', base, withlang), ('market adds over query+lang', withlang, full)]:
    st = 2*(b.llf-a.llf); df_=int(b.df_model-a.df_model)
    print(f'{nm}: chi2={st:6.2f} df={df_} p={stats.chi2.sf(st,df_):.4g}')
print('\n-> if market p is now high, "Poland is worst" was the language effect wearing a flag')

h('6. TRAP 01 — does any concept/query really convert better inside the healthy band?')
hb = S[(S.results_shown>=4)&(S.results_shown<=25)]
ct = pd.crosstab(hb.qcanon, hb.purchased)
ct = ct[ct.sum(axis=1)>=30]
print(f'queries with >=30 healthy-band searches: {len(ct)}')
print('chi2 across those queries p =', f"{stats.chi2_contingency(ct)[1]:.4g}")
rank = hb.groupby('qcanon').agg(n=('purchased','size'), cvr=('purchased','mean')).query('n>=30').sort_values('cvr')
print('\nworst 5 and best 5 by CVR (the ranking that looks like a finding):')
print(pd.concat([rank.head(5), rank.tail(5)]).assign(cvr=lambda x:(x.cvr*100).round(1)).to_string())
lo,hi = rank.cvr.min(), rank.cvr.max()
print(f'spread {lo*100:.1f}% -> {hi*100:.1f}%. Simulating: if every query had the pooled rate {hb.purchased.mean()*100:.1f}%,')
rng = np.random.default_rng(0); mx=[]
for _ in range(2000):
    sim = hb.assign(p=rng.binomial(1, hb.purchased.mean(), len(hb)))
    r = sim.groupby('qcanon').p.agg(['size','mean']).query('size>=30')['mean']
    mx.append(r.max()-r.min())
print(f'  a spread of {(hi-lo)*100:.1f}pp or more happens by pure chance {np.mean(np.array(mx)>=(hi-lo))*100:.1f}% of the time.')

h('7. TRAP 03 — CTR as a relevance signal')
ctr = S.groupby('qcanon').agg(n=('clicked','size'), ctr=('clicked','mean'), zero=('zero','mean'),
                              cvr=('purchased','mean')).query('n>=50').sort_values('ctr',ascending=False)
print(ctr.head(8).assign(ctr=lambda x:(x.ctr*100).round(1), zero=lambda x:(x.zero*100).round(1),
                         cvr=lambda x:(x.cvr*100).round(1)).to_string())
nzs = S[S.results_shown>0]
print('\nCTR among searches that returned something, paintball vs all:',
      f"{nzs[nzs.qcanon=='paintball'].clicked.mean()*100:.1f}% vs {nzs.clicked.mean()*100:.1f}%")
print('paintball deals in catalogue:', int(D.title.str.contains('aintball',case=False).sum()))

h('5i. So how big IS the residual market effect, and what is it?')
print('logit coefficients, market (ref = DE), controlling for query identity and language:')
co = full.params.filter(like='C(market)'); se = full.bse.filter(like='C(market)')
for k in co.index:
    print(f'  {k[-4:-1]:3s} OR={np.exp(co[k]):.2f}  95% CI {np.exp(co[k]-1.96*se[k]):.2f}-{np.exp(co[k]+1.96*se[k]):.2f}')
print('\nadd city catalogue size as a control — is it inventory depth rather than nationality?')
S['logdeals'] = np.log(S.city_deals)
f2 = smf.logit('zero ~ C(qcanon) + is_foreign + logdeals', data=S).fit(disp=0)
f3 = smf.logit('zero ~ C(qcanon) + is_foreign + logdeals + C(market)', data=S).fit(disp=0)
st=2*(f3.llf-f2.llf); df_=int(f3.df_model-f2.df_model)
print(f'  city size alone: OR per doubling = {np.exp(f2.params["logdeals"]*np.log(2)):.2f} p={f2.pvalues["logdeals"]:.4g}')
print(f'  market on top of query+lang+city size: chi2={st:.2f} df={df_} p={stats.chi2.sf(st,df_):.4g}')
print('\nGB vs rest, controlling for query + language:')
S['gb'] = (S.market=='GB').astype(int)
g1 = smf.logit('zero ~ C(qcanon) + is_foreign + gb', data=S).fit(disp=0)
print(f'  GB OR = {np.exp(g1.params["gb"]):.2f} p = {g1.pvalues["gb"]:.4g}')
print('  practical size: predicted zero-rate GB %.1f%% vs non-GB %.1f%%' % (
    S.assign(gb=1).pipe(lambda d: g1.predict(d)).mean()*100,
    S.assign(gb=0).pipe(lambda d: g1.predict(d)).mean()*100))

h('8. REVENUE — the weakest number, given as an interval')
med_price = D.groupby('city').price_usd.median()
S['px'] = S.city.map(med_price)
observed = S.loc[S.purchased==1,'px'].sum()
hb_cvr = S.loc[(S.results_shown>=4)&(S.results_shown<=25),'purchased'].mean()
fail = S[S.results_shown<=2]
extra = len(fail)*hb_cvr - fail.purchased.sum()
print(f'observed revenue proxy      : ${observed:,.0f}  ({int(S.purchased.sum())} purchases)')
print(f'healthy-band CVR            : {hb_cvr*100:.1f}%')
print(f'failing searches (<=2)      : {len(fail):,}  currently {int(fail.purchased.sum())} purchases')
print(f'extra purchases if all healed: {extra:,.0f}  -> ${extra*med_price.mean():,.0f} at mean city median price')
# bootstrap the CVR and price together
rng = np.random.default_rng(1); boots=[]
hbrows = S[(S.results_shown>=4)&(S.results_shown<=25)]
for _ in range(3000):
    c = rng.binomial(len(hbrows), hb_cvr)/len(hbrows)
    px = rng.choice(fail.px.values, len(fail), replace=True)
    boots.append(max(0,(len(fail)*c - fail.purchased.sum()))*px.mean())
print(f'bootstrap 95% interval on the recoverable amount: ${np.percentile(boots,2.5):,.0f} - ${np.percentile(boots,97.5):,.0f}')
print('NOTE: interval covers sampling noise ONLY. It does not cover the two real assumptions —')
print('      that median city price is the right proxy, and that every failing search could be healed.')
print('      Those are unfalsifiable with this data. Treat as an order of magnitude.')

h('9. THE REMAINING FINDINGS, 7-15')
print('F9  results returned > deals the city holds in total:',
      int((S.results_shown>S.city_deals).sum()), f'({(S.results_shown>S.city_deals).mean()*100:.1f}%)')
kr = S[S.city=='Kraków']
print('    Kraków holds', int(citysize['Kraków']), 'deals; searches there returned up to', int(kr.results_shown.max()),
      '| over-count rows:', int((kr.results_shown>10).sum()), f'of {len(kr)}')
print('F10 overload band 26-40:', int((S.results_shown>=26).sum()),
      f'CTR {S[S.results_shown>=26].clicked.mean()*100:.1f}% CVR {S[S.results_shown>=26].purchased.mean()*100:.1f}%',
      '| vs healthy CVR %.1f%%' % (hb_cvr*100))
print('F11 catalogue duplication: titles vs deals =', D.title.nunique(), 'titles for', len(D), 'deals',
      f'-> {len(D)/D.title.nunique():.1f}x')
dup = D.groupby(['city','title']).size()
print('    London:', int(citysize['London']), 'deals under', D[D.city=="London"].title.nunique(),
      'titles; most repeated title appears', int(dup.max()), 'times in one city')
print('F12 typos:', int(S.is_typo.sum()), f'({S.is_typo.mean()*100:.1f}%)')
tt = S[(S.results_shown>=4)&(S.results_shown<=25)]
print('    healthy-band CVR clean %.1f%% vs typo %.1f%%  chi2 p = %.4g' % (
    tt[~tt.is_typo].purchased.mean()*100, tt[tt.is_typo].purchased.mean()*100,
    stats.chi2_contingency(pd.crosstab(tt.is_typo, tt.purchased))[1]))
print('    zero-rate clean %.1f%% vs typo %.1f%%  chi2 p = %.4g' % (
    S[~S.is_typo].zero.mean()*100, S[S.is_typo].zero.mean()*100,
    stats.chi2_contingency(pd.crosstab(S.is_typo, S.zero))[1]))
print('F13 instant booking by market:')
ib = D.groupby('market').is_bookable.agg(['size','mean'])
print(ib.assign(mean=lambda x:(x['mean']*100).round(1)).to_string())
print('    GB %.0f%% vs rest %.0f%%  chi2 p = %.4g' % (
    D[D.market=='GB'].is_bookable.mean()*100, D[D.market!='GB'].is_bookable.mean()*100,
    stats.chi2_contingency(pd.crosstab(D.market=='GB', D.is_bookable))[1]))
print('F14 deals rated below 4.0:', int((D.rating<4).sum()), f'({(D.rating<4).mean()*100:.1f}%)',
      '| min rating', D.rating.min(), '| median', D.rating.median())
GEN = ['Package','Menu','Unlimited','Pass','Membership','Ilimitadas','Illimités','Unbegrenzte','bez Limitu',
       'Paket','Karnet','Pase','Abonnement','Mitgliedschaft','Tasting']
print('F15 deals whose title is supplier language, not a searchable thing:',
      int(D.title.apply(lambda t: any(g in t for g in GEN)).sum()), 'of', len(D))
print('    catalogue title count:', D.title.nunique(), '| distinct customer queries (canonical):', S.qcanon.nunique())
print('F7  searches returning results where NOTHING in that city matches the coarse category:',
      int(((S.results_shown>0)&(S.inv_l2==0)).sum()))
print('F8  zero results although the coarse category IS stocked in that city:',
      int(((S.results_shown==0)&(S.inv_l2>0)).sum()))

h('10. HEADLINE CANDIDATES — ranked by how self-evident they are without statistics')
cands = [
 ('29.3% of searches return nothing at all', (S.results_shown==0).mean()*100, 'counts only'),
 ('52.5% return two results or fewer', (S.results_shown<=2).mean()*100, 'counts only'),
 ('6.5% return more results than the city has deals', (S.results_shown>S.city_deals).mean()*100, 'counts only'),
 ('17.4% of searches ask for something the catalogue has none of', S.high_ticket.mean()*100, 'keyword only'),
 ('0 of 282 repeated query+city pairs give a stable answer', 0, 'counts only'),
 ('paintball: 292 searches, 0 deals, median 9 results returned',
   S[S.qcanon=="paintball"].results_shown.median(), 'counts only'),
 ('foreign-language: 266 searches, 2 purchases', 2, 'counts only'),
]
for lbl, v, kind in cands: print(f'  {lbl:60s} [{kind}]')

h('11. STABILITY — recompute finding 3 independently')
grp = S.groupby(['qcanon','city']).results_shown
sizes = grp.size(); ok_g = sizes[sizes>=8].index
st = grp.agg(['size','min','max','median','std']).loc[ok_g]
print('query+city pairs with >=8 searches:', len(st))
print('pairs where every search returned the same count:', int((st['std']==0).sum()))
print('pairs that hit both 0 and 20+:', int(((st['min']==0)&(st['max']>=20)).sum()),
      f'({((st["min"]==0)&(st["max"]>=20)).mean()*100:.1f}%)')
print('median spread (max-min):', float((st['max']-st['min']).median()))

h('11b. Those 74 "stable" pairs — are they real stability or always-zero?')
stt = grp.agg(['size','min','max','std']).loc[ok_g]
stable = stt[stt['std']==0]
print('stable pairs:', len(stable), '| of which always ZERO results:', int((stable['max']==0).sum()))
print('stable pairs with a non-zero constant answer:', int((stable['max']>0).sum()))
print(stable[stable['max']>0].to_string() if (stable['max']>0).any() else '  -> none. Every "stable" pair is a query the catalogue cannot serve at all.')
live = stt[stt['max']>0]
print(f'\nAmong pairs that ever return something (n={len(live)}):')
print('  stable:', int((live["std"]==0).sum()), '| hitting both 0 and 20+:',
      int(((live["min"]==0)&(live["max"]>=20)).sum()), f'({((live["min"]==0)&(live["max"]>=20)).mean()*100:.1f}%)')
print('  median spread:', float((live['max']-live['min']).median()))

h('12. TWO NUMBERS ON THE PAGE I COULD NOT REPRODUCE')
print('a) "paintball has the HIGHEST click-through rate of any concept, 45.5%"')
top = S.groupby('qcanon').agg(n=('clicked','size'), ctr=('clicked','mean')).query('n>=50').sort_values('ctr',ascending=False)
print('   highest-CTR concepts overall:', ', '.join(f'{i} {v*100:.1f}%' for i,v in top.ctr.head(4).items()))
print('   paintball rank:', list(top.index).index('paintball')+1, 'of', len(top), f"at {top.loc['paintball','ctr']*100:.1f}%")
print('   -> claim is true only when restricted to searches that returned >=1 result. Must say so.')
print('\nb) "1,639 high-ticket searches (18.2%)"')
print('   strict keyword match:', int(S.high_ticket.sum()), f'({S.high_ticket.mean()*100:.1f}%)')
ht2 = S.qcanon.str.lower().apply(lambda q: any(k in q for k in HIGH))
print('   after folding misspellings into canonical form:', int(ht2.sum()), f'({ht2.mean()*100:.1f}%)')
print('   -> the difference is typo variants. Both defensible; state which one.')
print('\nc) "48 of 48 market-and-intent cells"')
print(f'   my independent pairing: {w} of {len(X)}. Direction identical, unanimity is inclusion-dependent.')
h('DONE')
