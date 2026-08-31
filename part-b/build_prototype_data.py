"""Build the data bundle the Part B prototype runs on, straight from the two CSVs.

Extends ../../build_data.py: same hand-built intent table (the 20 concepts and their
terms across five languages), but reads the CSVs with the stdlib instead of pandas,
keys the log by (market, city, query) instead of (market, query), and keeps every
individual results_shown value so the Today pane can replay the real distribution.

Adds `titleTerms` per intent: the literal strings that appear in real catalog titles
for that concept. An intent with titleTerms that hit is a title-level match (MATCHED);
an intent whose category exists but whose concept is never named in a title is a
category-level match (CATEGORY ONLY). That distinction is finding F5 made mechanical.

Run from the repo root:  python3 v2/part_b_prototype/build_prototype_data.py
"""
import csv, json, os, unicodedata, collections, statistics, datetime

HERE_ = os.path.dirname(os.path.abspath(__file__))
# the two CSVs, wherever the repo has been unpacked
ROOT = next(d for d in (os.path.join(HERE_, "..", "data"), os.path.join(HERE_, ".."),
                        os.path.dirname(os.path.dirname(HERE_)))
            if os.path.exists(os.path.join(d, "deals.csv")))
HERE = os.path.dirname(os.path.abspath(__file__))

def norm(t):
    d = unicodedata.normalize("NFD", (t or "").lower().replace("ß", "ss"))
    d = "".join(c for c in d if unicodedata.category(c) != "Mn")
    return " ".join(d.split())

# --- Intents -------------------------------------------------------------
# key, catalog category (None = the catalog holds nothing for this concept),
# display label, query terms (verbatim from the log, five languages),
# titleTerms (substrings that really occur in deals.csv titles for this concept).
INTENTS = [
 ("massage", "massage", "Massage & spa",
  ["back massage","deep tissue massage","thai massage","sports massage","couples massage","massage",
   "nackenmassage","sportmassage","rückenmassage","paarmassage","massage duo","massage sportif",
   "massage thai","massage dos","masaje tailandes","masaje descontracturante","masaje espalda",
   "masaje en pareja","masaje","masaż dla par","masaż tajski","masaż sportowy","masaż pleców",
   "masaż","wellness","spa"],
  ["massage","masaje","masaz","modelage","wellness","wohlfuhl","spa","bienestar","detente","relaks"]),

 ("hair", "beauty", "Hair styling & color",
  ["haircut","hair color","hair color","haare färben","friseur","haarschnitt","coiffeur",
   "coloration","coupe","peluqueria","tinte pelo","corte pelo","fryzjer","koloryzacja","strzyżenie"],
  ["hair","haarschnitt","coupe","coiffage","corte","peinado","strzyzenie","stylizacja","styling"]),

 ("facial", "beauty", "Facial treatment",
  ["facial","gesichtsbehandlung","soin visage","soin du visage","limpieza facial",
   "oczyszczanie twarzy","zabieg na twarz"],
  ["facial","gesichtsbehandlung","visage","twarz"]),

 ("nails", "beauty", "Manicure & pedicure",
  ["manicure","maniküre","manucure","manicura","pedicure"],
  ["manicure","manikure","manucure","manicura","pedicure","pedikure","pedicura"]),

 ("lashes", "beauty", "Eyelash extensions",
  ["eyelash extensions","wimpernverlängerung","extension de cils","extensiones pestañas",
   "przedłużanie rzęs"],
  []),

 ("gym", "fitness", "Gym access",
  ["gym","fitnessstudio","salle de sport","gimnasio","siłownia"],
  ["gym","fitnessstudio","salle de sport","gimnasio","siłowni"]),

 ("trainer", "fitness", "Personal training",
  ["personal trainer","coach sportif","entrenador personal","trener personalny","personal training"],
  ["personal training","coaching personnel","entrenamiento personal","trening personalny"]),

 ("classes", "fitness", "Fitness classes",
  ["crossfit","pilates","yoga class","yoga kurs","cours de yoga","clase de yoga","joga","yoga"],
  []),

 ("dining", "dining", "Dining",
  ["sushi","brunch","burger","hamburguesa","steak dinner","steakhaus","pizza deal","pizzeria",
   "indian restaurant","italiener","restaurant italien","restauracja włoska","crêperie","creperie",
   "arroceria","tapas","dinner","kolacja"],
  []),

 ("escape", "activities", "Escape room",
  ["escape room","escape game","escape rom"],
  ["escape"]),

 ("karting", "activities", "Go-karting",
  ["go karting","karting","kart fahren","gokarty","go-karting"],
  ["karting","kartbahn","kartingowy"]),

 ("citytour", "activities", "Guided city tour",
  ["city tour","stadtrundfahrt","stadtführung","visite guidee","visite guidée","tour ciudad",
   "zwiedzanie miasta","guided tour"],
  ["city tour","stadtfuhrung","visite guidee","tour guiado","zwiedzanie"]),

 ("bowling", "activities", "Bowling",
  ["bowling","bolera","kręgle"],
  []),

 ("paintball", "activities", "Paintball",
  ["paintball"],
  []),

 # --- nothing in the catalog matches these, anywhere in the five markets ---
 ("helicopter", None, "Helicopter flight",
  ["helicopter tour","hubschrauber rundflug","tour en helicoptere","vuelo en helicoptero",
   "lot helikopterem"], []),
 ("balloon", None, "Hot-air balloon",
  ["hot air balloon ride","heißluftballon fahrt","heissluftballon fahrt","vol en montgolfiere",
   "paseo en globo","lot balonem"], []),
 ("skydiving", None, "Skydiving",
  ["skydiving","fallschirmspringen","saut en parachute","paracaidismo","skoki spadochronowe"], []),
 ("rafting", None, "White-water rafting",
  ["rafting","wildwasser rafting"], []),
 ("supercar", None, "Supercar track day",
  ["supercar track day","supercar"], []),
 ("diving", None, "Shark diving",
  ["shark diving","diving"], []),
]

# One adjacent concept per unstockable one, mapped by hand and labeled in the UI as a
# judgment call. Where no honest adjacency exists the prototype shows nothing.
# One adjacent concept for each of the six nobody stocks. The first three are close reads —
# a supercar day and a go-kart session are both motorsport, a helicopter tour and a city tour
# are both "see the city". The last three are further away, and were originally left empty on
# the grounds that showing nothing beats reaching. That was over-cautious: skydiving is the
# most-searched of the six (387 searches) and rafting is third (312), and both were answering
# with a blank. They now point at the nearest thing the catalog has at all, and the interface
# says plainly that the mapping is a judgment rather than a measurement.
ADJACENT = {"supercar": "karting", "helicopter": "citytour", "balloon": "citytour",
            "skydiving": "karting", "rafting": "karting", "diving": "citytour"}

# Which other concepts in the same category are closest, closest first. Ranking only —
# it never adds or removes a result. A hand-made judgment, and the UI says so: without it
# a paintball search leads with a Guided City Tour purely because that deal is rated 4.7.
AFFINITY = {
    "paintball": ["karting", "escape", "citytour"],
    "bowling":   ["escape", "karting", "citytour"],
    "escape":    ["karting", "citytour"],
    "karting":   ["escape", "citytour"],
    "citytour":  ["escape", "karting"],
    "lashes":    ["facial", "nails", "hair"],
    "facial":    ["nails", "hair"],
    "nails":     ["facial", "hair"],
    "hair":      ["facial", "nails"],
    "classes":   ["gym", "trainer"],
    "gym":       ["trainer", "classes"],
    "trainer":   ["gym", "classes"],
    "massage":   [],
    "dining":    [],
    "helicopter": ["citytour"], "balloon": ["citytour"], "supercar": ["karting"],
    "skydiving": [], "rafting": [], "diving": [],
}

# How the concept reads inside a sentence ("No <phrase> is listed in London").
PHRASE = {"massage": "massage", "hair": "haircut or color", "facial": "facial treatment",
          "nails": "manicure or pedicure", "lashes": "eyelash extension", "gym": "gym pass",
          "trainer": "personal training", "classes": "fitness class", "dining": "restaurant deal",
          "escape": "escape room", "karting": "go-karting session", "citytour": "guided city tour",
          "bowling": "bowling deal", "paintball": "paintball deal",
          "helicopter": "helicopter flight", "balloon": "hot-air balloon ride",
          "skydiving": "skydive", "rafting": "white-water rafting trip",
          "supercar": "supercar track day", "diving": "shark dive"}

# Words nobody typed in this one month but that plainly mean the same thing. The intent map
# above is built strictly from the log; this list is not, and is kept separate so the
# provenance of each stays obvious. A month of logs is not the vocabulary of a market — a
# reviewer typing "hairdresser" or "wine tasting" is asking for something the catalog holds,
# and answering "could not read an intent" would be a failure of the search, not of the data.
EXTRA_TERMS = {
 "hair":     ["hairdresser", "barber", "hair salon", "blow dry", "highlights", "balayage", "hair cut"],
 "nails":    ["nail art", "gel nails", "nail salon", "shellac", "nails"],
 "facial":   ["skin treatment", "face treatment", "facial treatment"],
 "massage":  ["spa day", "hot stone massage", "aromatherapy massage", "swedish massage",
              "full body massage", "relaxing massage", "wellness day"],
 "gym":      ["gym membership", "gym pass", "fitness pass", "leisure center"],
 "trainer":  ["personal training", "pt session", "fitness coach"],
 "classes":  ["spin class", "hiit", "zumba", "bootcamp", "fitness class", "gym class",
              "exercise class", "aerobics"],
 "dining":   ["wine tasting", "dinner for two", "three course meal", "tasting menu",
              "restaurant", "lunch", "meal deal", "food"],
 "escape":   ["escape rooms", "escape the room"],
 "karting":  ["go karts", "kart racing", "go-karts"],
 "citytour": ["sightseeing", "walking tour", "bus tour", "sightseeing tour"],
 "bowling":  ["ten pin bowling", "bowling alley"],
 "paintball":["paintballing", "paintball arena"],
 "helicopter":["helicopter ride", "helicopter flight", "heli tour"],
 "balloon":  ["hot air balloon flight", "balloon flight", "balloon ride"],
 "skydiving":["tandem skydive", "parachute jump", "sky dive"],
 "rafting":  ["river rafting", "white water rafting"],
 "supercar": ["supercar driving", "track day", "race car experience"],
 "diving":   ["scuba diving", "shark cage diving", "cage diving"],
}

LANG = {"GB": "English", "DE": "German", "FR": "French", "ES": "Spanish", "PL": "Polish"}
MARKET_NAME = {"GB": "the United Kingdom", "DE": "Germany", "FR": "France",
               "ES": "Spain", "PL": "Poland"}
DOMAIN = {"GB": "groupon.co.uk", "DE": "groupon.de", "FR": "groupon.fr",
          "ES": "groupon.es", "PL": "groupon.pl"}
CAT_LABEL = {"massage": "Massage", "beauty": "Beauty", "fitness": "Fitness",
             "dining": "Dining", "activities": "Activities"}

# --- Load ----------------------------------------------------------------
deals = list(csv.DictReader(open(os.path.join(ROOT, "deals.csv"), encoding="utf-8")))
log = list(csv.DictReader(open(os.path.join(ROOT, "search_log.csv"), encoding="utf-8")))
seg = {}
with open(os.path.join(ROOT, "searches_classified.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        seg[r["query_id"]] = r["segment"]

# --- Deals ---------------------------------------------------------------
deal_rows = [[d["deal_id"], d["market"], d["city"], d["title"], d["category_l1"],
              d["category_l2"], round(float(d["price_usd"]), 2), float(d["rating"]),
              int(d["num_ratings"]), 1 if d["is_bookable"] == "True" else 0]
             for d in deals]

# --- Cities, with the per-category counts the zero-result state shows --------
city_cat = collections.defaultdict(collections.Counter)
for d in deals:
    city_cat[(d["market"], d["city"])][d["category_l2"]] += 1
cities = [[m, c, sum(cc.values()), dict(cc)] for (m, c), cc in sorted(city_cat.items())]

# --- Assert every titleTerm list actually hits the catalog -----------------
titles_by_cat = collections.defaultdict(set)
for d in deals:
    titles_by_cat[d["category_l2"]].add(d["title"])
problems = []
for key, cat, label, terms, tterms in INTENTS:
    if not cat or not tterms:
        continue
    hit = {t for t in titles_by_cat[cat] if any(x in norm(t) for x in tterms)}
    if not hit:
        problems.append(f"intent {key}: titleTerms match no {cat} title")
    for other in titles_by_cat:
        if other == cat:
            continue
        bleed = {t for t in titles_by_cat[other] if any(x in norm(t) for x in tterms)}
        if bleed:
            problems.append(f"intent {key}: titleTerms leak into {other}: {sorted(bleed)}")
if problems:
    raise SystemExit("title-term map is wrong:\n  " + "\n  ".join(problems))

# `titleTerms` answers "does the catalog name what the customer asked for?" and decides
# MATCHED vs CATEGORY ONLY. `dealTerms` answers the different question "which concept is
# this deal?", and only feeds the affinity ordering. They differ in exactly one place:
# the catalog sells an unlimited class pass, so a deal can BE a fitness class — but it
# never names crossfit, yoga or pilates, which is what customers actually type.
DEAL_TERMS = {"classes": ["unlimited fitness classes", "unbegrenzte kurse", "cours illimites",
                          "clases ilimitadas", "zajecia bez limitu"]}

# An umbrella concept: the deal is real and identifiable, but it does not say WHICH activity
# it is. A crossfit class could be one of the 48 unlimited class passes, so fitness can never
# deny a specific class the way activities can deny paintball.
UMBRELLA = {"classes"}

keys = {k: (cat, DEAL_TERMS.get(k, tt)) for k, cat, _l, _t, tt in INTENTS}
for k, targets in AFFINITY.items():
    for t in targets:
        if t not in keys:
            raise SystemExit("affinity %s -> unknown concept %s" % (k, t))
        if keys[k][0] and keys[t][0] != keys[k][0]:
            raise SystemExit("affinity %s -> %s crosses categories" % (k, t))
        if not keys[t][1]:
            raise SystemExit("affinity %s -> %s, which no title names" % (k, t))

# every deal must resolve to exactly one concept, or the affinity ordering is meaningless
_owner = {}
for k, (cat, dts) in keys.items():
    if not cat or not dts:
        continue
    for t in titles_by_cat[cat]:
        if any(x in norm(t) for x in dts):
            if t in _owner and _owner[t] != k:
                raise SystemExit("title %r claimed by both %s and %s" % (t, _owner[t], k))
            _owner[t] = k
# dining is the one category with no sub-concepts at all — its fifteen titles are generic
# dinner menus, which is finding 05 in the catalog itself. Everywhere else, every title
# must belong to exactly one concept.
_named_cats = {keys[k][0] for k in _owner.values()}
_unowned = {t for cat in _named_cats for t in titles_by_cat[cat]} - set(_owner)
if _unowned:
    raise SystemExit("titles no concept claims: %s" % sorted(_unowned))
print("concept map: %d of %d titles own a concept; %s names none"
      % (len(_owner), sum(len(v) for v in titles_by_cat.values()),
         ", ".join(sorted(set(titles_by_cat) - _named_cats))))

# Which categories may say "we do not have that here" at all.
#
# Only a category where every single deal is a known, specific concept can deny one. Say it
# about activities and it is a fact — all 132 are an escape room, a go-karting session or a
# city tour, so paintball is provably not among them. Say it about dining and it is a guess:
# the 100 dining deals are generic tasting menus, and one of them may well be sushi. Fitness
# fails for the same reason at one remove — 48 of its deals are an unlimited class pass, and
# a crossfit class could be one of them.
DENIABLE = {}
for cat, titles in titles_by_cat.items():
    unowned = [t for t in titles if t not in _owner]
    umbrella = [t for t in titles if _owner.get(t) in UMBRELLA]
    DENIABLE[cat] = 1 if not unowned and not umbrella else 0
print("categories that may deny a concept: %s"
      % ", ".join(sorted(c for c in DENIABLE if DENIABLE[c])) or "none")

# --- What each deal title says, in English -----------------------------------
# A translation of the title itself, not a label for its concept: nine Berlin massage deals
# carry three different names and a reader who does not speak German deserves to know which
# is which. All seventy-five, by hand, asserted complete below.
TITLE_EN = {
    # activities
    "Escape Room Experience": "Escape Room Experience",
    "Escape Room Erlebnis": "Escape Room Experience",
    "Escape Room Przygoda": "Escape Room Adventure",
    "Experiencia Escape Room": "Escape Room Experience",
    "Expérience Escape Game": "Escape Game Experience",
    "Go-Karting Session": "Go-Karting Session",
    "Kartbahn Rennen": "Kart Track Race",
    "Sesión de Karting": "Karting Session",
    "Session Karting": "Karting Session",
    "Tor Kartingowy": "Karting Track",
    "Guided City Tour": "Guided City Tour",
    "Stadtführung": "City Tour",
    "Visite Guidée": "Guided Tour",
    "Tour Guiado": "Guided Tour",
    "Zwiedzanie z Przewodnikiem": "Sightseeing with a Guide",
    # beauty
    "Hair Styling & Cut": "Hair Styling & Cut",
    "Haarschnitt & Styling": "Haircut & Styling",
    "Coupe & Coiffage": "Cut & Styling",
    "Corte y Peinado": "Cut and Styling",
    "Strzyżenie i Stylizacja": "Haircut and Styling",
    "Facial Treatment": "Facial Treatment",
    "Gesichtsbehandlung": "Facial Treatment",
    "Soin du Visage": "Facial Care",
    "Tratamiento Facial": "Facial Treatment",
    "Zabieg na Twarz": "Face Treatment",
    "Manicure & Pedicure Package": "Manicure & Pedicure Package",
    "Maniküre & Pediküre": "Manicure & Pedicure",
    "Manucure & Pédicure": "Manicure & Pedicure",
    "Manicura y Pedicura": "Manicure and Pedicure",
    "Manicure i Pedicure": "Manicure and Pedicure",
    # dining
    "Dinner & Wine Experience": "Dinner & Wine Experience",
    "Dinner mit Weinbegleitung": "Dinner with Wine Pairing",
    "Dîner avec Vin": "Dinner with Wine",
    "Cena con Maridaje": "Dinner with Wine Pairing",
    "Kolacja z Winem": "Dinner with Wine",
    "Three-Course Meal for Two": "Three-Course Meal for Two",
    "3-Gänge-Menü für Zwei": "Three-Course Menu for Two",
    "Menu 3 Plats pour Deux": "Three-Course Menu for Two",
    "Menú de 3 Platos para Dos": "Three-Course Menu for Two",
    "Menu 3-Daniowe dla Dwojga": "Three-Course Menu for Two",
    "Tasting Menu for Two": "Tasting Menu for Two",
    "Degustationsmenü": "Tasting Menu",
    "Menu Dégustation": "Tasting Menu",
    "Menú Degustación": "Tasting Menu",
    "Menu Degustacyjne": "Tasting Menu",
    # fitness
    "Gym Membership Pass": "Gym Membership Pass",
    "Fitnessstudio Mitgliedschaft": "Gym Membership",
    "Abonnement Salle de Sport": "Gym Membership",
    "Pase de Gimnasio": "Gym Pass",
    "Karnet na Siłownię": "Gym Pass",
    "Personal Training Package": "Personal Training Package",
    "Personal Training Paket": "Personal Training Package",
    "Coaching Personnel": "Personal Coaching",
    "Entrenamiento Personal": "Personal Training",
    "Trening Personalny": "Personal Training",
    "Unlimited Fitness Classes": "Unlimited Fitness Classes",
    "Unbegrenzte Kurse": "Unlimited Classes",
    "Cours Illimités": "Unlimited Classes",
    "Clases Ilimitadas": "Unlimited Classes",
    "Zajęcia bez Limitu": "Unlimited Classes",
    # massage
    "Spa & Massage Treatment": "Spa & Massage Treatment",
    "Relaxing Wellness Session": "Relaxing Wellness Session",
    "Full Body Massage Package": "Full Body Massage Package",
    "Wellness-Massage Paket": "Wellness Massage Package",
    "Wohlfühl-Massage": "Feel-Good Massage",
    "Entspannungs-Behandlung im Spa": "Relaxation Treatment at the Spa",
    "Forfait Massage Bien-être": "Wellbeing Massage Package",
    "Modelage Détente": "Relaxation Massage",
    "Séance Spa Relaxante": "Relaxing Spa Session",
    "Circuito Spa con Masaje": "Spa Circuit with Massage",
    "Sesión de Masaje y Spa": "Massage and Spa Session",
    "Tratamiento de Bienestar": "Wellbeing Treatment",
    "Masaż Relaksacyjny Pakiet": "Relaxing Massage Package",
    "Sesja Wellness": "Wellness Session",
    "Zabieg Spa i Masaż": "Spa and Massage Treatment",
}
_all_titles = {t for cat in titles_by_cat for t in titles_by_cat[cat]}
_missing = _all_titles - set(TITLE_EN)
_extra = set(TITLE_EN) - _all_titles
if _missing or _extra:
    raise SystemExit("title translations off: missing %s, unknown %s" % (sorted(_missing), sorted(_extra)))
title_en = TITLE_EN
print("English titles: %d of %d" % (len(title_en), len(_all_titles)))

# --- Which market each query term belongs to (its home language) -------------
term_market = collections.defaultdict(collections.Counter)
for r in log:
    term_market[norm(r["raw_query"])][r["market"]] += 1

intents = []
for key, cat, label, terms, tterms in INTENTS:
    entries = []
    for t in list(terms) + EXTRA_TERMS.get(key, []):
        nt = norm(t)
        mk = term_market.get(nt)
        entries.append({"t": nt, "m": mk.most_common(1)[0][0] if mk else None})
    intents.append({"key": key, "cat": cat, "label": label, "phrase": PHRASE[key],
                    "terms": entries, "titleTerms": tterms,
                    "dealTerms": DEAL_TERMS.get(key, tterms),
                    "adjacent": ADJACENT.get(key), "affinity": AFFINITY[key]})

# --- The log, keyed by (market, city, normalised query) ----------------------
# Every individual results_shown value is kept: the Today pane replays them rather
# than simulating anything.
agg = collections.defaultdict(lambda: {"vals": [], "clicks": 0, "purch": 0, "seg": None,
                                       "id": None, "raw": None})
for r in log:
    k = r["market"] + "|" + r["city"] + "|" + norm(r["raw_query"])
    a = agg[k]
    a["vals"].append(int(r["results_shown"]))
    a["clicks"] += int(r["clicked"])
    a["purch"] += int(r["purchased"])
    a["seg"] = a["seg"] or seg.get(r["query_id"])
    if a["id"] is None:
        a["id"], a["raw"] = r["query_id"], r["raw_query"]
log_rows = {k: [len(a["vals"]), a["vals"], a["clicks"], a["purch"], a["seg"], a["id"], a["raw"]]
            for k, a in agg.items()}

# --- Spelling-correction vocabulary, per market -----------------------------
vocab = {}
for m in sorted({r["market"] for r in log}):
    c = collections.Counter(norm(r["raw_query"]) for r in log if r["market"] == m)
    vocab[m] = sorted(q for q, n in c.items() if n >= 5)

# --- Demand for the six unstockable concepts, per market and per city --------
term_to_intent = {}
for it in intents:
    for e in it["terms"]:
        term_to_intent.setdefault(e["t"], it["key"])
demand_market = collections.Counter()
demand_city = collections.Counter()
for r in log:
    k = term_to_intent.get(norm(r["raw_query"]))
    if k:
        demand_market[(k, r["market"])] += 1
        demand_city[(k, r["market"], r["city"])] += 1

# --- Headline figures, computed ---------------------------------------------
prices = [float(d["price_usd"]) for d in deals]
by_market_price = collections.defaultdict(list)
for d in deals:
    by_market_price[d["market"]].append(float(d["price_usd"]))

bands = collections.Counter()
def band(n):
    return "0" if n == 0 else "1-2" if n <= 2 else "4-25" if n <= 25 else "26-40"
funnel = collections.defaultdict(lambda: [0, 0, 0])
for r in log:
    b = band(int(r["results_shown"]))
    funnel[b][0] += 1
    funnel[b][1] += int(r["clicked"])
    funnel[b][2] += int(r["purchased"])

seg_funnel = collections.defaultdict(lambda: [0, 0, 0])
for r in log:
    s = seg.get(r["query_id"], "?")
    seg_funnel[s][0] += 1
    seg_funnel[s][1] += int(r["clicked"])
    seg_funnel[s][2] += int(r["purchased"])

markets = [[m, MARKET_NAME[m], DOMAIN[m], LANG[m],
            round(max(by_market_price[m]), 2),
            round(statistics.median(by_market_price[m]), 2)]
           for m in sorted(by_market_price)]

stats = {
    "searches": len(log),
    "deals": len(deals),
    "distinctTitles": len({d["title"] for d in deals}),
    "cities": len(cities),
    "logKeys": len(log_rows),
    "maxPrice": round(max(prices), 2),
    "medianPrice": round(statistics.median(prices), 2),
    "zeroResult": sum(1 for r in log if r["results_shown"] == "0"),
    "bands": {b: v for b, v in sorted(funnel.items())},
    "segments": {s: v for s, v in sorted(seg_funnel.items())},
    "demandMarket": {f"{k}|{m}": n for (k, m), n in sorted(demand_market.items())},
    "demandCity": {f"{k}|{m}|{c}": n for (k, m, c), n in sorted(demand_city.items())},
}

bundle = {"generated": datetime.date.today().isoformat(), "deals": deal_rows,
          "cities": cities, "markets": markets, "intents": intents, "log": log_rows,
          "vocab": vocab, "lang": LANG, "catLabel": CAT_LABEL, "deniable": DENIABLE,
          "titleEn": title_en,
          "stats": stats}

out = os.path.join(HERE, "prototype_data.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(bundle, f, separators=(",", ":"), ensure_ascii=False)

print("wrote", os.path.relpath(out, ROOT), round(os.path.getsize(out) / 1024, 1), "KB")
print("deals", len(deal_rows), "· cities", len(cities), "· intents", len(intents),
      "(", sum(1 for i in intents if not i["cat"]), "with no inventory )")
print("log keys", len(log_rows), "· searches", sum(v[0] for v in log_rows.values()))
print("bands", dict(stats["bands"]))
print("segments", dict(stats["segments"]))
print("max price", stats["maxPrice"], "median", stats["medianPrice"])
