/* Honest Search — the Part B prototype engine.
   Extends ../../engine.js: same normalisation, capped Levenshtein and five-language
   intent map, plus the eight response types from PRD §5.5 and the three hard
   invariants from PRD §6.

   Deterministic throughout. Same (query, market, city) -> byte-identical output.
   Shared by the page and by test_engine.js so there is exactly one implementation. */
(function (root) {
  "use strict";

  var D = null;

  /* --- setup ------------------------------------------------------------ */

  function init(bundle) {
    D = bundle;

    D.byIntent = {};
    D.termIndex = {};
    D.intents.forEach(function (it) {
      D.byIntent[it.key] = it;
      it.terms.forEach(function (e) {
        if (!D.termIndex[e.t]) D.termIndex[e.t] = it;
      });
    });

    // Deals, indexed by city and by (city, category).
    D.dealById = {};
    D.byCity = {};
    D.byCityCat = {};
    D.deals.forEach(function (r) {
      var d = { id: r[0], market: r[1], city: r[2], title: r[3], cat1: r[4], cat2: r[5],
                price: r[6], rating: r[7], nRatings: r[8], bookable: !!r[9] };
      d.ntitle = normalise(d.title);
      D.dealById[d.id] = d;
      var ck = d.market + "|" + d.city;
      (D.byCity[ck] = D.byCity[ck] || []).push(d);
      var cc = ck + "|" + d.cat2;
      (D.byCityCat[cc] = D.byCityCat[cc] || []).push(d);
    });
    Object.keys(D.byCity).forEach(function (k) { D.byCity[k].sort(rank); });
    Object.keys(D.byCityCat).forEach(function (k) { D.byCityCat[k].sort(rank); });

    // Which concept each deal IS — a different question from "does its title answer the
    // query", and the only input to the affinity ordering.
    D.conceptOf = {};
    D.intents.forEach(function (it) {
      if (!it.cat || !it.dealTerms || !it.dealTerms.length) return;
      D.deals.forEach(function (r) {
        if (r[5] !== it.cat) return;
        var t = normalise(r[3]);
        for (var i = 0; i < it.dealTerms.length; i++) {
          if (t.indexOf(it.dealTerms[i]) >= 0) { D.conceptOf[r[0]] = it.key; return; }
        }
      });
    });

    D.cityIndex = {};
    D.cities.forEach(function (c) { D.cityIndex[c[0] + "|" + c[1]] = { market: c[0], city: c[1], deals: c[2], cats: c[3] }; });

    D.marketIndex = {};
    D.markets.forEach(function (m) {
      D.marketIndex[m[0]] = { code: m[0], name: m[1], domain: m[2], language: m[3],
                              maxPrice: m[4], medianPrice: m[5] };
    });

    // How often each term was typed in each market — the input to the native/foreign rule.
    D.termVolume = {};
    D.termTotal = {};
    Object.keys(D.log).forEach(function (k) {
      var p = k.split("|"), market = p[0], term = p.slice(2).join("|"), n = D.log[k][0];
      (D.termVolume[term] = D.termVolume[term] || {});
      D.termVolume[term][market] = (D.termVolume[term][market] || 0) + n;
      D.termTotal[term] = (D.termTotal[term] || 0) + n;
    });
    // Customers do not type the log's exact phrasing. "helicopter flight", "helicopter
    // adventure" and plain "helicopter" all mean the same thing as "helicopter tour", and
    // answering NOT UNDERSTOOD to any of them is both bad and untrue — we know what they meant.
    // So index the distinctive words of every term, and keep only the words that belong to
    // exactly one concept. Two do not and are dropped: "tour" (a city tour or a helicopter
    // tour?) and "sportif" (massage sportif or coach sportif?). Guessing either would be worse
    // than not guessing.
    var claims = {};
    Object.keys(D.termIndex).forEach(function (term) {
      term.split(" ").forEach(function (w) {
        if (w.length < 4) return;
        (claims[w] = claims[w] || {})[D.termIndex[term].key] = true;
      });
    });
    D.wordIndex = {};
    D.ambiguousWord = {};
    Object.keys(claims).forEach(function (w) {
      var ks = Object.keys(claims[w]);
      if (ks.length === 1) D.wordIndex[w] = D.byIntent[ks[0]];
      else D.ambiguousWord[w] = true;
    });

    // Terms that never appear as a query on their own ("massage", "masaz", "spa") have no
    // volume of their own. Fall back to the markets that typed the longer queries which
    // contain them — "masaz tajski" is Polish, so "masaz" is Polish.
    Object.keys(D.termIndex).forEach(function (term) {
      if (D.termVolume[term]) return;
      var v = null;
      Object.keys(D.log).forEach(function (k) {
        var p = k.split("|"), qs = p.slice(2).join("|");
        if (qs.indexOf(term) < 0) return;
        v = v || {};
        v[p[0]] = (v[p[0]] || 0) + D.log[k][0];
      });
      if (v) {
        D.termVolume[term] = v;
        D.termTotal[term] = Object.keys(v).reduce(function (a, m) { return a + v[m]; }, 0);
      }
    });
    return D;
  }

  /* --- text ------------------------------------------------------------- */

  function normalise(t) {
    return (t || "").toLowerCase().replace(/ß/g, "ss")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ").trim();
  }

  function distance(a, b, cap) {
    cap = cap === undefined ? 2 : cap;
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // Stable 32-bit hash — the only source of "which logged run do we show first",
  // so the first render of a query is always the same one.
  function hash(s) {
    var h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }

  /* --- understanding the query ------------------------------------------ */

  // Longest matching term wins, so "deep tissue massage" beats "massage".
  function matchTerm(q) {
    var best = null, term;
    for (term in D.termIndex) {
      if (q === term || q.indexOf(term) >= 0) {
        if (!best || term.length > best.term.length) best = { term: term, intent: D.termIndex[term] };
      }
    }
    return best;
  }

  // Nearest known term, the market's own vocabulary first. The edit budget scales with
  // the query: without that, a one-letter query "corrects" to "spa" and a two-letter one
  // to anything, which is guessing rather than correcting.
  function budget(q) { return q.length <= 3 ? 0 : q.length <= 6 ? 1 : 2; }

  function correct(q, market) {
    var cap = budget(q);
    if (!cap) return null;
    var best = null, words = (D.vocab[market] || []), i, d, term;
    for (i = 0; i < words.length; i++) {
      d = distance(q, words[i], cap);
      if (d <= cap && (!best || d < best.d || (d === best.d && words[i] < best.word))) best = { word: words[i], d: d };
    }
    if (best && matchTerm(best.word)) return best;
    best = null;
    for (term in D.termIndex) {
      d = distance(q, term, cap);
      if (d > cap) continue;
      if (!best || d < best.d) { best = { word: term, d: d }; continue; }
      if (d > best.d) continue;
      // Tie: prefer the market's own spelling. "masage" in London is a typo of "massage",
      // not of the Spanish "masaje", even though both are one edit away.
      var mine = isNative(term, market) || homeMarket(term) === market;
      var theirs = isNative(best.word, market) || homeMarket(best.word) === market;
      if (mine !== theirs) { if (mine) best = { word: term, d: d }; continue; }
      if (term < best.word) best = { word: term, d: d };
    }
    return best;
  }

  // A term is native to a market if that market really uses it: asked 20+ times there,
  // or carrying at least a fifth of the term's total volume. Without this, loanwords
  // every market types ("brunch", "crossfit", "paintball") read as foreign.
  function isNative(term, market) {
    var v = D.termVolume[term];
    if (!v) return false;
    var n = v[market] || 0;
    return n >= 20 || (D.termTotal[term] ? n / D.termTotal[term] >= 0.2 : false);
  }

  // A term belongs to one language only if that market types most of it. Below this
  // share it is a loanword every market uses — brunch, sushi, crossfit, paintball,
  // escape room, karting — and calling it foreign would be a false positive.
  var HOME_SHARE = 0.6;

  function homeMarket(term) {
    var v = D.termVolume[term], best = null, m;
    if (!v) return null;
    for (m in v) if (!best || v[m] > v[best] || (v[m] === v[best] && m < best)) best = m;
    if (!D.termTotal[term] || v[best] / D.termTotal[term] < HOME_SHARE) return null;
    return best;
  }

  // A single distinctive word is enough to name the concept when the whole phrase is not
  // known, and so is the stem of one: "raft" is rafting, "mani" is a manicure, "thai" is a
  // thai massage. Every step gathers ALL the words it could mean and gives up unless they
  // agree on one concept — so "sport" (sportmassage or salle de sport?), "coup" (coupe or
  // couples massage?) and "fahr" (kart fahren or ballon fahrt?) resolve to nothing at all.
  function conceptOfWords(words) {
    var keys = {}, k;
    words.forEach(function (w) { keys[D.wordIndex[w].key] = true; });
    var ks = Object.keys(keys);
    return ks.length === 1 ? D.byIntent[ks[0]] : null;
  }

  // Two passes, and spelling correction sits between them. A stem ("raft" for rafting) is
  // recognized before correction, because it is not a mistake. A long shared prefix
  // ("skydive" for skydiving) is tried only after correction has failed, so that a real
  // misspelling is still corrected out loud rather than quietly absorbed.
  function gather(tok, mode) {
    var w, out = [];
    if (mode === "stem") {
      if (D.wordIndex[tok]) out.push(tok);
      for (w in D.wordIndex) if (w !== tok && w.indexOf(tok) === 0) out.push(w);
      return out;
    }
    for (w in D.wordIndex) {
      var i = 0, m = Math.min(w.length, tok.length);
      while (i < m && w.charAt(i) === tok.charAt(i)) i++;
      if (i >= 6) out.push(w);
    }
    return out;
  }

  // Returns the concept, or {ambiguous:true} when a word could mean two of them. Ambiguous
  // beats everything downstream: "sport" must not be spell-corrected into one of its two
  // meanings just because the word matcher declined to choose.
  // Returns the concept it found, plus how many of the query's own words were ambiguous.
  // The veto below only fires when EVERY meaningful word was ambiguous — "coup" on its own is
  // a coin toss and must stay unresolved, but "helicopeer tour" still deserves the correction
  // pass even though "tour" alone means nothing.
  function matchWord(q, mode) {
    var best = null, words = 0, ambiguous = 0;
    q.split(" ").forEach(function (tok) {
      if (tok.length < 4) return;
      words++;
      if (D.ambiguousWord[tok]) { ambiguous++; return; }
      var found = gather(tok, mode);
      if (!found.length) return;
      var intent = conceptOfWords(found);
      if (!intent) { ambiguous++; return; }
      var longest = found.reduce(function (a, b) { return b.length > a.length ? b : a; });
      if (!best || tok.length > best.typed.length) best = { word: longest, typed: tok, intent: intent };
    });
    return { hit: best, allAmbiguous: !best && words > 0 && ambiguous === words };
  }

  // correct() only knows whole phrases, so a one-word typo — "ballon" for balloon — never
  // reaches it. Correct against the word index too, and only when the fix is unambiguous.
  function correctWord(q, market) {
    var best = null, ambiguous = 0, words = 0;
    q.split(" ").forEach(function (tok) {
      if (tok.length < 4 || D.ambiguousWord[tok]) return;
      words++;
      var cap = budget(tok), found = [], w;
      if (!cap) return;
      for (w in D.wordIndex) if (distance(tok, w, cap) <= cap) found.push(w);
      if (!found.length) return;
      var intent = conceptOfWords(found);
      if (!intent) { ambiguous++; return; }
      // "masage" in London should correct to "massage", not to the Spanish "masaje", even
      // though both are one edit away and both mean the same concept.
      var pick = found.reduce(function (a, b) {
        var da = distance(tok, a, cap), db = distance(tok, b, cap);
        if (db !== da) return db < da ? b : a;
        var na = isNative(a, market) || homeMarket(a) === market;
        var nb = isNative(b, market) || homeMarket(b) === market;
        if (na !== nb) return nb ? b : a;
        return b < a ? b : a;
      });
      if (!best || tok.length > best.typed.length) best = { word: pick, typed: tok, intent: intent };
    });
    return { hit: best, allAmbiguous: !best && words > 0 && ambiguous === words };
  }

  function understand(raw, market) {
    var q = normalise(raw);
    var step = { raw: raw, normalised: q, corrected: null, intent: null, matchedTerm: null,
                 crossLanguage: false, queryLanguage: null, empty: q.length === 0 };
    if (step.empty) return step;

    var hit = matchTerm(q);
    if (!hit) {
      var stem = matchWord(q, "stem"), loose = stem.hit;
      if (stem.allAmbiguous) { step.ambiguous = true; return step; }
      if (!loose) {
        var fix = correct(q, market);
        if (fix) {
          var h2 = matchTerm(fix.word);
          if (h2) { step.corrected = fix.word; hit = h2; }
        }
        if (!hit) {
          var cw = correctWord(q, market);
          if (cw.allAmbiguous) { step.ambiguous = true; return step; }
          if (cw.hit) {
            step.intent = cw.hit.intent;
            step.matchedTerm = cw.hit.word;
            step.corrected = cw.hit.word;
            return step;
          }
          var pre = matchWord(q, "prefix");
          if (pre.allAmbiguous) { step.ambiguous = true; return step; }
          loose = pre.hit;
        }
      }
      if (!hit && loose) {
        step.intent = loose.intent;
        step.matchedTerm = loose.word;
        step.looseWord = loose.word;
        step.looseTyped = loose.typed;
        return step;
      }
    }
    if (!hit) return step;

    step.intent = hit.intent;
    step.matchedTerm = hit.term;
    var home = homeMarket(hit.term);
    if (home && home !== market && !isNative(hit.term, market)) {
      step.crossLanguage = true;
      step.queryLanguage = D.lang[home];
      step.termHomeMarket = home;
    }
    return step;
  }

  /* --- retrieval -------------------------------------------------------- */

  // rating desc, price asc, deal_id asc. No other input, so no run can differ.
  function rank(a, b) {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (a.price !== b.price) return a.price - b.price;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  // Closest concept first, then the usual deterministic order. Ranking only: affinity
  // never adds or removes a result, and the interface says the ordering is a judgment.
  function byAffinity(intent) {
    var order = {};
    // A deal that IS the concept asked for comes first even when the catalog never names
    // that concept in the customer's words — an unlimited class pass is the closest thing to
    // a crossfit search, whatever the title says.
    order[intent.key] = -1;
    (intent.affinity || []).forEach(function (k, i) { order[k] = i; });
    return function (a, b) {
      var ka = order[D.conceptOf[a.id]], kb = order[D.conceptOf[b.id]];
      ka = ka === undefined ? 99 : ka;
      kb = kb === undefined ? 99 : kb;
      if (ka !== kb) return ka - kb;
      return rank(a, b);
    };
  }

  function cityDeals(market, city) { return (D.byCity[market + "|" + city] || []).slice(); }
  function cityCat(market, city, cat) { return (D.byCityCat[market + "|" + city + "|" + cat] || []).slice(); }

  function namesConcept(deal, intent) {
    var t = intent.titleTerms, i;
    for (i = 0; i < t.length; i++) if (deal.ntitle.indexOf(t[i]) >= 0) return true;
    return false;
  }

  // Same category, elsewhere in the same market — the only "nearest" the data supports.
  function elsewhereInMarket(market, city, cat, intent) {
    var out = [], k;
    for (k in D.byCityCat) {
      var p = k.split("|");
      if (p[0] !== market || p[1] === city || p[2] !== cat) continue;
      D.byCityCat[k].forEach(function (d) { if (!intent || namesConcept(d, intent)) out.push(d); });
    }
    return out.sort(rank);
  }

  // Real cards for a query we could not read. Groupon's own empty state calls these "similar
  // deals"; nothing here can support the word similar, so they are the best-rated deal in each
  // of the biggest categories and they are labeled as exactly that.
  function popularIn(market, city) {
    var tiles = city ? categoryTiles(market, city) : catalogueTiles();
    return tiles.slice(0, 3).map(function (t) {
      var pool = city ? cityCat(market, city, t.cat)
                      : D.deals.filter(function (r) { return r[5] === t.cat; })
                          .map(function (r) { return D.dealById[r[0]]; }).sort(rank);
      return pool[0];
    }).filter(Boolean);
  }

  function catalogueTiles() {
    var c = {};
    D.deals.forEach(function (r) { c[r[5]] = (c[r[5]] || 0) + 1; });
    return Object.keys(c).map(function (k) {
      return { cat: k, label: D.catLabel[k] || k, count: c[k] };
    }).sort(function (a, b) { return b.count - a.count || (a.cat < b.cat ? -1 : 1); });
  }

  function categoryTiles(market, city) {
    var c = D.cityIndex[market + "|" + city];
    if (!c) return [];
    return Object.keys(c.cats).map(function (k) {
      return { cat: k, label: D.catLabel[k] || k, count: c.cats[k] };
    }).sort(function (a, b) { return b.count - a.count || (a.cat < b.cat ? -1 : 1); });
  }

  /* --- the eight response types ----------------------------------------- */

  var CODES = ["MATCHED", "TRANSLATED", "CORRECTED", "CATEGORY ONLY", "THIN",
               "NOT SOLD HERE", "ABOVE CEILING", "NOT UNDERSTOOD"];
  // Which badge leads when several apply.
  var ORDER = { "NOT UNDERSTOOD": 0, "NOT SOLD HERE": 1, "TRANSLATED": 2, "CORRECTED": 3,
                "THIN": 4, "CATEGORY ONLY": 5, "MATCHED": 6, "ABOVE CEILING": 7 };

  var THIN_MAX = 2;   // 1-2 results is Part A's dead band: 2,087 searches, 1.7% conversion

  function q(s) { return "“" + s + "”"; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function article(w) { return ("aeiou".indexOf(w[0]) >= 0 ? "an " : "a ") + w; }

  function proposed(raw, market, city) {
    var step = understand(raw, market);
    var mkt = D.marketIndex[market];
    var out = { step: step, market: market, city: city, lines: [], exact: [], adjacent: [],
                adjacentLabel: null, alternative: null, tiles: [], notify: null,
                cityTotal: (D.cityIndex[market + "|" + city] || {}).deals || 0,
                intentLabel: null, category: null, unvalidated: false, state: null };
    function say(code, text) { out.lines.push({ code: code, text: text }); }

    if (step.empty || !step.intent) {
      out.state = "not-understood";
      out.tiles = categoryTiles(market, city);
      out.popular = popularIn(market, city);
      if (!step.empty) {
        var asked = askedFor(step.normalised, market, city);
        out.notify = { concept: String(raw).trim(), raw: true,
                       demandCity: asked.city, demandMarket: asked.market };
      }
      say("NOT UNDERSTOOD", step.empty
        ? "Nothing typed yet. Here is what " + city + " actually sells."
        : "Nothing in the catalog matches " + q(String(raw).trim()) +
          " — and search cannot tell whether that is because we do not sell it, or because we " +
          "have not learned the word. Here is what " + city + " does sell.");
      return finish(out);
    }

    out.intentLabel = step.intent.label;
    out.category = step.intent.cat;

    if (step.corrected) {
      say("CORRECTED", "Searched for " + q(step.corrected) + " instead of " + q(normalise(raw)) + ".");
    }
    if (step.crossLanguage && step.intent.cat) {
      var sameWords = normalise(step.intent.label).indexOf(step.matchedTerm) >= 0;
      say("TRANSLATED", "Read as " + step.queryLanguage + " in " +
        (D.lang[market] === "English" ? "an English-speaking" : "a " + D.lang[market]) + " market. " +
        (sameWords ? "Matched on intent, not on the " + D.lang[market] + " deal titles."
                   : q(step.matchedTerm) + " → " + step.intent.label + "."));
    }

    // 1. The concept exists nowhere in the catalog — the six high-ticket ones.
    if (!step.intent.cat) {
      out.state = "not-sold-anywhere";
      out.unvalidated = true;
      say("NOT SOLD HERE", "No " + step.intent.phrase + " is listed on Groupon in " +
        city + " — or in any of the five markets. This is a supply gap, not a failed search.");
      say("ABOVE CEILING", "The most expensive deal in " + mkt.name + " is $" + mkt.maxPrice.toFixed(2) +
        " (median $" + mkt.medianPrice.toFixed(2) + "). Nothing in the catalog is priced like " +
        article(step.intent.phrase) + ".");
      var adj = step.intent.adjacent ? D.byIntent[step.intent.adjacent] : null;
      if (adj) {
        var cand = cityCat(market, city, adj.cat).filter(function (d) { return namesConcept(d, adj); });
        if (cand.length) out.alternative = { deal: cand[0], label: adj.label, count: cand.length };
      }
      out.tiles = categoryTiles(market, city);
      out.notify = notify(step.intent, market, city, true);
      return finish(out);
    }

    // 2. The concept has a category. Split the city's stock into deals that name the
    //    concept and deals that only share its category.
    var pool = cityCat(market, city, step.intent.cat);
    var exact = [], adjacent = [];
    pool.forEach(function (d) {
      (step.intent.titleTerms.length && namesConcept(d, step.intent) ? exact : adjacent).push(d);
    });
    out.exact = exact;
    out.adjacent = adjacent.sort(byAffinity(step.intent));
    out.affinityOrdered = adjacent.length > 1 && (step.intent.affinity || []).length > 0;
    out.adjacentLabel = D.catLabel[step.intent.cat] || step.intent.cat;
    var total = exact.length + adjacent.length;

    // The catalog CAN name this concept — it just holds none of it in this city. That is a
    // local supply gap, and saying "here are some beauty deals" without saying "Paris has
    // eight manicures" would bury the useful half of the answer.
    if (exact.length === 0 && step.intent.titleTerms.length) {
      out.state = "not-in-city";
      var near = elsewhereInMarket(market, city, step.intent.cat, step.intent);
      var where = {};
      near.forEach(function (d) { where[d.city] = (where[d.city] || 0) + 1; });
      var best = Object.keys(where).sort(function (a, b) { return where[b] - where[a] || (a < b ? -1 : 1); })[0];
      out.nearest = best ? { city: best, count: where[best], total: near.length, deal: near[0],
                             cities: where } : null;
      say("NOT SOLD HERE", out.nearest
        ? "No " + step.intent.phrase + " in " + city + " right now. " + mkt.name + " has " +
          plural(out.nearest.total, "elsewhere", "elsewhere") + " — most of them in " +
          out.nearest.city + " (" + out.nearest.count + ")."
        : "No " + step.intent.phrase + " anywhere in " + mkt.name + " right now.");
      out.tiles = categoryTiles(market, city);
      out.notify = notify(step.intent, market, city);
      return finish(out);
    }

    if (total === 0) {
      out.state = "not-in-city";
      out.nearest = null;
      say("NOT SOLD HERE", "No " + step.intent.phrase + " anywhere in " + mkt.name + " right now.");
      out.tiles = categoryTiles(market, city);
      out.notify = notify(step.intent, market, city);
      return finish(out);
    }

    // The catalog never names this concept. Whether we may say "we do not have it" depends
    // entirely on the category: activities holds 132 deals and every one of them is a known
    // escape room, karting session or city tour, so paintball is provably not among them.
    // Dining holds 100 generic tasting menus, so "Madrid has no sushi" would be a guess — and
    // 48 of the fitness deals are an unlimited class pass, which a crossfit class could be.
    if (exact.length === 0 && D.deniable[step.intent.cat]) {
      out.state = "not-stocked-here";
      out.alternative = adjacent.length
        ? { deal: adjacent[0], label: conceptLabel(adjacent[0]),
            count: adjacent.filter(function (d) {
              return D.conceptOf[d.id] === D.conceptOf[adjacent[0].id]; }).length }
        : null;
      say("NOT SOLD HERE", "Groupon does not sell " + step.intent.label.toLowerCase() + " in " + city +
        ". Every one of the " + plural(adjacent.length, out.adjacentLabel.toLowerCase() + " deal",
        out.adjacentLabel.toLowerCase() + " deals") + " here is something else, and we know which.");
      out.tiles = categoryTiles(market, city);
      out.notify = notify(step.intent, market, city);
      return finish(out);
    }

    if (total <= THIN_MAX) {
      out.state = "thin";
      say("THIN", city + " holds " + plural(out.cityTotal, "deal", "deals") + " in total — " +
        (exact.length
          ? plural(exact.length, "matches", "match") + " " + q(step.matchedTerm)
          : "none names " + step.matchedTerm) +
        (adjacent.length ? ", " + plural(adjacent.length, "more shares", "more share") + " its category." : ".") +
        " A result set this small converts like an empty one.");
    } else if (exact.length > 0) {
      out.state = "matched";
      say("MATCHED", plural(exact.length, "deal", "deals") + " in " + city + " " +
        (exact.length === 1 ? "matches " : "match ") + q(step.corrected || String(raw).trim()) +
        (adjacent.length ? ", plus " + plural(adjacent.length, "more", "more") + " in " + out.adjacentLabel.toLowerCase() + "." : "."));
    } else {
      out.state = "category-only";
      say("CATEGORY ONLY", "No deal in " + city + " is named " + q(step.matchedTerm) + ". " +
        plural(adjacent.length, out.adjacentLabel.toLowerCase() + " deal", out.adjacentLabel.toLowerCase() + " deals") +
        ", shown as " + out.adjacentLabel.toLowerCase() + " — not as " + step.matchedTerm + ".");
    }
    return finish(out);
  }

  function conceptLabel(deal) {
    var it = D.byIntent[D.conceptOf[deal.id]];
    return it ? it.label : deal.title;
  }

  // "helicopter flights" reads right for the six no catalog holds; "paintball deals" does not.
  function askedFor(q, market, city) {
    var n = { city: 0, market: 0 }, k;
    for (k in D.log) {
      var p = k.split("|");
      if (p.slice(2).join("|") !== q) continue;
      if (p[0] === market) n.market += D.log[k][0];
      if (p[0] === market && p[1] === city) n.city += D.log[k][0];
    }
    return n;
  }

  function notify(intent, market, city, plural) {
    if (!market) {
      var total = 0, k;
      for (k in D.stats.demandMarket) if (k.indexOf(intent.key + "|") === 0) total += D.stats.demandMarket[k];
      return { concept: plural ? intent.phrase + "s" : intent.label.toLowerCase(), city: null,
               demandCity: 0, demandMarket: total, demandTotal: total, everywhere: true };
    }
    var everywhere = 0, kk;
    for (kk in D.stats.demandMarket) if (kk.indexOf(intent.key + "|") === 0) everywhere += D.stats.demandMarket[kk];
    return { concept: plural ? intent.phrase + "s" : intent.label.toLowerCase(), city: city,
             demandCity: D.stats.demandCity[intent.key + "|" + market + "|" + city] || 0,
             demandMarket: D.stats.demandMarket[intent.key + "|" + market] || 0,
             demandTotal: everywhere };
  }

  function finish(out) {
    if (out.step && out.step.looseWord && out.lines.length) {
      var typed = (out.step.normalised || "").split(" ").filter(Boolean);
      out.lines[0].text += " Read " + (typed.length > 1 ? "from the word " : "") + "“" +
        out.step.looseTyped + "” as " + out.step.intent.label.toLowerCase() + ".";
    }
    out.lines.sort(function (a, b) { return ORDER[a.code] - ORDER[b.code]; });
    out.primary = out.lines[0] || null;
    out.secondary = out.lines.slice(1);
    out.results = out.exact.concat(out.adjacent);
    out.count = out.results.length;
    // Invariant, asserted rather than assumed: a city can never answer with more
    // deals than it holds.
    if (out.count > out.cityTotal) {
      throw new Error("inventory cap violated: " + out.count + " > " + out.cityTotal +
                      " in " + out.city);
    }
    return out;
  }

  /* --- the whole catalog at once -------------------------------------------------
     A scope a customer never sees: it answers "does this exist anywhere?" in one step,
     which is the fastest way to check the claim that nine concepts are stocked nowhere. */

  function proposedAll(raw) {
    var step = understand(raw, null);
    step.crossLanguage = false;               // there is no market to be foreign to
    var out = { step: step, market: null, city: null, all: true, lines: [], exact: [], adjacent: [],
                perCity: [], cityTotal: D.deals.length, tiles: [], notify: null,
                adjacentLabel: null, intentLabel: null, category: null, state: null };
    function say(code, text) { out.lines.push({ code: code, text: text }); }

    out.tiles = catalogueTiles();
    if (step.empty || !step.intent) {
      out.state = "not-understood";
      out.popular = popularIn(null, null);
      if (!step.empty) out.notify = { concept: String(raw).trim(), raw: true,
                                      demandCity: 0, demandMarket: 0 };
      say("NOT UNDERSTOOD", step.empty
        ? "Nothing typed yet."
        : "Nothing in any of the " + D.deals.length + " deals matches “" + String(raw).trim() +
          "”. Here is what the catalog does hold.");
      return finishAll(out);
    }
    out.intentLabel = step.intent.label;
    out.category = step.intent.cat;
    if (step.corrected) say("CORRECTED", "Searched for “" + step.corrected + "” instead of “" + normalise(raw) + "”.");

    if (!step.intent.cat) {
      out.state = "not-sold-anywhere";
      out.unvalidated = true;
      say("NOT SOLD HERE", "No " + step.intent.phrase + " anywhere. Checked every one of the " +
        D.deals.length + " deals in all " + D.cities.length + " cities: not one of them is " +
        step.intent.label.toLowerCase() + ".");
      say("ABOVE CEILING", "The most expensive deal in the whole catalog is $" +
        D.stats.maxPrice.toFixed(2) + " (median $" + D.stats.medianPrice.toFixed(2) + ").");
      // The city-scoped answer offers a closest thing; the catalog-wide one has to as well,
      // and it can say where in the twenty cities that closest thing actually lives.
      alternativeAcross(out, step.intent);
      out.notify = notify(step.intent, null, null, true);
      return finishAll(out);
    }

    D.cities.forEach(function (c) {
      var pool = cityCat(c[0], c[1], step.intent.cat), ex = [], adj = [];
      pool.forEach(function (d) {
        (step.intent.titleTerms.length && namesConcept(d, step.intent) ? ex : adj).push(d);
      });
      out.exact = out.exact.concat(ex);
      out.adjacent = out.adjacent.concat(adj);
      out.perCity.push({ market: c[0], city: c[1], exact: ex.length, adjacent: adj.length, deals: c[2] });
    });
    out.exact.sort(rank);
    out.adjacent.sort(byAffinity(step.intent));
    out.adjacentLabel = D.catLabel[step.intent.cat] || step.intent.cat;
    out.withExact = out.perCity.filter(function (r) { return r.exact > 0; }).length;

    if (out.exact.length === 0 && D.deniable[step.intent.cat]) {
      out.state = "not-stocked-here";
      say("NOT SOLD HERE", "Groupon does not sell " + step.intent.label.toLowerCase() +
        " anywhere. All " + out.adjacent.length + " " + out.adjacentLabel.toLowerCase() +
        " deals in the catalog are named, different things.");
      if (out.adjacent.length) {
        var key = D.conceptOf[out.adjacent[0].id];
        var same = out.adjacent.filter(function (d) { return D.conceptOf[d.id] === key; });
        var where = {};
        same.forEach(function (d) { where[d.city] = 1; });
        out.alternative = { deal: same[0], label: conceptLabel(same[0]), count: same.length };
        out.altConcept = D.byIntent[key];
        out.altCities = Object.keys(where).length;
      }
    } else if (out.exact.length === 0) {
      out.state = "category-only";
      say("CATEGORY ONLY", "No deal in the whole catalog is named “" + step.matchedTerm + "”. " +
        out.adjacent.length + " " + out.adjacentLabel.toLowerCase() +
        " deals, shown as " + out.adjacentLabel.toLowerCase() + ".");
    } else {
      out.state = "matched";
      say("MATCHED", plural(out.exact.length, "deal", "deals") + " across " +
        plural(out.withExact, "city", "cities") + " match “" +
        (step.corrected || String(raw).trim()) + "”" +
        (out.adjacent.length ? ", plus " + out.adjacent.length + " more in " +
          out.adjacentLabel.toLowerCase() + "." : "."));
    }
    return finishAll(out);
  }

  // The nearest real concept, ranked across the whole catalog, plus where it exists.
  function alternativeAcross(out, intent) {
    var adj = intent.adjacent ? D.byIntent[intent.adjacent] : null;
    if (!adj || !adj.cat) return;
    var all = [];
    D.cities.forEach(function (c) {
      var hits = cityCat(c[0], c[1], adj.cat).filter(function (d) { return namesConcept(d, adj); });
      all = all.concat(hits);
      out.perCity.push({ market: c[0], city: c[1], exact: hits.length, adjacent: 0, deals: c[2] });
    });
    all.sort(rank);
    out.altConcept = adj;
    out.altCities = out.perCity.filter(function (r) { return r.exact > 0; }).length;
    if (all.length) out.alternative = { deal: all[0], label: adj.label, count: all.length };
  }

  function finishAll(out) {
    out.lines.sort(function (a, b) { return ORDER[a.code] - ORDER[b.code]; });
    out.primary = out.lines[0] || null;
    out.secondary = out.lines.slice(1);
    out.results = out.exact.concat(out.adjacent);
    out.count = out.results.length;
    if (out.count > D.deals.length) throw new Error("catalog cap violated: " + out.count);
    return out;
  }

  function todayAll(raw) {
    var qn = normalise(raw), vals = [], runs = 0, clicks = 0, purch = 0, cities = 0, id = null;
    D.cities.forEach(function (c) {
      var rec = D.log[c[0] + "|" + c[1] + "|" + qn];
      if (!rec) return;
      cities++; runs += rec[0]; vals = vals.concat(rec[1]); clicks += rec[2]; purch += rec[3];
      id = id || rec[5];
    });
    if (!runs) return { query: qn, logged: false, count: 0, runs: 0, values: [], all: true };
    return { query: qn, logged: true, all: true, runs: runs, values: vals, clicks: clicks,
             purchases: purch, cities: cities, queryId: id,
             min: Math.min.apply(null, vals), max: Math.max.apply(null, vals),
             stable: Math.min.apply(null, vals) === Math.max.apply(null, vals),
             count: vals[hash(qn) % vals.length] };
  }

  /* --- what the system does today --------------------------------------- */

  // The bands the current system draws from. 3 never occurs in 8,997 rows.
  var BANDS = [[0, 0], [1, 2], [4, 25], [26, 40]];

  function today(raw, market, city, runIndex) {
    var qn = normalise(raw);
    var key = market + "|" + city + "|" + qn;
    var rec = D.log[key] || null;
    var out = { query: qn, key: key, logged: !!rec, runIndex: runIndex || 0 };

    if (!qn) { out.count = 0; out.runs = 0; out.min = 0; out.max = 0; out.values = []; return out; }

    if (rec) {
      out.runs = rec[0];
      out.values = rec[1];
      out.clicks = rec[2];
      out.purchases = rec[3];
      out.segment = rec[4];
      out.queryId = rec[5];
      out.rawQuery = rec[6];
      out.min = Math.min.apply(null, out.values);
      out.max = Math.max.apply(null, out.values);
      out.count = out.values[(hash(key) + out.runIndex) % out.values.length];
      out.stable = out.min === out.max;
    } else {
      // Not in the log. Reconstruct from the generator's own bands, deterministically,
      // and label it as a reconstruction rather than passing it off as recorded.
      var h = hash(key + "#" + out.runIndex);
      var b = BANDS[h % BANDS.length];
      out.count = b[0] + (b[1] > b[0] ? h % (b[1] - b[0] + 1) : 0);
      out.runs = 0; out.values = []; out.min = null; out.max = null; out.stable = false;
    }
    return out;
  }

  /* --- which Part A finding this query exercises ------------------------- */

  var FINDINGS = {
    F1: { id: "F1", name: "The dead zone", stat: "2,087 searches returned 1–2 results and converted at 1.7%, against 17.8% in the 4–25 band." },
    F2: { id: "F2", name: "Blind to the catalog", stat: "The number of results has no relationship to the matching catalog (r = +0.02)." },
    F3: { id: "F3", name: "Unstable results", stat: "Of 411 query-city pairs with ≥8 searches, 0 of the 337 that ever return anything are stable." },
    F4: { id: "F4", name: "Wrong language", stat: "347 foreign-language searches produced 2 purchases — 0.58%, against 10.58% for local-language searches." },
    F5: { id: "F5", name: "Vocabulary gap", stat: "The catalog carries 75 distinct titles across 568 deals, and names none of the things customers actually type." },
    F6: { id: "F6", name: "Nothing to sell", stat: "1,512 searches for six experiences no catalog holds — 0 clicks, 0 purchases, 57% of every zero-result search." },
    F7: { id: "F7", name: "Impossible counts", stat: "585 searches (6.5%) returned more results than the city holds deals in total." },
    F8: { id: "F8", name: "Overload", stat: "471 searches returned 26–40 results and converted at 2.3% — worse than showing four." },
    F10: { id: "F10", name: "Misspellings", stat: "581 misspelled searches convert at 4.65%; in the healthy band a typo drops conversion 18.2% → 11.5%." }
  };

  function findings(t, p) {
    var out = [];
    function add(f) { if (f && out.indexOf(f) < 0) out.push(f); }
    // The state the answer ended in leads, because that is what the screen is showing. Only
    // then the modifiers that got it there, and last the defects visible in the old pane.
    if (p.state === "not-sold-anywhere") add(FINDINGS.F6);
    if (p.state === "not-stocked-here") add(FINDINGS.F2);
    if (p.state === "not-in-city") add(FINDINGS.F1);
    if (p.step.crossLanguage && p.step.intent && p.step.intent.cat) add(FINDINGS.F4);
    if (p.step.corrected) add(FINDINGS.F10);
    if (p.state === "category-only") add(FINDINGS.F5);
    if (p.state === "thin") add(FINDINGS.F1);
    if (t.logged && t.max > p.cityTotal) add(FINDINGS.F7);
    if (t.logged && t.max > 25) add(FINDINGS.F8);
    if (t.logged && !t.stable && t.runs >= 2) add(FINDINGS.F3);
    add(FINDINGS.F2);
    return out;
  }

  // What the right-hand pane changed about the left-hand one, in one sentence, from the
  // real numbers rather than a canned string.
  function whatChanged(t, p) {
    var where = p.city || "the catalog";
    var was = t.logged
      ? (t.stable ? t.min + (t.min === 1 ? " result" : " results") + " every time"
                  : "anywhere from " + t.min + " to " + t.max + " results")
      : "a count drawn from a fixed set of bands";
    switch (p.state) {
      case "not-sold-anywhere":
        return "Was " + was + ", with no reason given. Now the screen says why, offers the nearest real thing, and records the demand.";
      case "not-stocked-here":
        return "Was " + was + ", none of them the thing that was asked for. Now we say we do not stock it — and we can say it, because every " +
               (p.adjacentLabel || "").toLowerCase() + " deal in " + where + " is a known, different thing.";
      case "not-in-city":
        return "Was " + was + " from the same category, with no way to tell they were not the thing " +
               "asked for. Now they are labeled as the category they are" +
               (p.nearest ? ", and the " + p.nearest.total + " the market does hold are named" : "") + ".";
      case "category-only":
        return "Was " + was + ", passed off as a match. Now " + p.count + ", labeled as " +
               (p.adjacentLabel || "").toLowerCase() + " rather than as " + p.step.matchedTerm + ".";
      case "thin":
        return "Was " + was + ". Now " + p.count + " — which is all " + where + " has, said out loud.";
      case "not-understood":
        return "Was " + was + " and a dead end. Now: what " + p.city + " does actually sell.";
      default:
        var extra = [];
        if (p.step.crossLanguage) extra.push("the language it was typed in stopped mattering");
        if (p.step.corrected) extra.push("the typo was corrected before searching, not after");
        if (t.logged && t.max > p.cityTotal) extra.push("the count can no longer exceed the " +
          p.cityTotal + " deals " + where + " holds");
        if (t.logged && !t.stable) extra.push("the answer is the same on every run");
        return "Was " + was + ". Now " + p.count +
               (extra.length ? " — " + extra.join(", ") + "." : ", counted from the catalog itself.");
    }
  }

  function run(raw, market, city, runIndex) {
    var t = today(raw, market, city, runIndex);
    var p = proposed(raw, market, city);
    return { query: raw, market: market, city: city, today: t, proposed: p,
             findings: findings(t, p), changed: whatChanged(t, p) };
  }

  /* --- serialisation, for the determinism test --------------------------- */

  function serialise(p) {
    return JSON.stringify({
      state: p.state, lines: p.lines,
      exact: p.exact.map(function (d) { return d.id; }),
      adjacent: p.adjacent.map(function (d) { return d.id; }),
      alternative: p.alternative ? p.alternative.deal.id : null,
      tiles: p.tiles, nearest: p.nearest ? p.nearest.city : null
    });
  }

  root.PBEngine = { init: init, run: run, today: today, proposed: proposed, FINDINGS: FINDINGS,
                    proposedAll: proposedAll, todayAll: todayAll, findingsFor: findings,
                    understand: understand, normalise: normalise, distance: distance,
                    categoryTiles: categoryTiles, serialise: serialise,
                    CODES: CODES, THIN_MAX: THIN_MAX,
                    data: function () { return D; } };
})(typeof module !== "undefined" && module.exports ? module.exports : window);
