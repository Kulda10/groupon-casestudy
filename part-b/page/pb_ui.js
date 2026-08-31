/* Honest Search — the interface. One IIFE, one global (window.PB), every class pb-.
   All retrieval lives in PBEngine; this file only renders what the engine returns. */
(function () {
  "use strict";

  var E = window.PBEngine;
  var DATA = JSON.parse(document.getElementById("pbdata").textContent);
  E.init(DATA);

  var $ = function (id) { return document.getElementById(id); };
  var state = { market: "GB", city: "Manchester", query: "back massage", run: 0, expand: false };

  /* ---------- eleven kinds of query, under the three problems from Part A ----------
     One vocabulary across both parts: the group names are Part A's three problems, and every
     chip label is a finding's canonical name, spelled exactly as the fifteen-row table spells
     it. The four without a number are not findings — they are answers the prototype has to
     have. */
  var PROBLEMS = [
    { key: "invented", n: "Problem 1", name: "The count is invented" },
    { key: "words",    n: "Problem 2", name: "The words don't match" },
    { key: "nothing",  n: "Problem 3", name: "There is nothing to sell" }
  ];

  var ARCHETYPES = [
    { n: "02", label: "Blind to stock",      q: "gym",                 m: "GB", c: "Manchester", f: "F2",  p: "invented" },
    { n: "03", label: "Unstable results",    q: "back massage",        m: "GB", c: "London",     f: "F3",  p: "invented" },
    { n: "08", label: "Overload",            q: "brunch",              m: "GB", c: "London",     f: "F8",  p: "invented" },
    { n: "04", label: "Wrong language",      q: "deep tissue massage", m: "DE", c: "Berlin",     f: "F4",  p: "words" },
    { n: "05", label: "Vocabulary gap",      q: "sushi",               m: "ES", c: "Madrid",     f: "F5",  p: "words" },
    { n: "10", label: "Misspellings",        q: "susshi",              m: "GB", c: "London",     f: "F10", p: "words" },
    { n: "",   label: "Not understood",     q: "asdfgh",              m: "GB", c: "London",     st: "not-understood",   p: "words" },
    { n: "06", label: "Nothing to sell",     q: "helicopter tour",     m: "GB", c: "London",     f: "F6",  p: "nothing" },
    { n: "",   label: "Not stocked at all",  q: "paintball",           m: "GB", c: "London",     st: "not-stocked-here", p: "nothing" },
    { n: "",   label: "Not in this city",    q: "manicure",            m: "FR", c: "Marseille",  st: "not-in-city",      p: "nothing" },
    { n: "",   label: "Thin stock",          q: "manicure",            m: "PL", c: "Kraków",     st: "thin",             p: "nothing" }
  ];

  /* ---------- finding → behaviour, the table from FINDINGS_TO_BEHAVIOUR.md ----------
     The "real example" column is not in here: it is generated live from whatever query is
     on screen, so the row always describes the thing the reviewer is looking at. */
  var BEHAVIOUR = {
    F1: { pillar: "refusal", today:
      "Conversion falls off a cliff rather than sloping. 0 results convert at 0%, 1–2 at 1.7%, 4–25 at 17.8%, 26–40 at 2.3%. The 2,087 searches in the 1–2 band are watched by nobody, because they are not zero.",
      does: "Never pads a thin set to look fuller. It says how thin the city actually is, and where the real ones are instead.",
      fix: "TARGET", note: "The scoreboard, not a bug — it is what makes the rest measurable" },
    F2: { pillar: "retrieval", today:
      "The number of results has no relationship to matching inventory: r = +0.02, and it holds under three independent definitions of a match. The catalogue could double overnight and the counts would not move.",
      does: "The count is the number of deals in that city whose concept matches the query. There is no other source for the number.",
      fix: "FULLY" },
    F3: { pillar: "retrieval", today:
      "The same query in the same city answers differently every time. Of 411 query-city pairs searched eight times or more, not one of the 337 that ever return anything is stable; 80% hit both 0 and 20+ in the same month.",
      does: "Deterministic order — rating, then price, then deal id. Same query, same city, identical answer, always. Press “Run it again” on the left to watch today’s version disagree with itself.",
      fix: "FULLY" },
    F4: { pillar: "intent", today:
      "Queries are matched against deal titles, and titles are written in the local language. 347 foreign-language searches produced 29 clicks and 2 purchases — 0.58%, against 10.58% for local-language queries. Foreign was worse in 54 of 55 market-and-intent cells.",
      does: "The typed string resolves to a concept, and a concept has no language, so local-language deals come back whatever was typed. The response line names the translation it made.",
      fix: "FULLY", note: "The cheapest high-value fix in the set" },
    F5: { pillar: "intent", today:
      "The catalogue names deals in generic package language while customers search in specific product language. 75 distinct titles cover all 568 deals, and they name almost none of the things people actually type.",
      does: "Title-level match where the catalogue names the concept; otherwise the category, labelled as the category. A dining package is never dressed up as a sushi result.",
      fix: "PARTLY", note: "Search can be honest about it; only merchandising can retitle the deals" },
    F6: { pillar: "refusal", today:
      "Six concepts — helicopter, hot-air balloon, skydiving, rafting, supercar track day, shark diving — return zero results every single time. 1,512 searches, 0 clicks, 0 purchases, and 57% of every zero-result search on the platform. The most expensive deal anywhere in the catalogue is $179.46.",
      does: "Says so as a finished state rather than an error, offers one adjacent thing that genuinely exists, names the price ceiling, and captures the demand as a supply signal.",
      fix: "NO", note: "No retrieval change creates a helicopter operator — merchandising and supply" },
    F7: { pillar: "retrieval", today:
      "585 searches (6.5%) returned more results than their city holds deals in total. Nothing downstream could have caught this, because nothing downstream compares the two numbers.",
      does: "A hard cap asserted in code, and tested against all 1,308 logged query-city pairs: the answer can never exceed the city’s deal count.",
      fix: "FULLY" },
    F8: { pillar: "intent", today:
      "26–40 results converts at 2.3% — worse than showing four. 471 searches landed there. Too many results is its own failure mode, not just too few.",
      does: "Returns the genuine matches and stops, grouping the tail behind one line. It never pads a result set to look fuller.",
      fix: "FULLY" },
    F10: { pillar: "intent", today:
      "Misspelled queries return the same number of results as clean ones (p = 0.16) — just not the right ones. In the healthy band a typo drops conversion from 18.2% to 11.5%. 581 searches are misspelled.",
      does: "Edit-distance match against every known concept term, closest wins, with a budget that scales with the query so short strings are not guessed at. The correction is stated, never applied silently.",
      fix: "FULLY" },
    F11: { pillar: "refusal", today:
      "75 distinct titles across 568 deals — a 7.6× repetition ratio. London lists 69 deals under 15 titles, so a result page repeats one name a dozen times.",
      does: "Names the repetition instead of hiding it, and differentiates the cards on the axes that genuinely do differ — price, rating, instant booking.",
      fix: "NO", note: "Merchandising and content, not search" }
  };

  /* ---------- one glyph per catalogue category; there are no images in the data ---------- */
  var GLYPH = {
    massage:   '<path d="M4 14c3-4 5-6 8-6s5 2 8 6"/><path d="M4 19c3-4 5-6 8-6s5 2 8 6"/>',
    beauty:    '<path d="M12 3l2.4 5.2L20 9.4l-4 4 1 5.6-5-2.8-5 2.8 1-5.6-4-4 5.6-1.2z"/>',
    fitness:   '<path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/>',
    dining:    '<path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10"/><path d="M17 3c-1.5 1.5-2 3-2 5s.7 3 2 3v10"/>',
    activities:'<path d="M3 20h18"/><path d="M6 20V9l6-5 6 5v11"/><path d="M10 20v-5h4v5"/>'
  };
  function glyph(cat, cls) {
    return '<div class="' + (cls || "pb-glyph") + '"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      (GLYPH[cat] || GLYPH.activities) + "</svg></div>";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return "$" + n.toFixed(2); }
  function marketOf(city) {
    for (var i = 0; i < DATA.cities.length; i++) if (DATA.cities[i][1] === city) return DATA.cities[i][0];
    return "GB";
  }
  function marketName(m) { return E.data().marketIndex[m].name; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  /* ---------- header, city picker, chips ---------- */
  function paintHeader() {
    if (!state.city) {
      $("pb-url").textContent = "all five markets / search";
      $("pb-locname").textContent = "All markets · " + DATA.cities.length + " cities";
      return;
    }
    var mi = E.data().marketIndex[state.market];
    $("pb-url").textContent = mi.domain + " / search";
    $("pb-locname").textContent = state.city + ", " + mi.name.replace(/^the /, "");
  }

  function buildCities() {
    var groups = {}, order = [];
    DATA.cities.forEach(function (c) {
      if (!groups[c[0]]) { groups[c[0]] = []; order.push(c[0]); }
      groups[c[0]].push(c);
    });
    $("pb-allrow").innerHTML =
      '<button type="button" class="pb-city pb-all" data-city="">' +
      "<span><b>All markets</b> — every city at once</span><b>" + DATA.stats.deals +
      " deals · " + DATA.cities.length + " cities</b></button>";
    $("pb-allrow").addEventListener("click", function () {
      state.city = null; state.market = null;
      $("pb-cities").hidden = true;
      $("pb-loc").setAttribute("aria-expanded", "false");
      render();
    });
    $("pb-mkts").innerHTML = order.map(function (m) {
      return '<div class="pb-mkt"><p>' + esc(marketName(m).replace(/^the /, "")) + "</p>" +
        groups[m].map(function (c) {
          return '<button type="button" class="pb-city" data-city="' + esc(c[1]) + '">' +
            "<span>" + esc(c[1]) + "</span><b>" + c[2] + " deals</b></button>";
        }).join("") + "</div>";
    }).join("");
    $("pb-mkts").addEventListener("click", function (e) {
      var b = e.target.closest(".pb-city");
      if (!b) return;
      state.city = b.getAttribute("data-city");
      state.market = marketOf(state.city);
      $("pb-cities").hidden = true;
      $("pb-loc").setAttribute("aria-expanded", "false");
      render();
    });
  }
  function markCity() {
    Array.prototype.forEach.call($("pb-mkts").querySelectorAll(".pb-city"), function (b) {
      b.classList.toggle("pb-on", b.getAttribute("data-city") === state.city);
    });
    var all = $("pb-allrow").querySelector(".pb-city");
    if (all) all.classList.toggle("pb-on", !state.city);
  }

  function buildChips() {
    $("pb-chips").innerHTML = PROBLEMS.map(function (pr) {
      var mine = ARCHETYPES.filter(function (a) { return a.p === pr.key; });
      return '<div class="pb-group"><p class="pb-gname"><span class="pb-gn">' + esc(pr.n) +
        "</span>" + esc(pr.name) + "</p>" +
        '<div class="pb-grow">' + mine.map(function (a) {
          return '<button type="button" role="tab" class="pb-chip' + (a.st ? " pb-state" : "") +
            '" data-i="' + ARCHETYPES.indexOf(a) + '">' +
            (a.n ? "<i>" + a.n + "</i> " : "") + esc(a.label) + "</button>";
        }).join("") + "</div></div>";
    }).join("");
    $("pb-chips").addEventListener("click", function (e) {
      var b = e.target.closest(".pb-chip");
      if (b) go(ARCHETYPES[+b.getAttribute("data-i")]);
    });
    $("pb-chips").addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var chips = Array.prototype.slice.call($("pb-chips").querySelectorAll(".pb-chip"));
      var i = chips.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      chips[(i + (e.key === "ArrowRight" ? 1 : chips.length - 1)) % chips.length].focus();
    });
  }
  function activeArchetype() {
    var hit = null;
    ARCHETYPES.forEach(function (a) {
      if (a.q === state.query && a.c === state.city) hit = a;
    });
    return hit;
  }
  // Anything typed is still one of these kinds, so say which — a muted chip for the kind,
  // the solid one only for the exact example the reviewer clicked.
  function markChips(r) {
    var on = activeArchetype(), lead = r.findings[0];
    Array.prototype.forEach.call($("pb-chips").querySelectorAll(".pb-chip"), function (b) {
      var a = ARCHETYPES[+b.getAttribute("data-i")];
      var exact = a === on;
      var near = !exact && (a.st ? a.st === r.proposed.state : a.f === lead.id);
      b.classList.toggle("pb-on", exact);
      b.classList.toggle("pb-near", near);
      b.setAttribute("aria-selected", exact ? "true" : "false");
    });
  }

  function go(a) {
    state.query = a.q; state.city = a.c; state.market = a.m; state.run = 0; state.expand = false;
    $("pb-q").value = a.q;
    render();
  }

  /* ---------- the response line ---------- */
  function paintResponse(p) {
    var resp = $("pb-resp");
    resp.className = "pb-resp" + (p.state === "matched" ? " pb-good" : "");
    resp.innerHTML = p.primary
      ? '<span class="pb-tag">' + esc(p.primary.code) + "</span><p>" + esc(p.primary.text) + "</p>"
      : "";
    $("pb-lines").innerHTML = p.secondary.map(function (l) {
      return '<div class="pb-line2"><span class="pb-tag2">' + esc(l.code) + "</span><span>" +
        esc(l.text) + "</span></div>";
    }).join("");
  }

  /* ---------- Today ---------- */
  function paintToday(t) {
    var h = [], i;
    if (t.logged && t.all) {
      h.push('<p class="pb-todaytxt">This query ran <b>' + plural(t.runs, "time", "times") +
        "</b> across <b>" + plural(t.cities, "city", "cities") + "</b> last month, returning " +
        (t.stable ? t.min + " every time" : "anywhere between <b>" + t.min + " and " + t.max +
         "</b> results") + ". One of those runs:</p>");
    } else if (t.logged) {
      h.push('<p class="pb-todaytxt">This exact query ran <b>' + plural(t.runs, "time", "times") +
        "</b> in " + esc(state.city) + " last month. " +
        (t.stable ? "Every single run returned the same thing:"
                  : "It returned anywhere between <b>" + t.min + " and " + t.max + "</b> results. This run:") + "</p>");
    } else {
      h.push('<p class="pb-todaytxt">This query is <b>not in the June log</b> for ' + esc(state.city || "any city") +
        ". Reconstructed from the four bands the current system draws from — 0, 1–2, 4–25, 26–40, and never 3. This run:</p>");
    }
    h.push('<div class="pb-bignum"><span class="pb-n">' + t.count + '</span><span class="pb-u">results shown</span></div>');

    if (t.logged) {
      var lo = t.min, hi = t.max, pos = hi > lo ? ((t.count - lo) / (hi - lo)) * 100 : 0;
      var sorted = t.values.slice().sort(function (a, b) { return a - b; });
      var ticks = t.stable ? null : [0, .25, .5, .75, 1].map(function (f) {
        return sorted[Math.min(sorted.length - 1, Math.round(f * (sorted.length - 1)))];
      });
      h.push('<div class="pb-range"><p class="pb-l">What the log recorded · ' + plural(t.runs, "run", "runs") + "</p>" +
        '<div class="pb-bar' + (t.stable ? " pb-flat" : "") + '"><span style="left:' + pos.toFixed(1) + '%"></span></div>' +
        (ticks ? '<div class="pb-ticks">' + ticks.map(function (v) { return "<span>" + v + "</span>"; }).join("") + "</div>"
               : '<div class="pb-ticks"><span>min ' + lo + "</span><span>max " + hi + "</span><span>never anything else</span></div>") +
        "</div>");
    }
    h.push('<button type="button" class="pb-rerun" id="pb-rerun">↻ Run it again</button>');

    if (t.count === 0) {
      h.push('<div class="pb-emptyres">No results for “' + esc(state.query.trim() || " ") + "”</div>");
    } else {
      var rows = Math.min(t.count, 5), w = [72, 54, 66, 47, 61];
      h.push('<div class="pb-ghosts">');
      for (i = 0; i < rows; i++) {
        h.push('<div class="pb-ghost"><div class="pb-gsq"></div><div style="flex:1">' +
          '<div class="pb-gl" style="width:' + w[i % w.length] + '%;margin-bottom:6px"></div>' +
          '<div class="pb-gl" style="width:' + (w[(i + 2) % w.length] - 22) + '%;height:6px"></div></div></div>');
      }
      h.push("</div>");
      h.push('<p class="pb-ghostnote">' + plural(t.count, "result", "results") +
        " appeared. <b>Which</b> deals they were is not recorded — the log has no <code>deal_id</code>, so this pane can never show them.</p>");
    }
    if (t.logged) {
      h.push('<p class="pb-zeroline"><b>' + esc(t.queryId) + "</b> · " + t.runs + " searches → " +
        t.clicks + " clicks → " + t.purchases + " purchases</p>");
      h.push('<p class="pb-grep">Grep that id in <code>search_log.csv</code> and the row is there.</p>');
    }
    $("pb-today").innerHTML = h.join("");
    $("pb-rerun").addEventListener("click", function () {
      state.run++;
      paintToday(E.today(state.query, state.market, state.city, state.run));
    });
  }

  /* ---------- Proposed ---------- */
  // Every card names its own city. In the all-markets scope the results come from twenty
  // different catalogues, and a card that does not say where it is cannot be checked.
  function dealCard(d, cls) {
    var away = state.city && d.city !== state.city;
    // Titles outside the UK are written in the local language. Hovering one says what it is
    // in English — the glosses cover all 75 catalogue titles, built with the data bundle.
    var en = DATA.titleEn[d.title];
    var foreign = d.market !== "GB" && en;
    // Print the gloss inline only when it says something the category line does not already
    // say: "Tasting menu" is worth the space next to Dining, "Massage & spa" next to Massage
    // is not. The tooltip is there either way.
    var inline = foreign && en.toLowerCase() !== d.title.toLowerCase();
    return '<div class="' + (cls || "pb-deal") + '">' + glyph(d.cat2) +
      '<div class="pb-dtxt"><p class="pb-dtitle' + (foreign ? " pb-foreign" : "") + '"' +
      (foreign ? ' title="' + esc(d.title) + " — " + esc(DATA.lang[d.market]) + " for “" +
        esc(en) + '”"' : "") + ">" +
      esc(d.title) + (inline ? '<span class="pb-en"> · ' + esc(en) + "</span>" : "") +
      '</p><div class="pb-dmeta">' +
      '<span class="pb-star">★ ' + d.rating.toFixed(1) + "</span><span>" + d.nRatings + " ratings</span>" +
      '<span class="pb-dcity' + (away ? " pb-away" : "") + '">' + esc(d.city) + "</span>" +
      "<span>" + esc(DATA.catLabel[d.cat2] || d.cat2) + "</span>" +
      '</div></div><div class="pb-price">' + money(d.price) + "</div></div>";
  }

  // The useful half of a "similar deals" rail, without the word similar.
  function popularBlock(p) {
    if (!p.popular || !p.popular.length) return "";
    var where = state.city ? esc(state.city) : "the catalogue";
    return '<div class="pb-blk"><p class="pb-h">What ' + where + " does sell</p>" +
      p.popular.map(function (d) { return dealCard(d); }).join("") +
      '<p class="pb-dnote">The best-rated deal in each of the three biggest categories. ' +
      "<b>Not “similar deals”</b> — nothing here can tell whether they resemble what you asked " +
      "for, so the screen does not claim it. Today’s search fills this space with an unlabelled " +
      "grid and lets you assume.</p></div>";
  }

  function tilesBlock(p) {
    if (!p.tiles.length) return "";
    var scope = state.city ? esc(state.city) : "the catalogue";
    return '<div class="pb-blk"><p class="pb-h">What ' + scope + " does have — " +
      plural(state.city ? p.cityTotal : DATA.stats.deals, "deal", "deals") + "</p>" +
      '<div class="pb-tiles">' + p.tiles.map(function (t) {
        return '<button type="button" class="pb-tile" data-cat="' + esc(t.cat) + '">' +
          esc(t.label) + " <b>" + t.count + "</b></button>";
      }).join("") + "</div>" +
      '<p class="pb-dnote">Real counts from the ' + scope +
      ". Each one runs that search — a dead end becomes a way back in.</p></div>";
  }

  function notifyBlock(p) {
    if (!p.notify) return "";
    var where = state.city ? " in " + esc(state.city) : " anywhere";
    var raw = p.notify.raw;
    return '<div class="pb-notify"><p><b>Want ' +
      (raw ? "“" + esc(p.notify.concept) + "”" : esc(p.notify.concept.toLowerCase())) + where +
      "?</b> Tell us, and we’ll go looking for an operator.</p>" +
      '<button type="button" class="pb-nbtn" id="pb-notify">Notify me when it launches</button>' +
      '<p class="pb-fine">We’ll email you if one joins. Nothing else happens today — we’d rather say ' +
      "that than show you a boat trip." +
      (raw ? " <b>And an unrecognised search is captured as the raw string, exactly as typed.</b> " +
             "Someone has to read the queue before any of it means anything: “asdfgh” lands in it " +
             "next to “basketball”. Naming that is the point — it is a supply lead, not a metric."
           : "") + "</p></div>";
  }

  function paintAll(p) {
    var h = [], rows = p.perCity || [];
    h.push('<p class="pb-changed"><b>Catalogue-wide check</b> Not what a customer sees — this is ' +
      "every one of the " + DATA.stats.deals + " deals in all " + DATA.cities.length +
      " cities at once, so a claim like “nobody stocks this” can be checked in one step.</p>");
    if (p.state === "not-understood") {
      h.push('<p class="pb-rhead">Nothing in the whole catalogue is like “' +
        esc(state.query.trim()) + '”.</p>');
      h.push('<p class="pb-rsub">Checked all ' + DATA.stats.deals + " deals in all " +
        DATA.cities.length + " cities. Five categories deep, and this is not one of them.</p>");
    } else if (p.state === "not-sold-anywhere" || p.state === "not-stocked-here") {
      h.push('<p class="pb-rhead">Not stocked anywhere.</p>');
      h.push('<p class="pb-rsub">Zero across all ' + DATA.cities.length + " cities and all five " +
        "markets. This is the supply gap, seen whole.</p>");
    }
    if (p.alternative) {
      h.push('<div class="pb-blk"><p class="pb-h">Closest thing the catalogue has at all</p>' +
        dealCard(p.alternative.deal, "pb-alt") +
        '<p class="pb-dnote">' + esc(p.alternative.label) + " — " + p.alternative.count +
        " of them" + (p.altCities ? " across " + p.altCities + " cities" : "") +
        ". A different experience, not a replacement. <b>Which substitute anyone would accept is " +
        "not in the data</b>; this mapping is a judgement.</p></div>");
    }
    if (rows.length && (p.category || p.altConcept)) {
      var top = rows.slice().sort(function (a, b) { return b.exact - a.exact || b.adjacent - a.adjacent; });
      var head = p.exact.length
        ? "Where it exists — " + p.exact.length + " deals in " + p.withExact + " of " + rows.length + " cities"
        : p.altConcept
          ? "Where the closest thing exists — " + esc(p.altConcept.label.toLowerCase())
          : "Nowhere — " + rows.length + " cities, not one match";
      h.push('<div class="pb-blk"><p class="pb-h">' + head + "</p>" +
        '<div class="pb-citygrid">' + top.map(function (r) {
          return '<button type="button" class="pb-citycell' + (r.exact ? "" : " pb-zero") +
            '" data-city="' + esc(r.city) + '"><span>' + esc(r.city) + "</span><b>" +
            (r.exact ? r.exact : "0") + "</b></button>";
        }).join("") + "</div>" +
        '<p class="pb-dnote">Click a city to drop back into that one catalogue.</p></div>');
    }
    if (!p.exact.length) { h.push(popularBlock(p)); h.push(tilesBlock(p)); h.push(notifyBlock(p)); }
    if (p.exact.length) {
      h.push('<div class="pb-blk"><p class="pb-h">Highest rated of them</p>' +
        p.exact.slice(0, 4).map(function (d) {
          return dealCard(d).replace('</div><div class="pb-price">',
            '</div><div class="pb-price">'); }).join("") + "</div>");
    }
    $("pb-prop").innerHTML = h.join("");
    wireProposed(p);
    Array.prototype.forEach.call($("pb-prop").querySelectorAll(".pb-citycell"), function (b) {
      b.addEventListener("click", function () {
        state.city = b.getAttribute("data-city");
        state.market = marketOf(state.city);
        state.expand = false;
        render();
      });
    });
  }

  function paintProposed(p, changed) {
    var h = [], SHOW = 4;
    if (p.all) return paintAll(p);
    if (changed) h.push('<p class="pb-changed"><b>What changed</b> ' + esc(changed) + "</p>");

    if (p.state === "not-understood") {
      h.push('<p class="pb-rhead">' + (p.step.empty ? "Nothing typed yet."
        : "We don’t sell anything like “" + esc(state.query.trim()) + "”.") + "</p>");
      h.push('<p class="pb-rsub">This catalogue is five categories deep — massage and spa, beauty, ' +
        "fitness, dining, things to do. That may be the whole answer, or it may be a gap nobody has " +
        "noticed. <b>Search on its own cannot tell the difference</b>, so it says both, offers the " +
        "way back in, and passes the query on.</p>");
      h.push(popularBlock(p));
      h.push(tilesBlock(p));
      h.push(notifyBlock(p));
      $("pb-prop").innerHTML = h.join("");
      wireProposed(p);
      return;
    }

    if (p.state === "not-stocked-here") {
      h.push('<p class="pb-rhead">We don’t sell ' + esc(p.step.intent.label.toLowerCase()) +
        " in " + esc(state.city) + ".</p>");
      h.push('<p class="pb-rsub">Not a guess: every one of ' + esc(state.city) + "’s " +
        plural(p.adjacent.length, esc(p.adjacentLabel.toLowerCase()) + " deal",
               esc(p.adjacentLabel.toLowerCase()) + " deals") +
        " is a named, different thing. Here is the closest of them.</p>");
      if (p.alternative) {
        h.push('<div class="pb-blk"><p class="pb-h">Closest thing we actually have</p>' +
          dealCard(p.alternative.deal, "pb-alt") +
          '<p class="pb-dnote">' + esc(p.alternative.label) + " — " + esc(state.city) + " has " +
          p.alternative.count + " of them. A different experience, not a replacement, and which " +
          "substitute a customer would accept is not in the data.</p></div>");
      }
      h.push(tilesBlock(p));
      h.push(notifyBlock(p));
      $("pb-prop").innerHTML = h.join("");
      wireProposed(p);
      return;
    }

    if (p.state === "not-sold-anywhere") {
      h.push('<p class="pb-rhead">We don’t have ' + esc(p.step.intent.phrase) + "s in " + esc(state.city) + ".</p>");
      h.push('<p class="pb-rsub">No operator lists one with us yet — not in the United Kingdom, Germany, ' +
        "France, Spain or Poland. Here is what we can do instead.</p>");
      if (p.alternative) {
        h.push('<div class="pb-blk"><p class="pb-h">Closest thing we actually have</p>' +
          dealCard(p.alternative.deal, "pb-alt") +
          '<p class="pb-dnote">A different experience, not a replacement — ' + esc(state.city) +
          " has " + p.alternative.count + " of these. One suggestion, not a grid of nine. " +
          "<b>Which substitute anyone would accept is not in the data</b>; this mapping is a " +
          "judgement, and the demand below is the part that is measured.</p></div>");
      }
      h.push(tilesBlock(p));
      h.push(notifyBlock(p));
      $("pb-prop").innerHTML = h.join("");
      wireProposed(p);
      return;
    }

    if (p.state === "not-in-city") {
      h.push('<p class="pb-rhead">No ' + esc(p.step.intent.phrase) + " in " + esc(state.city) + ".</p>");
      h.push('<p class="pb-rsub">The catalogue can name this — it just holds none of it here. ' +
        "Here is what " + esc(state.city) + " does have in the same category, and where the real ones are.</p>");
      // What is actually reachable comes first. The other city is a footnote, not an offer:
      // with no coordinates in the data, "elsewhere in France" can be 600 km away.
      if (p.adjacent.length) {
        h.push('<div class="pb-blk"><p class="pb-h">In ' + esc(state.city) + " — " +
          plural(p.adjacent.length, esc(p.adjacentLabel.toLowerCase()) + " deal",
                 esc(p.adjacentLabel.toLowerCase()) + " deals") + ", closest first</p>" +
          p.adjacent.slice(0, 3).map(function (d) { return dealCard(d); }).join("") +
          '<p class="pb-dnote">Same category, a different thing. None of these is ' +
          esc(p.step.intent.phrase) + ", and the screen says so rather than letting you assume.</p></div>");
      }
      if (p.nearest && p.nearest.deal) {
        h.push('<div class="pb-blk pb-quiet"><p class="pb-h">' + esc(marketName(p.market).replace(/^the /, "")) +
          " does hold " + plural(p.nearest.total, "of them", "of them") + " — " +
          Object.keys(p.nearest.cities).sort(function (a, b) { return p.nearest.cities[b] - p.nearest.cities[a]; })
            .map(function (c) { return esc(c) + " " + p.nearest.cities[c]; }).join(", ") + "</p>" +
          dealCard(p.nearest.deal, "pb-alt") +
          '<p class="pb-dnote"><b>Not “nearby”.</b> The data carries no coordinates, so this is the same ' +
          "market, not a distance — " + esc(p.nearest.city) + " may be six hundred kilometres away. " +
          "Worth knowing, not worth leading with.</p></div>");
      }
      h.push(tilesBlock(p));
      h.push(notifyBlock(p));
      $("pb-prop").innerHTML = h.join("");
      wireProposed(p);
      return;
    }

    /* results */
    var head = p.exact.length
      ? "<b>" + plural(p.exact.length, "deal", "deals") + "</b> in " + esc(state.city) +
        " · matched on intent, not on words"
      : "<b>" + plural(p.adjacent.length, esc(p.adjacentLabel.toLowerCase()) + " deal",
                       esc(p.adjacentLabel.toLowerCase()) + " deals") + "</b> in " + esc(state.city) +
        " · shown as " + esc(p.adjacentLabel.toLowerCase()) + ", not as “" + esc(p.step.matchedTerm) + "”";
    h.push('<p class="pb-count">' + head + "</p>");

    var shownExact = state.expand ? p.exact : p.exact.slice(0, SHOW);
    h.push(shownExact.map(function (d) { return dealCard(d); }).join(""));

    var leftExact = p.exact.length - shownExact.length;
    if (leftExact > 0) {
      var titles = {}, biggest = 0;
      p.exact.forEach(function (d) { titles[d.title] = (titles[d.title] || 0) + 1;
                                     biggest = Math.max(biggest, titles[d.title]); });
      h.push('<p class="pb-more"><button type="button" class="pb-morebtn" data-x="1">+ ' + leftExact + " more</button>" +
        (biggest > 1 ? " · " + biggest + " of the " + p.exact.length + " carry the same title — the catalogue has " +
          DATA.stats.distinctTitles + " titles for " + DATA.stats.deals + " deals (finding F11)" : "") + "</p>");
    }

    if (p.adjacent.length && p.exact.length) {
      h.push('<p class="pb-divider">Also in ' + esc(p.adjacentLabel) + " — not " + esc(p.step.matchedTerm) + "</p>");
      if (state.expand) h.push(p.adjacent.map(function (d) { return dealCard(d); }).join(""));
      else h.push('<p class="pb-more"><button type="button" class="pb-morebtn" data-x="1">Show ' +
        plural(p.adjacent.length, "more " + esc(p.adjacentLabel.toLowerCase()) + " deal",
               "more " + esc(p.adjacentLabel.toLowerCase()) + " deals") +
        "</button> · related, but nothing here is named “" + esc(p.step.matchedTerm) + "”</p>");
    } else if (p.adjacent.length && !p.exact.length) {
      var shown2 = state.expand ? p.adjacent : p.adjacent.slice(0, SHOW);
      h.push(shown2.map(function (d) { return dealCard(d); }).join(""));
      var left2 = p.adjacent.length - shown2.length;
      if (left2 > 0) h.push('<p class="pb-more"><button type="button" class="pb-morebtn" data-x="1">+ ' +
        left2 + " more</button> · every one of these is " + esc(p.adjacentLabel.toLowerCase()) +
        ", none of them names “" + esc(p.step.matchedTerm) + "”</p>");
      if (p.affinityOrdered) {
        h.push('<p class="pb-more" style="border-top:0;padding-top:4px">Ordered by how close each thing is to ' +
          esc(p.step.matchedTerm) + " — " + esc(nearestConceptName(p)) +
          " first. <b>That ordering is a judgement, not a measurement</b>; the data cannot say which substitute a customer would accept.</p>");
      }
    }

    if (state.expand) {
      h.push('<p class="pb-more"><button type="button" class="pb-morebtn" data-x="0">Show fewer</button> · ' +
        p.count + " of " + p.cityTotal + " deals in " + esc(state.city) +
        " — the count can never exceed what the city holds</p>");
    }
    $("pb-prop").innerHTML = h.join("");
    wireProposed(p);
  }

  function nearestConceptName(p) {
    var first = p.adjacent[0];
    if (!first) return "";
    var k = E.data().conceptOf[first.id];
    var it = E.data().byIntent[k];
    return it ? it.label.toLowerCase() : first.title;
  }

  function wireProposed(p) {
    var n = $("pb-notify");
    if (n) n.addEventListener("click", function () {
      n.disabled = true;
      // Show both numbers: nobody in the UK searched for rafting last month, but 282 people
      // did elsewhere. One figure alone reads like a bug.
      n.textContent = p.notify.raw
        ? "Noted — “" + p.notify.concept + "” goes to the supply queue as typed"
        : state.city
          ? "Noted — " + (p.notify.demandMarket || 0) + " searched this in " +
            E.data().marketIndex[state.market].name.replace(/^the /, "") + " last month, " +
            (p.notify.demandTotal || 0) + " across the five markets"
          : "Noted — " + (p.notify.demandTotal || 0) + " people searched this across the five markets last month";
    });
    Array.prototype.forEach.call($("pb-prop").querySelectorAll(".pb-morebtn"), function (b) {
      b.addEventListener("click", function () { state.expand = b.getAttribute("data-x") === "1"; render(true); });
    });
    Array.prototype.forEach.call($("pb-prop").querySelectorAll(".pb-tile"), function (b) {
      b.addEventListener("click", function () {
        var cat = b.getAttribute("data-cat");
        var term = { massage: "massage", beauty: "facial", fitness: "gym", dining: "dinner", activities: "city tour" }[cat];
        state.query = term; state.run = 0; state.expand = false;
        $("pb-q").value = term;
        render();
      });
    });
  }

  /* ---------- finding → behaviour, for the query on screen ---------- */
  function liveExample(r) {
    var p = r.proposed, t = r.today, q = "“" + esc(state.query.trim() || " ") + "” in " + esc(state.city);
    var log = t.logged
      ? "The log has " + plural(t.runs, "search", "searches") + " for it, returning " +
        (t.stable ? t.min + " every time" : "between " + t.min + " and " + t.max) + " — " +
        t.clicks + " clicks, " + t.purchases + " purchases."
      : "It is not in the June log for this city.";
    var now;
    switch (p.state) {
      case "not-sold-anywhere":
        now = esc(state.city) + " holds none, and neither does any of the 568 deals in the five markets."; break;
      case "not-in-city":
        now = esc(state.city) + " holds none" + (p.nearest ? ", but " + esc(p.nearest.city) + " holds " +
          p.nearest.count + " and the market holds " + p.nearest.total : "") + "."; break;
      case "category-only":
        now = esc(state.city) + " holds " + plural(p.adjacent.length, esc(p.adjacentLabel.toLowerCase()) + " deal",
          esc(p.adjacentLabel.toLowerCase()) + " deals") + " and not one of them is named " +
          esc(p.step.matchedTerm) + "."; break;
      case "thin":
        now = esc(state.city) + " holds " + plural(p.cityTotal, "deal", "deals") + " in total; " +
          p.exact.length + " of them match."; break;
      case "not-understood":
        now = "Nothing in the catalogue resolves it, so there is nothing to count."; break;
      default:
        now = esc(state.city) + " holds " + plural(p.exact.length, "matching deal", "matching deals") +
          " out of " + p.cityTotal + "."; break;
    }
    return q + ". " + log + " " + now;
  }

  function paintBehaviour(r) {
    var a = activeArchetype();
    var f = r.findings[0];
    var b = BEHAVIOUR[f.id] || BEHAVIOUR.F2;
    var others = r.findings.slice(1).filter(function (o) { return BEHAVIOUR[o.id]; });

    $("pb-behaviour").innerHTML =
      '<div class="pb-bhead">' +
        '<span class="pb-fno">Finding ' + esc(f.id) + " · " + esc(f.name) + "</span>" +
        '<span class="pb-fixwrap"><span class="pb-fix pb-fix-' + b.fix.toLowerCase() + '">' + esc(b.fix) + "</span>" +
        '<span class="pb-fixlbl">fixable by search</span></span>' +
      "</div><div>" +
      '<div class="pb-bgrid">' +
        '<div><p class="pb-bh">What happens today</p><p>' + esc(b.today) + "</p></div>" +
        '<div><p class="pb-bh">This query, in the data</p><p>' + liveExample(r) + "</p></div>" +
        '<div><p class="pb-bh">What the prototype does</p><p>' + esc(b.does) + "</p>" +
          (b.note ? '<p class="pb-bnote">' + esc(b.note) + "</p>" : "") +
          (p_unvalidated(r) ? '<p class="pb-bwarn">The blocks on the right are a product proposal, not a finding — with no session or deal id in the data, nothing here can say whether they convert.</p>' : "") +
        "</div>" +
      "</div>" +
      (function () {
        // The harness has no Part A around it, so that link would be dead there.
        var link = document.getElementById("findings")
          ? ' <a href="#findings">All fifteen findings, ranked ↑</a>' : "";
        if (!others.length && !link) return "";
        return '<p class="pb-balso">' + (others.length ? "Also on this query: " + others.map(function (o) {
          return "<b>" + esc(o.id) + "</b> " + esc(o.name.toLowerCase());
        }).join(" · ") + "." : "") + link + "</p>";
      })()
      + "</div>";
  }
  function p_unvalidated(r) { return !!r.proposed.unvalidated; }

  /* ---------- proof that every logged search is answered ---------- */
  var COVERAGE = null;
  function coverage() {
    if (COVERAGE) return COVERAGE;
    var D = E.data(), by = {}, total = 0;
    Object.keys(D.log).forEach(function (k) {
      var parts = k.split("|"), rec = D.log[k];
      var p = E.proposed(rec[6], parts[0], parts[1]);
      by[p.primary.code] = (by[p.primary.code] || 0) + rec[0];
      total += rec[0];
    });
    COVERAGE = { by: by, total: total, keys: Object.keys(D.log).length };
    return COVERAGE;
  }

  function paintCoverage() {
    var c = coverage();
    var codes = Object.keys(c.by).sort(function (a, b) { return c.by[b] - c.by[a]; });
    $("pb-coverage").innerHTML =
      '<div class="pb-covbar">' + codes.map(function (k) {
        return '<span class="pb-covseg pb-cov-' + k.toLowerCase().replace(/ /g, "-") + '" style="flex:' +
          c.by[k] + '" title="' + esc(k) + ": " + c.by[k].toLocaleString("en-GB") + '"></span>';
      }).join("") + "</div>" +
      '<p class="pb-covlede">All <b>' + c.total.toLocaleString("en-GB") + " searches</b> in " +
      "<code>search_log.csv</code> get one of these eight answers — " +
      codes.map(function (k) {
        return '<span class="pb-covk"><i class="pb-cov-' + k.toLowerCase().replace(/ /g, "-") + '"></i>' +
          esc(k.toLowerCase()) + " " + c.by[k].toLocaleString("en-GB") + "</span>";
      }).join(" ") +
      "</p>";
  }

  // Sits under the search field, not behind a disclosure: pulling a real row out of the log is
  // the fastest way for a reviewer to check that the thing answers the actual data.
  function wireTry() {
    $("pb-try").addEventListener("click", function () {
      var D = E.data(), keys = Object.keys(D.log);
      var k = keys[Math.floor(Math.random() * keys.length)], parts = k.split("|"), rec = D.log[k];
      state.market = parts[0]; state.city = parts[1]; state.query = rec[6];
      state.run = 0; state.expand = false;
      $("pb-q").value = rec[6];
      render();
      $("pb-trynote").innerHTML = "<b>" + esc(rec[5]) + "</b> · “" + esc(rec[6]) + "” in " +
        esc(parts[1]) + " · " + plural(rec[0], "search", "searches") + " that month. " +
        "Grep that id in <code>search_log.csv</code> and the row is there.";
    });
  }

  /* ---------- render ---------- */
  function render(keepRun) {
    if (!keepRun) state.run = 0;
    var r = state.city
      ? E.run(state.query, state.market, state.city, state.run)
      : (function () {
          var t = E.todayAll(state.query), p = E.proposedAll(state.query);
          return { today: t, proposed: p, findings: E.findingsFor(t, p), changed: null };
        })();
    var a = activeArchetype();
    if (a) {
      var i = -1;
      r.findings.forEach(function (f, j) { if (f.id === a.f) i = j; });
      if (i > 0) r.findings.unshift(r.findings.splice(i, 1)[0]);
      else if (i < 0 && E.FINDINGS[a.f]) r.findings.unshift(E.FINDINGS[a.f]);
    }
    paintHeader();
    markCity();
    markChips(r);
    paintResponse(r.proposed);
    paintToday(r.today);
    paintProposed(r.proposed, r.changed);
    paintBehaviour(r);
  }

  /* ---------- wiring ---------- */
  function boot() {
    var logo = document.querySelector("img.logo");
    if (logo) $("pb-logo").src = logo.src;

    buildCities();
    buildChips();
    paintCoverage();
    wireTry();
    $("pb-q").value = state.query;

    $("pb-form").addEventListener("submit", function (e) {
      e.preventDefault();
      state.query = $("pb-q").value;
      state.expand = false;
      render();
    });
    $("pb-clear").addEventListener("click", function () {
      $("pb-q").value = ""; state.query = ""; state.expand = false;
      $("pb-q").focus(); render();
    });
    $("pb-loc").addEventListener("click", function () {
      var open = $("pb-cities").hidden;
      $("pb-cities").hidden = !open;
      $("pb-loc").setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("pb-cities").hidden) {
        $("pb-cities").hidden = true;
        $("pb-loc").setAttribute("aria-expanded", "false");
      }
    });
    // Lives in Part B's hero, not inside the frame, so the harness will not have it.
    if ($("pb-help") && $("pb-howto")) {
      $("pb-help").addEventListener("click", function () {
        var box = $("pb-howto"), open = box.hidden;
        box.hidden = !open;
        $("pb-help").setAttribute("aria-expanded", open ? "true" : "false");
        $("pb-help").innerHTML = open
          ? 'Hide <span aria-hidden="true">⌃</span>'
          : 'How the prototype works <span aria-hidden="true">⌄</span>';
      });
    }
    $("pb-moretoggle").addEventListener("click", function () {
      var box = $("pb-more"), open = box.hidden;
      box.hidden = !open;
      $("pb-moretoggle").setAttribute("aria-expanded", open ? "true" : "false");
      $("pb-moretoggle").innerHTML = open
        ? 'Hide the explanation <span aria-hidden="true">⌃</span>'
        : 'Show more information <span aria-hidden="true">⌄</span>';
    });
    $("pb-mobtoggle").addEventListener("click", function () {
      var pane = $("pb-pane-today"), open = pane.classList.toggle("pb-open");
      $("pb-mobtoggle").textContent = open ? "Hide what happens today" : "Show what happens today";
    });

    render();
  }

  window.PB = { render: render, state: state, engine: E, archetypes: ARCHETYPES,
                problems: PROBLEMS, behaviour: BEHAVIOUR, coverage: coverage,
                go: function (i) { go(ARCHETYPES[i]); },
                set: function (q, m, c) { state.query = q; state.market = m; state.city = c;
                                          state.run = 0; state.expand = false;
                                          document.getElementById("pb-q").value = q; render(); } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
