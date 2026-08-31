"""Splice the Honest Search prototype into ../index.html, in place.

index.html is the source of truth for the page — the build/*.part fragments are a
stale snapshot and rebuilding from them silently reverts a day of work (see CLAUDE.md).
So this script edits the live file between sentinels and is safe to re-run: every insert
is bounded by a marker pair, and the structural counts are asserted before and after.

    python3 part-b/build_page.py
"""
import os, re, shutil, datetime, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, "..", "index.html")
P = os.path.join(HERE, "page")

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

html = read(PAGE)
before = {
    "style": html.count("<style>"),
    "style_close": html.count("</style>"),
    "script_open": len(re.findall(r"<script\b", html)),
    "script_close": html.count("</script>"),
    "div_open": len(re.findall(r"<div\b", html)),
    "div_close": html.count("</div>"),
    "section_open": len(re.findall(r"<section\b", html)),
    "section_close": html.count("</section>"),
}
if before["style"] != 2:
    sys.exit("expected exactly 2 <style> blocks, found %d — refusing to edit" % before["style"])

shutil.copy(PAGE, PAGE + ".bak")

# ---- 1. CSS: appended inside the SECOND <style> block, between sentinels ----------
css = read(os.path.join(P, "pb.css"))
block = "/* PB:CSS-START */\n" + css + "\n/* PB:CSS-END */\n"
if "/* PB:CSS-START */" in html:
    html = re.sub(r"/\* PB:CSS-START \*/.*?/\* PB:CSS-END \*/\n?", block, html, flags=re.S)
else:
    # the second </style> closes the second block
    i = html.index("</style>", html.index("</style>") + 1)
    html = html[:i] + block + html[i:]

# ---- 2. Part B body ---------------------------------------------------------------
markup = read(os.path.join(P, "pb_markup.html")).strip()
partb = read(os.path.join(P, "pb_partb.html")).strip().replace("<!-- PB:PROTOTYPE -->", markup)
partb = "<!-- PB:START -->\n" + partb + "\n<!-- PB:END -->"

if "<!-- PB:START -->" in html:
    html = re.sub(r"<!-- PB:START -->.*?<!-- PB:END -->", lambda m: partb, html, flags=re.S)
else:
    start = html.index('<div id="partb">') + len('<div id="partb">')
    end = html.index("<!-- ============ PART C ============ -->")
    tail = html[start:end]
    # keep everything the old Part B held after the placeholder cards, minus the
    # placeholder cards and the old hero, and park the deferred table below the tool.
    keep = tail[tail.index('<section style="padding-top:0"><div class="wrap">\n  <h3 class="narrow"'):]
    keep = keep[:keep.index('<section><div class="wrap"><div class="grid3">')]
    deferred = ("\n<!-- PB:DEFERRED-START -->\n"
                "<!-- The 'Seven kinds of query' table below is superseded by the prototype's own\n"
                "     ten archetypes and its volumes do not reconcile (they sum to 109.6% of the\n"
                "     8,997 searches). Kept, moved below the tool, pending Ondrej's call. -->\n"
                + keep.rstrip() + "\n<!-- PB:DEFERRED-END -->\n")
    html = html[:start] + "\n" + partb + "\n" + deferred + "</div>\n\n" + html[end:]

# ---- 3. data + engine + ui, immediately before </body> ----------------------------
data = read(os.path.join(HERE, "prototype_data.json"))
engine = read(os.path.join(HERE, "pb_engine.js"))
ui = read(os.path.join(P, "pb_ui.js"))
scripts = ('<!-- PB:JS-START -->\n'
           '<script id="pbdata" type="application/json">' + data + "</script>\n"
           "<script>" + engine + "</script>\n"
           "<script>" + ui + "</script>\n"
           "<!-- PB:JS-END -->\n")
if "<!-- PB:JS-START -->" in html:
    html = re.sub(r"<!-- PB:JS-START -->.*?<!-- PB:JS-END -->\n?", lambda m: scripts, html, flags=re.S)
else:
    html = html.replace("</body>", scripts + "</body>")

after = {
    "style": html.count("<style>"),
    "style_close": html.count("</style>"),
    "script_open": len(re.findall(r"<script\b", html)),
    "script_close": html.count("</script>"),
    "div_open": len(re.findall(r"<div\b", html)),
    "div_close": html.count("</div>"),
    "section_open": len(re.findall(r"<section\b", html)),
    "section_close": html.count("</section>"),
}
problems = []
if after["style"] != 2 or after["style_close"] != 2:
    problems.append("style blocks: %d open / %d close (must be 2/2)" % (after["style"], after["style_close"]))
if after["script_open"] != after["script_close"]:
    problems.append("script tags unbalanced: %d/%d" % (after["script_open"], after["script_close"]))
if after["div_open"] != after["div_close"]:
    problems.append("div tags unbalanced: %d open / %d close" % (after["div_open"], after["div_close"]))
if after["section_open"] != after["section_close"]:
    problems.append("section tags unbalanced: %d/%d" % (after["section_open"], after["section_close"]))
for k in ("parta", "partc", "log", "setup", "ftable", "ddpanel"):
    if 'id="%s"' % k not in html:
        problems.append("lost #%s" % k)
if problems:
    sys.exit("REFUSED — " + "; ".join(problems))

with open(PAGE, "w", encoding="utf-8") as f:
    f.write(html)

# ---- 4. a standalone harness, for screenshotting the ten states one by one --------
# Same CSS, same markup, same engine, same bundle — loaded from the same files, so it
# cannot drift from what the page runs. Test artefact; not part of the submission.
root_css = re.search(r"<style>\s*(:root\{.*?\})", html, re.S).group(1)
base = read(os.path.join(P, "pb.css"))
logo = re.search(r'<img class="logo" alt="Groupon" src="([^"]+)"', html).group(1)
preview = ("""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Honest Search — harness</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>""" + root_css + """
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:16px;
  line-height:1.6;-webkit-font-smoothing:antialiased;padding:26px 0}
[hidden]{display:none!important}
img{max-width:100%}
code{font-family:var(--mono);font-size:.92em}
""" + base + """</style></head><body>
<img class="logo" alt="Groupon" hidden id="harness-logo">
""" + markup + """
<script id="pbdata" type="application/json">""" + data + """</script>
<script>""" + engine + """</script>
<script>""" + ui + """</script>
</body></html>""")
preview = preview.replace('id="harness-logo"', 'id="harness-logo" src="%s"' % logo)
with open(os.path.join(HERE, "preview.html"), "w", encoding="utf-8") as f:
    f.write(preview)
print("preview.html (harness)  %.1f KB" % (len(preview) / 1024))

print("index.html rebuilt  %.1f KB (was %.1f KB)" %
      (len(html) / 1024, os.path.getsize(PAGE + ".bak") / 1024))
for k in sorted(after):
    print("  %-14s %4d -> %4d" % (k, before[k], after[k]))
