/* TESTING.md gate 1 — the four engine invariants, plus the ten acceptance queries.
   Runs in node against the built bundle. Exits non-zero on any failure.
       node part-b/test_engine.js                            */
var fs = require("fs"), path = require("path"), assert = require("assert");
var HERE = __dirname;
// the two CSVs, wherever the repo has been unpacked
var ROOT = [path.join(HERE, "..", "data"), path.join(HERE, ".."), path.resolve(HERE, "../..")]
  .filter(function (d) { return fs.existsSync(path.join(d, "deals.csv")); })[0];
var E = require(path.join(HERE, "pb_engine.js")).PBEngine;
var bundle = JSON.parse(fs.readFileSync(path.join(HERE, "prototype_data.json"), "utf8"));
E.init(bundle);

var fails = 0, checks = 0;
function ok(cond, label, detail) {
  checks++;
  if (cond) return true;
  fails++;
  console.log("  FAIL  " + label + (detail ? "  — " + detail : ""));
  return false;
}

/* Read the log straight from the CSV, so the test does not trust the bundle. */
function csv(file) {
  var txt = fs.readFileSync(path.join(ROOT, file), "utf8").trim().split("\n");
  var head = txt[0].split(",");
  return txt.slice(1).map(function (line) {
    var cells = [], cur = "", q = false, i, ch;
    for (i = 0; i < line.length; i++) {
      ch = line[i];
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    var o = {}; head.forEach(function (h, j) { o[h] = cells[j]; });
    return o;
  });
}
var log = csv("search_log.csv");
var deals = csv("deals.csv");
var cityTotal = {};
deals.forEach(function (d) {
  var k = d.market + "|" + d.city;
  cityTotal[k] = (cityTotal[k] || 0) + 1;
});
var dealIds = {};
deals.forEach(function (d) { dealIds[d.deal_id] = d; });

console.log("Honest Search — engine tests");
console.log(log.length + " logged searches · " + deals.length + " deals · " +
            Object.keys(cityTotal).length + " cities\n");

/* --- 1. Inventory cap --------------------------------------------------- */
console.log("1. Inventory cap — no query may return more than the city holds");
var keys = {};
log.forEach(function (r) { keys[r.market + "|" + r.city + "|" + E.normalise(r.raw_query)] = r; });
var keyList = Object.keys(keys), capViolations = 0;
keyList.forEach(function (k) {
  var r = keys[k], p;
  try { p = E.proposed(r.raw_query, r.market, r.city); }
  catch (e) { capViolations++; console.log("  FAIL  threw on " + k + ": " + e.message); return; }
  if (p.count > (cityTotal[r.market + "|" + r.city] || 0)) {
    capViolations++;
    console.log("  FAIL  " + k + ": " + p.count + " > " + cityTotal[r.market + "|" + r.city]);
  }
});
ok(capViolations === 0, keyList.length + " distinct (market, city, query) keys", capViolations + " violations");
console.log("   " + keyList.length + " keys checked, " + capViolations + " violations\n");

/* --- 2. Determinism ------------------------------------------------------ */
console.log("2. Determinism — same query, same city, identical answer");
var diffs = 0, sample = [];
for (var i = 0; i < 100; i++) sample.push(keys[keyList[(i * 97 + 13) % keyList.length]]);
sample.forEach(function (r) {
  var a = E.serialise(E.proposed(r.raw_query, r.market, r.city));
  var b = E.serialise(E.proposed(r.raw_query, r.market, r.city));
  if (a !== b) { diffs++; console.log("  FAIL  " + r.raw_query + " / " + r.city); }
});
// and a full re-init, to catch state that leaks between runs
E.init(bundle);
sample.forEach(function (r) {
  var a = E.serialise(E.proposed(r.raw_query, r.market, r.city));
  if (a !== E.serialise(E.proposed(r.raw_query, r.market, r.city))) diffs++;
});
ok(diffs === 0, "100 queries run twice (and after a re-init)", diffs + " differences");
console.log("   200 comparisons, " + diffs + " differences\n");

/* --- 3. Provenance ------------------------------------------------------- */
console.log("3. Provenance — every card is a real deal, in the selected city");
var orphans = 0;
keyList.forEach(function (k) {
  var r = keys[k], p = E.proposed(r.raw_query, r.market, r.city);
  var cards = p.results.concat(p.alternative ? [p.alternative.deal] : []);
  cards.forEach(function (d) {
    var real = dealIds[d.id];
    if (!real || real.market !== r.market || real.city !== r.city) {
      orphans++;
      console.log("  FAIL  " + k + " returned " + d.id);
    }
  });
});
ok(orphans === 0, "every returned deal_id exists in deals.csv and sits in the selected city",
   orphans + " orphans");
console.log("   " + orphans + " orphans\n");

/* --- 4. Total coverage --------------------------------------------------- */
console.log("4. Total coverage — all 8,997 logged queries answered, none crashes");
var crashes = 0, unlabeled = 0, byCode = {};
log.forEach(function (r) {
  var p;
  try { p = E.proposed(r.raw_query, r.market, r.city); }
  catch (e) { crashes++; return; }
  if (!p.primary || E.CODES.indexOf(p.primary.code) < 0) { unlabeled++; return; }
  byCode[p.primary.code] = (byCode[p.primary.code] || 0) + 1;
});
ok(crashes === 0, "no exceptions", crashes + " crashes");
ok(unlabeled === 0, "every answer carries one of the eight response codes", unlabeled + " unlabeled");
Object.keys(byCode).sort(function (a, b) { return byCode[b] - byCode[a]; }).forEach(function (c) {
  console.log("   " + (byCode[c] + "").padStart(5) + "  " + (100 * byCode[c] / log.length).toFixed(1).padStart(5) + "%  " + c);
});
console.log("");

/* --- Gate 2 — the ten acceptance queries -------------------------------- */
console.log("5. Acceptance queries (PRD §10)");
var ACCEPT = [
  { q: "back massage",        m: "GB", c: "Manchester", code: "MATCHED",        count: 5 },
  { q: "manicure",            m: "PL", c: "Kraków",     code: "THIN",           count: 2, exact: 1 },
  { q: "helicopter tour",     m: "GB", c: "London",     code: "NOT SOLD HERE",  count: 0, also: "ABOVE CEILING" },
  { q: "deep tissue massage", m: "DE", c: "Berlin",     code: "TRANSLATED",     count: 9 },
  { q: "susshi",              m: "GB", c: "London",     code: "CORRECTED",      count: 13, also: "CATEGORY ONLY" },
  { q: "sushi",               m: "ES", c: "Madrid",     code: "CATEGORY ONLY",  count: 7 },
  { q: "brunch",              m: "GB", c: "London",     code: "CATEGORY ONLY",  count: 13 },
  { q: "gym",                 m: "GB", c: "Manchester", code: "MATCHED",        count: 3, exact: 1 },
  // PRD §10 row 9 asks only that this is identical on both runs; the response code is a
  // build decision. It is NOT SOLD HERE because every one of London's 132-strong activities
  // category is a known concept, so the absence of paintball is a fact rather than a guess.
  { q: "paintball",           m: "GB", c: "London",     code: "NOT SOLD HERE",  count: 13 },
  { q: "asdfgh",              m: "GB", c: "London",     code: "NOT UNDERSTOOD", count: 0, tiles: 5 }
];
ACCEPT.forEach(function (t, i) {
  var p = E.proposed(t.q, t.m, t.c);
  var codes = p.lines.map(function (l) { return l.code; });
  var label = (i + 1) + ". " + t.q + " / " + t.c;
  var pass = ok(p.primary && p.primary.code === t.code, label + " → " + t.code,
                "got " + (p.primary ? p.primary.code : "nothing"));
  pass = ok(p.count === t.count, label + " → " + t.count + " results", "got " + p.count) && pass;
  if (t.exact !== undefined) pass = ok(p.exact.length === t.exact, label + " → " + t.exact + " exact", "got " + p.exact.length) && pass;
  if (t.also) pass = ok(codes.indexOf(t.also) >= 0, label + " → also " + t.also, "got " + codes.join(", ")) && pass;
  if (t.tiles) pass = ok(p.tiles.length === t.tiles, label + " → " + t.tiles + " category tiles", "got " + p.tiles.length) && pass;
  if (pass) console.log("   ok   " + label + "  " + codes.join(" + ") + "  · " + p.count + " results");
});
console.log("");

/* stability of the paintball pair, run twice, as the acceptance table asks */
var a1 = E.serialise(E.proposed("paintball", "GB", "London"));
var a2 = E.serialise(E.proposed("paintball", "GB", "London"));
ok(a1 === a2, "paintball / London — identical on both runs");

/* --- Gate 3 — adversarial input ------------------------------------------ */
console.log("\n6. Adversarial input (TESTING.md gate 3)");
var NASTY = ["", " ", "a", new Array(201).join("x"), "<script>alert(1)</script>",
             "masaż", "Wellness-Massage Paket", "massage 🎉", "   massage   ",
             "MASSAGE", "Ma  ssage", "111", "\t\n", "sushi sushi sushi", "-", "%%%",
             "escape room escape room", "gym!!!", "Ünïcödé", "'; DROP TABLE deals;--"];
NASTY.forEach(function (s) {
  var p, label = JSON.stringify(s.length > 30 ? s.slice(0, 30) + "…" : s);
  try { p = E.proposed(s, "ES", "Madrid"); }
  catch (e) { ok(false, "adversarial " + label, e.message); return; }
  ok(p.primary && E.CODES.indexOf(p.primary.code) >= 0, "adversarial " + label,
     "no response code");
  ok(p.state !== "not-understood" || p.tiles.length > 0, "adversarial " + label + " never blank",
     "not-understood with no category tiles");
});

/* --- any phrasing of a concept must land on the concept --------------------------- */
console.log("\n7b. Phrasings the log never contained");
[["helicopter flight","helicopter"],["helicopter adventure","helicopter"],["helicopter","helicopter"],
 ["scenic helicopter ride over london","helicopter"],["hot air balloon","balloon"],["balloon ride","balloon"],
 ["ballon","balloon"],["skydive","skydiving"],["shark dive","diving"],["rafting trip","rafting"],
 ["white water rafting","rafting"],["supercar experience","supercar"],["bowling alley","bowling"],
 ["paintball arena","paintball"],["eyelash lift","lashes"],["sushi restaurant","dining"]
].forEach(function (c) {
  var u = E.understand(c[0], "GB");
  ok(u.intent && u.intent.key === c[1], JSON.stringify(c[0]) + " reads as " + c[1],
     "got " + (u.intent ? u.intent.key : "nothing"));
});

/* a word that two concepts share must never resolve on its own — guessing is worse than not */
[["tour", "a city tour or a helicopter tour"], ["sportif", "massage sportif or coach sportif"]].forEach(function (c) {
  var u = E.understand(c[0], "GB");
  ok(!u.intent, JSON.stringify(c[0]) + " stays unresolved — " + c[1],
     "resolved to " + (u.intent ? u.intent.key : ""));
});

/* and nonsense still has to be refused, not stretched onto the nearest word */
["asdfgh", "zzzz", "xyzzy plugh", "qqqqqq", "1234567"].forEach(function (q) {
  var p = E.proposed(q, "GB", "London");
  ok(p.primary.code === "NOT UNDERSTOOD", JSON.stringify(q) + " is still not understood",
     "got " + p.primary.code);
});

/* --- stems, and the words that must never resolve ---------------------------------- */
console.log("\n7c. Stems and one-word typos");
[["raft","rafting"],["thai","massage"],["mass","massage"],["bowl","bowling"],["pila","classes"],
 ["mani","nails"],["supe","supercar"],["esca","escape"],["heli","helicopter"],["skyd","skydiving"],
 ["paint","paintball"],["ballon","balloon"],["helicoper","helicopter"]
].forEach(function (c) {
  var u = E.understand(c[0], "GB");
  ok(u.intent && u.intent.key === c[1], JSON.stringify(c[0]) + " reads as " + c[1],
     "got " + (u.intent ? u.intent.key : "nothing"));
});
[["sport","sportmassage or salle de sport"],["spor","the same"],["coup","coupe or couples massage"],
 ["fahr","kart fahren or ballon fahrt"],["tour","city tour or helicopter tour"],["sportif","either"]
].forEach(function (c) {
  var u = E.understand(c[0], "GB");
  ok(!u.intent, JSON.stringify(c[0]) + " stays unresolved — " + c[1],
     "resolved to " + (u.intent ? u.intent.key : ""));
});
/* a misspelling must still be corrected out loud, not absorbed as a stem */
[["susshi","sushi"],["raffting","rafting"],["crossfiit","crossfit"],["brnch","brunch"],
 ["mancure","manicure"],["wimpernverlngerung","wimpernverlangerung"]
].forEach(function (c) {
  var u = E.understand(c[0], "GB");
  ok(u.corrected === c[1], JSON.stringify(c[0]) + " is corrected to " + c[1],
     "got " + (u.corrected || "no correction"));
});
ok(E.understand("masage", "GB").corrected === "massage" &&
   E.understand("masage", "ES").corrected === "masaje",
   "a tie between spellings goes to the market's own",
   "GB=" + E.understand("masage","GB").corrected + " ES=" + E.understand("masage","ES").corrected);

/* --- the all-markets scope --------------------------------------------------------- */
console.log("\n7d. All markets at once");
var pa = E.proposedAll("paintball");
ok(pa.exact.length === 0 && pa.primary.code === "NOT SOLD HERE",
   "paintball is stocked in none of the 20 cities", "got " + pa.primary.code + ", " + pa.exact.length);
ok(pa.perCity.length === bundle.cities.length && pa.perCity.every(function (r) { return r.exact === 0; }),
   "…and every city reports zero", "some city reported a match");
var ma = E.proposedAll("manicure");
ok(ma.exact.length === 35 && ma.withExact === 14, "manicure: 35 deals across 14 cities",
   ma.exact.length + " across " + ma.withExact);
ok(ma.count <= bundle.deals.length, "all-markets never returns more than the catalog holds",
   ma.count + " > " + bundle.deals.length);
var ta = E.todayAll("paintball");
ok(ta.logged && ta.runs === 275 && ta.cities === 20,
   "the log aggregates across cities for the all-markets pane",
   ta.runs + " runs in " + ta.cities + " cities");

/* --- who may deny a concept, and who may not --------------------------------------- */
console.log("\n8. Denial is a fact in some categories and a guess in others");
[["paintball", "GB", "London", "not-stocked-here"],
 ["bowling", "ES", "Madrid", "not-stocked-here"],
 ["eyelash extensions", "DE", "Hamburg", "not-stocked-here"],
 ["sushi", "ES", "Madrid", "category-only"],
 ["brunch", "GB", "London", "category-only"],
 ["crossfit", "GB", "London", "category-only"]].forEach(function (c) {
  var p = E.proposed(c[0], c[1], c[2]);
  ok(p.state === c[3], c[0] + " / " + c[2] + " → " + c[3], "got " + p.state);
});
// the rule itself: a category may deny only when every one of its deals is a known concept
["activities", "beauty", "massage"].forEach(function (c) {
  ok(bundle.deniable[c] === 1, c + " may deny a concept", "flagged " + bundle.deniable[c]);
});
["dining", "fitness"].forEach(function (c) {
  ok(bundle.deniable[c] === 0, c + " may NOT deny a concept — it holds generic or umbrella deals",
     "flagged " + bundle.deniable[c]);
});

/* --- affinity ordering: closest concept first, never a change of result set ------- */
console.log("\n7. Affinity ordering and the concept-level city gap");
function concepts(p) {
  return p.results.map(function (d) { return E.data().conceptOf[d.id] || "-"; });
}
var pb = E.proposed("paintball", "GB", "London");
ok(concepts(pb)[0] === "karting", "paintball / London leads with go-karting, not a city tour",
   "led with " + concepts(pb)[0]);
ok(pb.results.length === 13, "paintball / London still returns all 13 activities deals",
   "got " + pb.results.length);
var bw = E.proposed("bowling", "GB", "London");
ok(concepts(bw)[0] === "escape", "bowling / London leads with the escape room",
   "led with " + concepts(bw)[0]);
var cf = E.proposed("crossfit", "GB", "London");
ok(concepts(cf)[0] === "classes", "crossfit / London leads with the unlimited class pass",
   "led with " + concepts(cf)[0]);
ok(cf.primary.code === "CATEGORY ONLY", "…and still says no deal is named crossfit",
   "got " + cf.primary.code);

/* affinity must be a pure reordering: same set of ids, whatever the order */
["paintball", "bowling", "crossfit", "eyelash extensions"].forEach(function (q) {
  var p = E.proposed(q, "GB", "London");
  var pool = deals.filter(function (d) {
    return d.city === "London" && d.category_l2 === p.category;
  }).map(function (d) { return d.deal_id; }).sort();
  var got = p.results.map(function (d) { return d.id; }).sort();
  ok(pool.join(",") === got.join(","), "affinity reorders " + q + ", it does not filter",
     pool.length + " in the city vs " + got.length + " returned");
});

/* --- the concept-level city gap ---------------------------------------------------- */
var mm = E.proposed("manicure", "FR", "Marseille");
ok(mm.state === "not-in-city", "manicure / Marseille is a local gap, not a category dump",
   "state " + mm.state);
ok(mm.nearest && mm.nearest.city === "Paris" && mm.nearest.count === 8,
   "…and names Paris with 8 deals",
   mm.nearest ? mm.nearest.city + " " + mm.nearest.count : "no nearest city");
ok(mm.notify && mm.tiles.length === 5, "…with the demand signal and the city's five categories",
   "tiles " + mm.tiles.length);

/* every one of these gaps must name a real elsewhere; count them for the record */
var gaps = 0, gapSearches = 0;
bundle.cities.forEach(function (c) {
  bundle.intents.forEach(function (it) {
    if (!it.cat || !it.titleTerms.length) return;
    var p = E.proposed(it.terms[0].t, c[0], c[1]);
    if (p.state !== "not-in-city") return;
    gaps++;
    ok(p.nearest && p.nearest.count > 0, "gap " + it.key + "/" + c[1] + " names a real city",
       "no nearest");
  });
});
Object.keys(bundle.log).forEach(function (k) {
  var parts = k.split("|"), rec = bundle.log[k];
  if (E.proposed(rec[6], parts[0], parts[1]).state === "not-in-city") gapSearches += rec[0];
});
console.log("   " + gaps + " concept-and-city gaps, carrying " + gapSearches +
            " of the month's searches, each naming a real alternative city");

/* the log row behind every logged answer must be quotable */
var withId = 0;
Object.keys(bundle.log).forEach(function (k) {
  var parts = k.split("|"), rec = bundle.log[k];
  var t = E.today(rec[6], parts[0], parts[1]);
  if (t.logged && /^Q\d{6}$/.test(t.queryId)) withId++;
});
ok(withId === Object.keys(bundle.log).length,
   "every logged query-city pair carries a real query_id a reviewer can grep",
   withId + " of " + Object.keys(bundle.log).length);

/* short input must never be "corrected" — a one-letter query has no nearest word */
["a", "ab", "xyz", "12", "-"].forEach(function (s) {
  var p = E.proposed(s, "GB", "London");
  ok(p.lines.every(function (l) { return l.code !== "CORRECTED"; }),
     "short input " + JSON.stringify(s) + " is not guessed at",
     p.primary && p.primary.text);
});

/* the language fallback: terms nobody types alone still carry a language */
var mz = E.understand("masaż", "GB");
ok(mz.crossLanguage && mz.queryLanguage === "Polish", "“masaż” in the UK reads as Polish",
   "got " + (mz.queryLanguage || "no language"));
// The mirror case must NOT fire: "massage" is a substring of Nackenmassage,
// Sportmassage and Paarmassage, and German deals are titled Wellness-Massage Paket,
// so the word is native to Germany and calling it foreign would be wrong.
var dm = E.understand("massage", "DE");
ok(!dm.crossLanguage, "“massage” in Germany is not flagged foreign",
   "flagged as " + dm.queryLanguage);

/* --- summary ------------------------------------------------------------- */
console.log("\n" + (fails === 0 ? "PASS" : "FAIL") + " — " + (checks - fails) + "/" + checks + " checks");
process.exit(fails === 0 ? 0 : 1);
