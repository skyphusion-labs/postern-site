// Shared, dependency-free checks for postern-site. Every check returns a list of
// problems (strings); an empty list is a pass. The CLI wrappers exit 1 on any problem.
//
// The parser is deliberately small: the site is hand-written HTML with no build step, so
// a tag-and-attribute scan is enough, and html-validate (CI) checks the HTML grammar.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, extname, sep } from "node:path";

export const SITE_ORIGIN = "https://posternonline.com";

export function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out.sort();
}

const TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_RE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;

export function parseTags(html) {
  const src = html.replace(/<!--[\s\S]*?-->/g, "");
  const tags = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(src))) {
    const attrs = {};
    let a;
    ATTR_RE.lastIndex = 0;
    while ((a = ATTR_RE.exec(m[2]))) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
    }
    tags.push({ name: m[1].toLowerCase(), attrs, index: m.index, end: TAG_RE.lastIndex });
  }
  return { src, tags };
}

// Absolute (http, https, protocol-relative) or a data:/blob: URL: anything the
// browser would fetch from somewhere other than this site.
export function isOffsite(url) {
  return /^\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url) || /^\s*(?:data|blob|javascript):/i.test(url);
}

function srcsetUrls(v) {
  return v.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
}

// Resolve a same-site URL to a file under root, the way Workers static assets with
// html_handling = "auto-trailing-slash" does. Returns { file, fragment } or { error }.
export function resolveLocal(root, fromFile, url) {
  const [beforeHash, fragment = ""] = url.split("#");
  const path = beforeHash.split("?")[0];
  let target;
  if (path === "") target = fromFile;
  else if (path.startsWith("/")) target = join(root, path);
  else target = join(dirname(fromFile), path);
  if (!target.startsWith(root)) return { error: `escapes the site root: ${url}` };
  const candidates = [];
  if (path === "") candidates.push(target);
  else if (path.endsWith("/")) candidates.push(join(target, "index.html"));
  else if (extname(path) === "") candidates.push(target + ".html", join(target, "index.html"));
  else candidates.push(target);
  const file = candidates.find((c) => existsSync(c) && statSync(c).isFile());
  if (!file) return { error: `missing target for ${url}` };
  return { file, fragment: decodeURIComponent(fragment) };
}

function idsIn(html) {
  const ids = new Set();
  for (const t of parseTags(html).tags) if (t.attrs.id) ids.add(t.attrs.id);
  return ids;
}

const FORBIDDEN_ELEMENTS = new Set(["iframe", "frame", "frameset", "embed", "object", "portal", "applet", "base", "form"]);
// Attributes that make the browser fetch something.
const FETCH_ATTRS = {
  script: ["src"], link: ["href"], img: ["src", "srcset"], source: ["src", "srcset"],
  video: ["src", "poster"], audio: ["src"], track: ["src"], input: ["src"],
  image: ["href", "xlink:href"], use: ["href", "xlink:href"], feimage: ["href", "xlink:href"],
};

export function checkHtmlFile(root, file, html) {
  const rel = relative(root, file);
  const problems = [];
  const { src, tags } = parseTags(html);
  const p = (msg) => problems.push(`${rel}: ${msg}`);

  for (const t of tags) {
    if (FORBIDDEN_ELEMENTS.has(t.name)) p(`<${t.name}> is not allowed (no embeds, frames or forms)`);
    for (const [k, v] of Object.entries(t.attrs)) {
      if (/^on/.test(k)) p(`inline event handler ${k}= on <${t.name}> (CSP blocks it)`);
      if (k === "style") p(`inline style= on <${t.name}> (CSP blocks it)`);
      if (/^(?:javascript|data|vbscript):/i.test(v.trim()) && ["href", "src", "action", "formaction", "srcset", "poster"].includes(k)) {
        p(`${k}="${v}" on <${t.name}> uses a ${v.split(":")[0]}: URL`);
      }
    }
    if (t.name === "style") p("<style> block (CSP blocks inline styles; use /assets/site.css)");
    if (t.name === "script") {
      if (!t.attrs.src) p("inline <script> (CSP blocks it; use a file under /assets/)");
      else {
        const close = src.indexOf("</script>", t.end);
        if (close !== -1 && src.slice(t.end, close).trim() !== "") p("<script src> with inline body");
      }
    }
    for (const attr of FETCH_ATTRS[t.name] || []) {
      const v = t.attrs[attr];
      if (v === undefined) continue;
      const urls = attr === "srcset" ? srcsetUrls(v) : [v];
      for (const u of urls) {
        if (t.name === "link" && /\bcanonical\b/i.test(t.attrs.rel || "")) {
          if (!u.startsWith(SITE_ORIGIN + "/")) p(`canonical must be on ${SITE_ORIGIN}: ${u}`);
          continue;
        }
        if (isOffsite(u)) { p(`third-party or inline URL in <${t.name} ${attr}>: ${u}`); continue; }
        const r = resolveLocal(root, file, u);
        if (r.error) p(`<${t.name} ${attr}> ${r.error}`);
      }
    }
    if (t.name === "a" && t.attrs.href !== undefined) {
      const h = t.attrs.href;
      if (/^(?:https?:)?\/\//i.test(h) || /^mailto:/i.test(h)) continue; // outbound links are fine
      const r = resolveLocal(root, file, h);
      if (r.error) { p(`<a href> ${r.error}`); continue; }
      if (r.fragment && extname(r.file) === ".html") {
        const ids = r.file === file ? idsIn(html) : idsIn(readFileSync(r.file, "utf8"));
        if (!ids.has(r.fragment)) p(`<a href="${h}"> points at a missing id #${r.fragment}`);
      }
    }
    if (t.name === "img") {
      if (t.attrs.alt === undefined) p(`<img src="${t.attrs.src}"> has no alt`);
      if (!t.attrs.width || !t.attrs.height) p(`<img src="${t.attrs.src}"> needs width and height (layout shift)`);
    }
  }

  // Page basics (accessibility and the Lighthouse-clean floor).
  const html0 = tags.find((t) => t.name === "html");
  if (!html0 || !html0.attrs.lang) p("<html> needs a lang attribute");
  if (!/<title>[^<]+<\/title>/.test(src)) p("missing or empty <title>");
  const metas = tags.filter((t) => t.name === "meta");
  if (!metas.some((t) => t.attrs.name === "viewport" && /width=device-width/.test(t.attrs.content || ""))) p("missing <meta name=viewport width=device-width>");
  if (!metas.some((t) => t.attrs.name === "description" && (t.attrs.content || "").length >= 50)) p("missing or short <meta name=description>");
  if (!metas.some((t) => t.attrs.charset)) p("missing <meta charset>");
  const h1s = tags.filter((t) => t.name === "h1").length;
  if (h1s !== 1) p(`expected exactly one <h1>, found ${h1s}`);
  if (!tags.some((t) => t.name === "main" && t.attrs.id === "main")) p('missing <main id="main"> (the skip link target)');
  if (!tags.some((t) => t.name === "script" && t.attrs.src === "/assets/theme.js")) p("missing /assets/theme.js (theme switch)");
  return problems;
}

export function checkCssFile(root, file, css) {
  const rel = relative(root, file);
  const problems = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const urls = [];
  for (const m of clean.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) urls.push(m[1] ?? m[2] ?? m[3]);
  for (const m of clean.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi)) urls.push(m[1]);
  for (const u of urls) {
    if (isOffsite(u)) { problems.push(`${rel}: third-party or inline URL in CSS: ${u}`); continue; }
    const r = resolveLocal(root, file, u);
    if (r.error) problems.push(`${rel}: CSS ${r.error}`);
  }
  return problems;
}

// The CSP in _headers may name only 'self' and 'none' as sources.
export function checkHeaders(root) {
  const f = join(root, "_headers");
  if (!existsSync(f)) return ["_headers: missing (the Content-Security-Policy lives there)"];
  const text = readFileSync(f, "utf8");
  const line = text.split("\n").find((l) => /^\s*Content-Security-Policy:/i.test(l));
  if (!line) return ["_headers: no Content-Security-Policy"];
  const problems = [];
  const policy = line.replace(/^\s*Content-Security-Policy:\s*/i, "");
  const directives = policy.split(";").map((d) => d.trim()).filter(Boolean);
  const names = new Set();
  for (const d of directives) {
    const [name, ...sources] = d.split(/\s+/);
    names.add(name.toLowerCase());
    for (const s of sources) {
      if (s !== "'self'" && s !== "'none'") problems.push(`_headers: CSP ${name} allows ${s}; only 'self' or 'none' are permitted`);
    }
  }
  for (const need of ["default-src", "script-src", "style-src", "img-src", "font-src", "frame-src", "frame-ancestors"]) {
    if (!names.has(need)) problems.push(`_headers: CSP has no ${need}`);
  }
  if (!/^\s*Referrer-Policy:\s*no-referrer\s*$/im.test(text)) problems.push("_headers: Referrer-Policy must be no-referrer");
  return problems;
}

export function checkSite(root) {
  const problems = [];
  for (const file of listFiles(root)) {
    const ext = extname(file);
    if (ext === ".html") problems.push(...checkHtmlFile(root, file, readFileSync(file, "utf8")));
    else if (ext === ".css") problems.push(...checkCssFile(root, file, readFileSync(file, "utf8")));
  }
  problems.push(...checkHeaders(root));
  return problems;
}

// No em-dash (U+2014) or en-dash (U+2013) anywhere (house style).
export function checkDashes(files, readText = (f) => readFileSync(f, "utf8")) {
  const problems = [];
  const bad = /[\u2013\u2014]/;
  for (const f of files) {
    if (/\.(png|jpe?g|gif|webp|ico|woff2?)$/i.test(f)) continue;
    const lines = readText(f).split("\n");
    lines.forEach((l, i) => { if (bad.test(l)) problems.push(`${f}:${i + 1}: em-dash or en-dash`); });
  }
  return problems;
}

// ---- coverage ---------------------------------------------------------------

export function sitemapPaths(root) {
  const f = join(root, "sitemap.xml");
  if (!existsSync(f)) return { error: "sitemap.xml missing" };
  const xml = readFileSync(f, "utf8");
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  return { locs };
}

export function pageFileFor(root, path) {
  const r = resolveLocal(root, join(root, "index.html"), path);
  return r.error ? null : r.file;
}

function internalLinks(root, file) {
  const out = [];
  for (const t of parseTags(readFileSync(file, "utf8")).tags) {
    if (t.name !== "a" || t.attrs.href === undefined) continue;
    const h = t.attrs.href;
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(h) || /^mailto:/i.test(h)) continue;
    const r = resolveLocal(root, file, h);
    if (!r.error && extname(r.file) === ".html") out.push(r.file);
  }
  return out;
}

// Every page in the site map is built, every built page is in the site map, every page
// is reachable from the home page, and every other page is linked from every page
// (header or footer), so no page can drift out of the navigation.
export function checkCoverage(root) {
  const problems = [];
  const sm = sitemapPaths(root);
  if (sm.error) return { problems: [sm.error], stats: null };
  const pages = new Map(); // file -> path
  for (const loc of sm.locs) {
    if (!loc.startsWith(SITE_ORIGIN + "/")) { problems.push(`sitemap: ${loc} is not on ${SITE_ORIGIN}`); continue; }
    const path = loc.slice(SITE_ORIGIN.length);
    const file = pageFileFor(root, path);
    if (!file) { problems.push(`sitemap: ${path} is not built (no file)`); continue; }
    pages.set(file, path);
  }
  if (sm.locs.length === 0) problems.push("sitemap: lists no pages");
  const htmlFiles = listFiles(root).filter((f) => extname(f) === ".html" && relative(root, f) !== "404.html");
  for (const f of htmlFiles) if (!pages.has(f)) problems.push(`sitemap: built page ${relative(root, f)} is not in sitemap.xml`);

  const home = join(root, "index.html");
  const seen = new Set();
  const queue = existsSync(home) ? [home] : [];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const g of internalLinks(root, f)) if (!seen.has(g)) queue.push(g);
  }
  let reachable = 0;
  for (const [f, path] of pages) {
    if (seen.has(f)) reachable++;
    else problems.push(`unreachable: ${path} cannot be reached by links from /`);
  }
  let linkedEverywhere = 0;
  const all = [...htmlFiles, join(root, "404.html")].filter((f) => existsSync(f));
  for (const [f, path] of pages) {
    if (path === "/") { linkedEverywhere++; continue; }
    const missing = all.filter((g) => g !== f && !internalLinks(root, g).includes(f));
    if (missing.length) problems.push(`not linked: ${path} is missing from ${missing.map((g) => relative(root, g).split(sep).join("/")).join(", ")}`);
    else linkedEverywhere++;
  }
  return { problems, stats: { inSitemap: sm.locs.length, built: pages.size, reachable, linkedEverywhere } };
}
