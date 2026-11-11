# postern-site

The marketing site for [Postern](https://github.com/skyphusion-labs/postern), self-hosted
email for humans and agents. It will live at `posternonline.com`.

Status: **preview** at https://next.posternonline.com (postern#838), not indexed. The hero and
tagline are marked DRAFT for Conrad, who owns the pitch. The crew builds the site.

## Rules

- **Vanilla HTML, CSS and JS. No build step, no framework, no preprocessor.** What is in
  `site/` is exactly what is served.
- **Nothing from anyone else.** No third-party scripts, stylesheets, fonts, images,
  frames or embeds, and no cookies or analytics. Privacy is Postern's primary goal. The
  CSP in `site/_headers` enforces it in the browser and `scripts/check-site.mjs` in CI.
- **Self-host only.** There is no hosted Postern. The site must never imply one.
- **Link to the Postern docs rather than copy them**, so the two cannot drift.
- No em-dashes or en-dashes anywhere (CI enforces this).

## Layout

| Path | What |
|---|---|
| `site/` | Everything served: pages, `assets/`, `_headers`, `sitemap.xml`, `robots.txt` |
| `site/sitemap.xml` | The site map. Every page must be listed, built, and linked from every page |
| `scripts/` | The CI checks and the deploy gate (Node, no dependencies) |
| `test/` | Controls: each check must pass a clean fixture and fail each defect it exists to catch |
| `wrangler.toml` | A static-assets-only Cloudflare Worker |

Adding a page: create `site/<name>/index.html` from an existing page (copy its header and
footer), add it to the header nav or footer of EVERY page, and add it to
`site/sitemap.xml`. The `coverage` check fails until all three are done.

## Run it locally

```bash
npm ci
npm test                 # the controls
npm run validate         # html-validate
npm run check            # links, assets, third-party, CSP, dashes
npm run coverage         # site map coverage
npm run dev              # wrangler dev on http://localhost:8787
npm run smoke            # the deployed site, fetched as a browser (needs network)
```

## Preview mode

`site-mode.json` holds one flag, `"preview"`. While it is `true`, every page carries a robots
noindex meta, `_headers` sends `X-Robots-Tag: noindex, nofollow`, and `robots.txt` disallows
everything. Change it ONLY with `node scripts/set-preview.mjs on|off`, which rewrites those
files to match; CI fails if the flag and the files disagree. At the apex cutover, run
`off` in the same PR that adds the apex and www routes.

**Known property of the preview: robots.txt does not block crawling.** Cloudflare Managed
robots.txt stays on for the zone, by ruling. It puts its own `User-agent: *` group with
`Allow: /` before ours. RFC 9309 merges groups for the same user agent, and on a tie the
least restrictive rule wins, so a conforming crawler may crawl the preview. The noindex is
the control that keeps it out of search results: `X-Robots-Tag` on every page and asset, and
the robots meta on every page. The post-deploy smoke asserts both, and checks only that our
own `Disallow: /` group is present, not that it is the only one.

## Deploy

`.github/workflows/deploy.yml` deploys on a `vX.Y.Z` tag on `main` that matches a
`## X.Y.Z` heading in `CHANGELOG.md`, or by hand from `main`. A merge never deploys.
After the upload, a post-deploy smoke (`scripts/smoke.mjs`) fetches every page as a browser
from each custom-domain route and fails on anything the edge added or changed.
The routes are `posternonline.com` and `www.posternonline.com` (`wrangler.toml`, since 0.2.0).
The demo mailbox is `demo.posternonline.com`, in the postern-demo repo.

The site links one postern release throughout. `ci` fails when any link names a release that
is not the latest (`scripts/check-postern-version.mjs`, also run daily), so a new postern
release needs a site PR that moves every link, then a site tag.

## License

[AGPL-3.0](LICENSE). The webmail screenshots in `site/assets/img/` come from the Postern
repository (`webmail/screenshots/`) and use synthetic example data.
