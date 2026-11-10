// Controls for the CI gates: each check must PASS a clean fixture and FAIL each real
// defect it exists to catch. A gate whose refusal has never been observed is decoration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSite, checkCoverage, checkDashes } from "../scripts/site-lib.mjs";
import { gate } from "../scripts/deploy-gate.mjs";

const REAL_SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "site");

function page({ title = "A page title", body = "", head = "", nav = true } = {}) {
  const links = nav
    ? '<nav><a href="/">Home</a> <a href="/a/">A</a> <a href="/b/">B</a></nav>'
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="A description long enough to pass the fifty character floor.">
<link rel="stylesheet" href="/assets/site.css"><script src="/assets/theme.js"></script>${head}
</head><body>${links}<main id="main"><h1 id="top">Title</h1>${body}</main></body></html>`;
}

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "postern-site-test-"));
  const files = {
    "index.html": page(),
    "a/index.html": page(),
    "b/index.html": page(),
    "404.html": page(),
    "assets/site.css": "body { color: black; }\n",
    "assets/theme.js": "// theme\n",
    "_headers": "/*\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; frame-src 'none'; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n",
    "sitemap.xml": "<urlset><url><loc>https://posternonline.com/</loc></url><url><loc>https://posternonline.com/a/</loc></url><url><loc>https://posternonline.com/b/</loc></url></urlset>\n",
    ...overrides,
  };
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

function siteProblems(overrides) {
  const root = fixture(overrides);
  try { return checkSite(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function coverageProblems(overrides) {
  const root = fixture(overrides);
  try { return checkCoverage(root).problems; } finally { rmSync(root, { recursive: true, force: true }); }
}
function expectOne(problems, re) {
  assert.ok(problems.some((p) => re.test(p)), `expected a problem matching ${re}, got: ${JSON.stringify(problems)}`);
}

test("control: the clean fixture passes both checks", () => {
  assert.deepEqual(siteProblems({}), []);
  assert.deepEqual(coverageProblems({}), []);
});

test("the real site passes both checks", () => {
  assert.deepEqual(checkSite(REAL_SITE), []);
  const c = checkCoverage(REAL_SITE);
  assert.deepEqual(c.problems, []);
  assert.ok(c.stats.inSitemap >= 5, "the site map lists every page");
});

// ---- ci: third-party resources ------------------------------------------------
for (const [label, head] of [
  ["script", '<script src="https://cdn.example.net/x.js"></script>'],
  ["protocol-relative script", '<script src="//cdn.example.net/x.js"></script>'],
  ["stylesheet", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'],
  ["preconnect", '<link rel="preconnect" href="https://fonts.gstatic.com">'],
  ["icon", '<link rel="icon" href="https://example.net/favicon.ico">'],
]) {
  test(`ci goes red on a third-party ${label}`, () => {
    expectOne(siteProblems({ "index.html": page({ head }) }), /third-party/);
  });
}
test("ci goes red on a third-party image", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<img src="https://t.example.net/p.gif" alt="" width="1" height="1">' }) }), /third-party/);
});
test("ci goes red on a data: image (an inline payload)", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<img src="data:image/gif;base64,R0lG" alt="" width="1" height="1">' }) }), /third-party or inline|data: URL/);
});
test("ci goes red on an iframe embed", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<iframe src="/a/" title="x"></iframe>' }) }), /<iframe> is not allowed/);
});
test("ci goes red on a third-party font in CSS", () => {
  expectOne(siteProblems({ "assets/site.css": '@font-face { font-family: X; src: url("https://fonts.gstatic.com/x.woff2"); }\n' }), /third-party/);
});
test("ci goes red on a CSS @import from a CDN", () => {
  expectOne(siteProblems({ "assets/site.css": "@import url(https://cdn.example.net/x.css);\n" }), /third-party/);
});
test("ci goes red on a CSP that allows another origin", () => {
  expectOne(siteProblems({ "_headers": "/*\n  Content-Security-Policy: default-src 'none'; script-src 'self' https://cdn.example.net; style-src 'self'; img-src 'self'; font-src 'self'; frame-src 'none'; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n" }), /CSP script-src allows https:\/\/cdn.example.net/);
});
test("ci goes red on a missing CSP", () => {
  expectOne(siteProblems({ "_headers": "/*\n  Referrer-Policy: no-referrer\n" }), /no Content-Security-Policy/);
});

// ---- ci: links and assets -------------------------------------------------------
test("ci goes red on a missing asset", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<img src="/assets/img/nope.png" alt="x" width="1" height="1">' }) }), /missing target/);
});
test("ci goes red on a broken internal link", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<a href="/nowhere/">x</a>' }) }), /missing target/);
});
test("ci goes red on a broken #fragment", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<a href="/a/#no-such-id">x</a>' }) }), /missing id #no-such-id/);
});
test("ci goes red on a missing CSS asset", () => {
  expectOne(siteProblems({ "assets/site.css": "body { background: url(/assets/img/gone.png); }\n" }), /missing target/);
});

// ---- ci: CSP consistency and page basics ---------------------------------------
test("ci goes red on an inline script", () => {
  expectOne(siteProblems({ "index.html": page({ body: "<script>alert(1)</script>" }) }), /inline <script>/);
});
test("ci goes red on an inline style attribute", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<p style="color:red">x</p>' }) }), /inline style=/);
});
test("ci goes red on an event handler", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<p onclick="x()">x</p>' }) }), /event handler onclick/);
});
test("ci goes red on an image without alt", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<img src="/favicon.svg" width="1" height="1">' }), "favicon.svg": "<svg/>" }), /has no alt/);
});
test("ci goes red on two h1 elements", () => {
  expectOne(siteProblems({ "index.html": page({ body: "<h1>Second</h1>" }) }), /exactly one <h1>/);
});
test("ci goes red on a missing lang", () => {
  expectOne(siteProblems({ "index.html": page().replace('<html lang="en">', "<html>") }), /lang attribute/);
});

// ---- ci: dashes -------------------------------------------------------------------
test("ci goes red on an em-dash or en-dash", () => {
  const texts = { "a.html": "fine\nnot \u2014 fine\n", "b.md": "range 1\u20132\n", "c.txt": "fine, really\n" };
  const problems = checkDashes(Object.keys(texts), (f) => texts[f]);
  assert.deepEqual(problems, ["a.html:2: em-dash or en-dash", "b.md:1: em-dash or en-dash"]);
});

// ---- coverage -------------------------------------------------------------------
test("coverage goes red on a site map page that is not built", () => {
  expectOne(coverageProblems({ "b/index.html": null }), /\/b\/ is not built/);
});
test("coverage goes red on a built page missing from the site map", () => {
  expectOne(coverageProblems({ "c/index.html": page() }), /c\/index.html is not in sitemap.xml/);
});
test("coverage goes red on a page no other page links to", () => {
  const unlinked = page({ nav: false });
  expectOne(
    coverageProblems({ "index.html": unlinked, "a/index.html": unlinked, "b/index.html": unlinked, "404.html": unlinked }),
    /unreachable: \/a\//,
  );
});
test("coverage goes red when one page drops a nav link", () => {
  const partial = page({ nav: false }).replace("<main", '<nav><a href="/">Home</a> <a href="/a/">A</a></nav><main');
  expectOne(coverageProblems({ "a/index.html": partial }), /not linked: \/b\/ is missing from a\/index.html/);
});
test("coverage goes red on an empty site map", () => {
  expectOne(coverageProblems({ "sitemap.xml": "<urlset></urlset>" }), /lists no pages/);
});
test("coverage goes red on a site map entry off the site origin", () => {
  expectOne(coverageProblems({ "sitemap.xml": readFileSync(join(REAL_SITE, "sitemap.xml"), "utf8").replace("https://posternonline.com/agents/", "https://evil.example/agents/") }), /not on https:\/\/posternonline.com/);
});

// ---- deploy gate ------------------------------------------------------------------
const CHANGELOG = "# Changelog\n\n## Unreleased\n\n## 0.1.0\n\n- first\n";
test("deploy gate allows a tag with a matching CHANGELOG heading", () => {
  assert.equal(gate("push", "refs/tags/v0.1.0", CHANGELOG).ok, true);
});
test("deploy gate refuses a tag with no CHANGELOG heading", () => {
  assert.equal(gate("push", "refs/tags/v0.2.0", CHANGELOG).ok, false);
});
test("deploy gate refuses a non-SemVer tag and a branch push", () => {
  assert.equal(gate("push", "refs/tags/v0.1", CHANGELOG).ok, false);
  assert.equal(gate("push", "refs/heads/main", CHANGELOG).ok, false);
});
test("deploy gate refuses a manual run off main", () => {
  assert.equal(gate("workflow_dispatch", "refs/heads/feature", CHANGELOG).ok, false);
  assert.equal(gate("workflow_dispatch", "refs/heads/main", CHANGELOG).ok, true);
});
test("deploy gate refuses any other event", () => {
  assert.equal(gate("pull_request", "refs/tags/v0.1.0", CHANGELOG).ok, false);
});

// Keep the real-site copy test honest: a defect injected into a COPY of the real site
// must be caught, so the real-site pass above is not a pass by blindness.
test("a defect injected into a copy of the real site goes red", () => {
  const root = mkdtempSync(join(tmpdir(), "postern-site-real-"));
  try {
    cpSync(REAL_SITE, root, { recursive: true });
    const f = join(root, "agents", "index.html");
    writeFileSync(f, readFileSync(f, "utf8").replace("</head>", '<script src="https://www.googletagmanager.com/gtag/js"></script>\n</head>'));
    expectOne(checkSite(root), /agents\/index.html: third-party/);
    const g = join(root, "humans", "index.html");
    writeFileSync(g, readFileSync(g, "utf8").replaceAll('href="/self-host/"', 'href="/"'));
    expectOne(checkCoverage(root).problems, /not linked: \/self-host\/ is missing from humans\/index.html/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
