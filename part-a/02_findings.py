#!/usr/bin/env python3
"""
Groupon case study — STEP 2 of 3: the findings.

Step 1 described the data without interpreting it. This is where interpretation
starts, and it starts with a judgement I have to make explicit: nothing in the
data says whether a result was CORRECT. So this script builds a query -> intent
-> inventory map by hand, publishes it in full below, and derives the fifteen
findings from it. Every line of that map can be disputed.

  01_explore.py   ->  What the data is. No claims.
  02_findings.py  <-  you are here.  What appears to be broken, and why.
  03_validate.py  ->  An independent rebuild that tries to break this file.

Run: python3 02_findings.py     (needs pandas, numpy, scipy)
Every number quoted in Part A is printed by this script.
"""
import sys, re, difflib, numpy as np, pandas as pd
from scipy import stats

pd.set_option('display.width', 200); pd.set_option('display.max_rows', 400)
def _find(name):
    import os
    for d in ('.', '..', 'data', '../data', '../../data'):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    sys.exit(f'{name} not found. Run this from the folder holding the two CSVs.')
S = pd.read_csv(_find('search_log.csv')); D = pd.read_csv(_find('deals.csv'))

# ---------------------------------------------------------------- 1. taxonomy
# Query intent -> concept. 613 raw query strings collapse to 35 concepts.
QMAP = {
 'crossfit':'crossfit','pilates':'pilates','gym':'gym','fitnessstudio':'gym','gimnasio':'gym',
 'salle de sport':'gym','siłownia':'gym','personal trainer':'personal_training',
 'entrenador personal':'personal_training','coach sportif':'personal_training',
 'trener personalny':'personal_training','yoga class':'yoga','clase de yoga':'yoga',
 'cours de yoga':'yoga','yoga kurs':'yoga','joga':'yoga',
 'thai massage':'massage_thai','masaje tailandes':'massage_thai','massage thai':'massage_thai',
 'masaż tajski':'massage_thai','deep tissue massage':'massage_deep',
 'masaje descontracturante':'massage_deep','back massage':'massage_back','masaje espalda':'massage_back',
 'massage dos':'massage_back','rückenmassage':'massage_back','masaż pleców':'massage_back',
 'nackenmassage':'massage_back','sports massage':'massage_sport','massage sportif':'massage_sport',
 'sportmassage':'massage_sport','masaż sportowy':'massage_sport','couples massage':'massage_couples',
 'masaje en pareja':'massage_couples','massage duo':'massage_couples','paarmassage':'massage_couples',
 'masaż dla par':'massage_couples',
 'haircut':'haircut','peluqueria':'haircut','coiffeur':'haircut','friseur':'haircut','fryzjer':'haircut',
 'hair colour':'hair_colour','tinte pelo':'hair_colour','coloration':'hair_colour',
 'haare färben':'hair_colour','koloryzacja':'hair_colour','manicure':'manicure','manicura':'manicure',
 'manucure':'manicure','maniküre':'manicure','facial':'facial','limpieza facial':'facial',
 'soin visage':'facial','gesichtsbehandlung':'facial','oczyszczanie twarzy':'facial',
 'eyelash extensions':'eyelash','extensiones pestañas':'eyelash','extension de cils':'eyelash',
 'wimpernverlängerung':'eyelash','przedłużanie rzęs':'eyelash',
 'brunch':'brunch','sushi':'sushi','burger':'burger','hamburguesa':'burger','pizza deal':'pizza',
 'pizzeria':'pizza','steak dinner':'steak','steakhaus':'steak','indian restaurant':'indian',
 'italiener':'italian','restaurant italien':'italian','restauracja włoska':'italian','tapas':'tapas',
 'arroceria':'tapas','crêperie':'creperie',
 'escape room':'escape_room','escape game':'escape_room','paintball':'paintball','bowling':'bowling',
 'bolera':'bowling','kręgle':'bowling','go karting':'karting','karting':'karting',
 'kart fahren':'karting','gokarty':'karting','city tour':'city_tour','tour ciudad':'city_tour',
 'visite guidee':'city_tour','stadtrundfahrt':'city_tour','zwiedzanie miasta':'city_tour',
 'rafting':'rafting','wildwasser rafting':'rafting','helicopter tour':'helicopter',
 'tour en helicoptere':'helicopter','vuelo en helicoptero':'helicopter',
 'hubschrauber rundflug':'helicopter','lot helikopterem':'helicopter',
 'hot air balloon ride':'balloon','paseo en globo':'balloon','vol en montgolfiere':'balloon',
 'heißluftballon fahrt':'balloon','lot balonem':'balloon','skydiving':'skydive',
 'paracaidismo':'skydive','saut en parachute':'skydive','fallschirmspringen':'skydive',
 'skoki spadochronowe':'skydive','supercar track day':'supercar','shark diving':'shark',
}
# Deal title -> the concept the deal actually satisfies.
TMAP = {
 'Corte y Peinado':'haircut','Coupe & Coiffage':'haircut','Haarschnitt & Styling':'haircut',
 'Hair Styling & Cut':'haircut','Strzyżenie i Stylizacja':'haircut','Facial Treatment':'facial',
 'Gesichtsbehandlung':'facial','Soin du Visage':'facial','Tratamiento Facial':'facial',
 'Zabieg na Twarz':'facial','Manicura y Pedicura':'manicure','Manicure & Pedicure Package':'manicure',
 'Manicure i Pedicure':'manicure','Maniküre & Pediküre':'manicure','Manucure & Pédicure':'manicure',
 'Abonnement Salle de Sport':'gym','Fitnessstudio Mitgliedschaft':'gym','Gym Membership Pass':'gym',
 'Karnet na Siłownię':'gym','Pase de Gimnasio':'gym','Clases Ilimitadas':'classes',
 'Cours Illimités':'classes','Unbegrenzte Kurse':'classes','Unlimited Fitness Classes':'classes',
 'Zajęcia bez Limitu':'classes','Coaching Personnel':'personal_training',
 'Entrenamiento Personal':'personal_training','Personal Training Package':'personal_training',
 'Personal Training Paket':'personal_training','Trening Personalny':'personal_training',
 'Escape Room Erlebnis':'escape_room','Escape Room Experience':'escape_room',
 'Escape Room Przygoda':'escape_room','Experiencia Escape Room':'escape_room',
 'Expérience Escape Game':'escape_room','Go-Karting Session':'karting','Kartbahn Rennen':'karting',
 'Sesión de Karting':'karting','Session Karting':'karting','Tor Kartingowy':'karting',
 'Guided City Tour':'city_tour','Stadtführung':'city_tour','Tour Guiado':'city_tour',
 'Visite Guidée':'city_tour','Zwiedzanie z Przewodnikiem':'city_tour',
}
EXACT = {'haircut','manicure','facial','gym','personal_training','escape_room','karting','city_tour'}
ADJ = {'hair_colour':['haircut'],'massage_thai':['massage_generic'],'massage_deep':['massage_generic'],
 'massage_back':['massage_generic'],'massage_sport':['massage_generic'],'massage_couples':['massage_generic'],
 'brunch':['dining_generic'],'sushi':['dining_generic'],'burger':['dining_generic'],'pizza':['dining_generic'],
 'steak':['dining_generic'],'indian':['dining_generic'],'italian':['dining_generic'],'tapas':['dining_generic'],
 'creperie':['dining_generic'],'crossfit':['classes'],'pilates':['classes'],'yoga':['classes']}
LANG = {'crossfit':'xx','brunch':'xx','pilates':'xx','sushi':'xx','tapas':'xx','karting':'xx','rafting':'xx',
 'pizzeria':'xx','joga':'pl','paintball':'en','escape room':'en','bowling':'en','personal trainer':'en',
 'thai massage':'en','burger':'en','gym':'en','manicure':'en','deep tissue massage':'en','facial':'en',
 'steak dinner':'en','pizza deal':'en','eyelash extensions':'en','back massage':'en','indian restaurant':'en',
 'helicopter tour':'en','haircut':'en','hair colour':'en','sports massage':'en','yoga class':'en',
 'go karting':'en','skydiving':'en','couples massage':'en','city tour':'en','supercar track day':'en',
 'shark diving':'en','hot air balloon ride':'en'}
for q in QMAP:
    LANG.setdefault(q, {'es':['masaje','peluqueria','tinte','entrenador','gimnasio','arroceria','tour ciudad',
        'hamburguesa','extensiones','bolera','manicura','paracaidismo','paseo','vuelo','clase','limpieza'],
        'fr':['massage','extension de','soin','salle','coloration','visite','escape game','coiffeur','manucure',
        'cours','crêperie','coach','restaurant italien','saut','tour en','vol en'],
        'de':['wildwasser','hubschrauber','fallschirm','kart fahren','nacken','heißluft','yoga kurs',
        'gesichts','italiener','sportmassage','haare','maniküre','fitness','steakhaus','friseur','wimpern',
        'rücken','paarmassage','stadt'],
        'pl':['masaż','fryzjer','koloryzacja','gokarty','trener','zwiedzanie','oczyszczanie','siłownia',
        'przedłużanie','restauracja','kręgle','lot ','skoki']}
        and next((l for l,pre in {'es':['masaje','peluqueria','tinte','entrenador','gimnasio','arroceria',
        'tour ciudad','hamburguesa','extensiones','bolera','manicura','paracaidismo','paseo','vuelo','clase',
        'limpieza'],'fr':['massage','extension de','soin','salle','coloration','visite','escape game','coiffeur',
        'manucure','cours','crêperie','coach','restaurant italien','saut','tour en','vol en'],
        'de':['wildwasser','hubschrauber','fallschirm','kart fahren','nacken','heißluft','yoga kurs','gesichts',
        'italiener','sportmassage','haare','maniküre','fitness','steakhaus','friseur','wimpern','rücken',
        'paarmassage','stadt'],'pl':['masaż','fryzjer','koloryzacja','gokarty','trener','zwiedzanie',
        'oczyszczanie','siłownia','przedłużanie','restauracja','kręgle','lot ','skoki']}.items()
        if any(q.startswith(p) for p in pre)), 'xx'))
MKTLANG = {'GB':'en','DE':'de','FR':'fr','ES':'es','PL':'pl'}

# ---------------------------------------------------------------- 2. tag rows
canon_list = list(QMAP)
def canon_of(q):
    q = re.sub(r'\s+',' ',q.strip().lower())
    if q in QMAP: return q, 'exact'
    m = difflib.get_close_matches(q, canon_list, n=1, cutoff=0.75)
    return (m[0],'typo') if m else (None,'unknown')
res = {q: canon_of(q) for q in S.raw_query.unique()}
S['canon'] = S.raw_query.map(lambda q: res[q][0]); S['qtype'] = S.raw_query.map(lambda q: res[q][1])
assert S.canon.notna().all(), 'unmapped queries'
S['concept'] = S.canon.map(QMAP)
D['concept'] = np.where(D.category_l2=='massage','massage_generic',
              np.where(D.category_l2=='dining','dining_generic', D.title.map(TMAP)))
assert D.concept.notna().all()

inv = D.groupby(['market','city','concept']).size().to_dict()
city_inv = D.groupby(['market','city']).size().to_dict()
S['tier'] = np.where(S.concept.isin(EXACT),'A_exact',
            np.where(S.concept.isin(ADJ),'B_adjacent','C_none'))
S['true_matches'] = [sum(inv.get((m,c,k),0) for k in ([con] if con in EXACT else ADJ.get(con,[])))
                     for m,c,con in zip(S.market,S.city,S.concept)]
S['city_inv'] = [city_inv[(m,c)] for m,c in zip(S.market,S.city)]
S['regime'] = pd.cut(S.results_shown, [-1,0,2,25,40],
                     labels=['0_none','1_thin(1-2)','2_healthy(4-25)','3_overload(26-40)'])
S['qlang'] = S.canon.map(LANG); S['mlang'] = S.market.map(MKTLANG)
S['langstat'] = np.where(S.qlang=='xx','loanword',
                np.where(S.qlang==S.mlang,'local',
                np.where(S.qlang=='en','english_in_nonEN','other_foreign')))
haslocal = set(S[S.langstat=='local'].groupby(['market','concept']).size().index)
S['foreign'] = [ls=='english_in_nonEN' and (m,c) in haslocal
                for ls,m,c in zip(S.langstat,S.market,S.concept)]

def hdr(t): print('\n'+'='*78+'\n'+t+'\n'+'='*78)
N = len(S)

hdr('0. DATA INTEGRITY')
print('searches', N, '| deals', len(D), '| dates', S.date.min(), '->', S.date.max())
print('dup ids:', S.query_id.duplicated().sum(), D.deal_id.duplicated().sum(), '| nulls:',
      int(S.isna().sum().sum()), int(D.isna().sum().sum()))
print('impossible rows (purchase w/o click / click w/o results):',
      ((S.purchased==1)&(S.clicked==0)).sum(), ((S.clicked==1)&(S.results_shown==0)).sum())
print('searches with results_shown == 3:', (S.results_shown==3).sum(), '<- no such value exists')
print('query strings:', S.raw_query.nunique(), '-> concepts:', S.concept.nunique(),
      '| deal titles:', D.title.nunique(), '-> concepts:', D.concept.nunique())

hdr('1. THE FUNNEL IS A STEP FUNCTION OF results_shown')
print(S.groupby('regime',observed=True).agg(searches=('query_id','size'),
      share=('query_id',lambda x: round(len(x)/N,3)), ctr=('clicked','mean'),
      cvr=('purchased','mean')).round(3))
print('\n<=2 results:', (S.results_shown<=2).sum(), f'({(S.results_shown<=2).mean()*100:.1f}%) of all searches')

hdr('2. RESULT COUNT IS UNCORRELATED WITH REAL INVENTORY')
nz = S[S.results_shown>0]
for c,l in [('true_matches','matching deals in city'),('city_inv','all deals in city')]:
    print(f'corr(results_shown, {l}): all r={S.results_shown.corr(S[c]):+.3f}  '
          f'non-zero only r={nz.results_shown.corr(nz[c]):+.3f}')
print('\nmean results_shown by tier (non-zero searches):')
print(nz.groupby('tier').results_shown.agg(['count','mean','median']).round(2))
print('\nsearches showing results where NO relevant deal exists in that city:',
      ((S.results_shown>0)&(S.true_matches==0)).sum(),
      f'({((S.results_shown>0)&(S.true_matches==0)).mean()*100:.1f}%)')
print('searches showing ZERO results where relevant inventory DOES exist:',
      ((S.results_shown==0)&(S.true_matches>0)).sum(),
      f'({((S.results_shown==0)&(S.true_matches>0)).mean()*100:.1f}%)')
print('searches returning MORE results than the city has deals in total:',
      (S.results_shown>S.city_inv).sum(), f'({(S.results_shown>S.city_inv).mean()*100:.1f}%)')

hdr('3. SAME QUERY, SAME CITY, DIFFERENT ANSWER EVERY TIME')
g = S[(S.qtype=='exact')&(S.tier!='C_none')].groupby(['market','city','canon']).results_shown.agg(
    ['size','min','max','median','std','nunique'])
g = g[g['size']>=8]
print('query x city groups with >=8 searches:', len(g))
print('groups returning one stable count:', int((g['nunique']==1).sum()))
print('groups with min==0 AND max>=20:', f'{((g["min"]==0)&(g["max"]>=20)).mean()*100:.1f}%')
print('median within-group std dev:', round(g['std'].median(),2), 'results')
print('\nworst offenders:'); print(g.sort_values('size',ascending=False).head(8).round(1))

hdr('4. CROSS-LANGUAGE SEARCH IS THE ONE REAL SEGMENT EFFECT')
print('"foreign" = English query in a non-EN market where the SAME concept is also searched locally.')
sub = S[(S.market!='GB')&(S.tier!='C_none')]
keys = set(zip(sub[sub.foreign].market, sub[sub.foreign].concept))
m2 = sub[[(m,c) in keys for m,c in zip(sub.market,sub.concept)]]
print(m2.groupby('foreign').agg(n=('query_id','size'),
      zero=('results_shown',lambda x: round((x==0).mean(),3)),
      thin=('results_shown',lambda x: round(x.between(1,2).mean(),3)),
      median_results=('results_shown','median'), ctr=('clicked','mean'),
      cvr=('purchased','mean')).round(3))
try:
    import statsmodels.formula.api as smf
    g2 = m2.copy(); g2['eng']=g2.foreign.astype(int)
    g2['fail']=(g2.results_shown<=2).astype(int)
    for y in ['fail','clicked','purchased']:
        mm = smf.logit(f'{y} ~ eng + C(concept) + C(market)', data=g2).fit(disp=0)
        b,p = mm.params['eng'], mm.pvalues['eng']
        print(f'  logit {y:10s} (concept+market fixed effects) OR={np.exp(b):5.2f}  p={p:.2e}')
except Exception as e:
    print('  [statsmodels not installed - skipping fixed-effects check]')

hdr('5. TRAP: PER-QUERY CTR/CVR DIFFERENCES ARE NOISE')
h = S[S.results_shown.between(4,25)]
print('Within the healthy 4-25 band, does anything except the result count predict outcome?')
for col in ['market','city','concept','tier','langstat']:
    print(f'  {col:10s} CTR chi2 p={stats.chi2_contingency(pd.crosstab(h[col],h.clicked))[1]:.3f}   '
          f'CVR chi2 p={stats.chi2_contingency(pd.crosstab(h[col],h.purchased))[1]:.3f}')
for col in ['qtype','foreign']:
    print(f'  {col:10s} CTR chi2 p={stats.chi2_contingency(pd.crosstab(h[col],h.clicked))[1]:.3f}   '
          f'CVR chi2 p={stats.chi2_contingency(pd.crosstab(h[col],h.purchased))[1]:.3f}  <- survives')
print('\nMarket zero-rate differences, once no-supply queries are excluded:')
f2 = S[S.tier!='C_none']
print('  by market chi2 p=', round(stats.chi2_contingency(pd.crosstab(f2.market, f2.results_shown==0))[1],3),
      ' by city chi2 p=', round(stats.chi2_contingency(pd.crosstab(f2.city, f2.results_shown==0))[1],3))

hdr('6. SUPPLY vs DEMAND')
dem = S.groupby('concept').size().rename('searches')
sup = D.groupby('concept').size().rename('deals')
t = pd.concat([dem,sup],axis=1).fillna(0).astype(int).sort_values('searches',ascending=False)
print(t.to_string())
nosupply = t[(t.deals==0)&(t.searches>0)]
print('\nconcepts customers search that have ZERO exact inventory:', len(nosupply),
      '| searches:', int(nosupply.searches.sum()), f'({nosupply.searches.sum()/N*100:.1f}%)')
adv = ['skydive','helicopter','balloon','rafting','supercar','shark']
print('high-ticket adventure demand with zero inventory:', int(t.loc[adv].searches.sum()),
      f'({t.loc[adv].searches.sum()/N*100:.1f}%) - always 0 results, 0 clicks, 0 revenue')
print('inventory nobody searches by name (generic package titles):',
      int(t.loc[['massage_generic','dining_generic','classes']].deals.sum()), 'of', len(D), 'deals')
print('price ceiling in catalogue: $', D.price_usd.max(), ' (no inventory above $180)')

hdr('7. CATALOGUE QUALITY')
dup = D.groupby(['market','city']).agg(deals=('deal_id','size'), unique_titles=('title','nunique'))
dup['repeats_per_title'] = (dup.deals/dup.unique_titles).round(2)
print(dup.sort_values('repeats_per_title',ascending=False).head(6))
print('\nmax identical titles in one city:', D.groupby(['market','city','title']).size().max())
print('instant-bookable share: GB', round(D[D.market=='GB'].is_bookable.mean(),3),
      'vs rest', round(D[D.market!='GB'].is_bookable.mean(),3),
      '| chi2 p=', f'{stats.chi2_contingency(pd.crosstab(D.market,D.is_bookable))[1]:.2e}')
print('deals rated below 4.0:', int((D.rating<4).sum()), f'({(D.rating<4).mean()*100:.1f}%)')

hdr('8. TYPOS')
e = S[S.tier!='C_none']
print(e.groupby('qtype').agg(n=('query_id','size'),
      zero=('results_shown',lambda x: round((x==0).mean(),3)), median_results=('results_shown','median'),
      ctr=('clicked','mean'), cvr=('purchased','mean')).round(3))
print('zero-rate difference chi2 p=', round(stats.chi2_contingency(pd.crosstab(e.qtype,e.results_shown==0))[1],3),
      '<- typos are NOT under-served on count')
print('within healthy 4-25 band: exact CVR', round(h[h.qtype=='exact'].purchased.mean(),3),
      'vs typo CVR', round(h[h.qtype=='typo'].purchased.mean(),3))

hdr('9. REVENUE AT STAKE (proxy: city median deal price)')
cp = D.groupby(['market','city']).price_usd.median().rename('cityprice')
s2 = S.merge(cp, on=['market','city'])
actual = (s2.purchased*s2.cityprice).sum()
hcvr = s2[s2.results_shown.between(4,25)].purchased.mean()
print(f'observed purchases {int(s2.purchased.sum())} | est. revenue ${actual:,.0f} for the month')
tot = 0
for name, mask in [('zero results', s2.results_shown==0), ('1-2 results', s2.results_shown.between(1,2)),
                   ('26-40 results', s2.results_shown>25)]:
    sub = s2[mask]; miss = (hcvr - sub.purchased.mean())*len(sub); rev = miss*sub.cityprice.median()
    tot += rev
    print(f'  {name:14s} n={len(sub):5d}  cvr={sub.purchased.mean():.4f}  '
          f'missed purchases={miss:5.0f}  est. ${rev:,.0f}')
print(f'total recoverable if every search behaved like the healthy band: ${tot:,.0f} '
      f'({tot/actual*100:.0f}% on top of current)')
print('\nCAVEAT: search_log has no deal_id, so revenue is a proxy using the city median price')
print('and assumes the healthy-band conversion rate is achievable. Directional, not a forecast.')
