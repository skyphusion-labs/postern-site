# Changelog

All notable changes to postern-site. SemVer, `0.MINOR.PATCH` before 1.0. A release is a
`## X.Y.Z` heading here plus a matching `vX.Y.Z` tag on a commit on `main`; the deploy
workflow refuses a tag without its heading.

## Unreleased

## 0.2.3 (2026-11-12)

- Every postern link and the install command move from v1.15.0 to v1.16.0, the current
  release: the home page DEPLOY.md button, and the self-host page token, clone, release,
  upgrade, local-run and DEPLOY.md links. The anchors they use exist at v1.16.0 (DEPLOY.md
  and deploy/ are unchanged from v1.15.0).

## 0.2.2 (2026-11-12)

- Every postern link and the install command move from v1.14.0 to v1.15.0, the current
  release: the home page DEPLOY.md button, and the self-host page token, clone, release,
  upgrade, local-run and DEPLOY.md links. The anchors they use exist at v1.15.0.

## 0.2.1 (2026-11-11)

- Every postern link and the install command move from v1.9.0 to v1.14.0, the current
  release: the home page DEPLOY.md button, and the self-host page token, clone, release,
  upgrade, local-run and DEPLOY.md links. The anchors they use exist at v1.14.0.
- `ci` now fails when the site links a postern release that is not the latest
  (`scripts/check-postern-version.mjs`), and `ci` also runs daily, so the next postern
  release shows here as a red check instead of drifting unseen. A release list it cannot
  read is a failure (exit 2), not a pass.
- README: the Deploy section names the live routes (the apex and www since 0.2.0).

## 0.2.0 (2026-11-10)

- Cutover (Conrad, 2026-11-10): the site now serves the posternonline.com apex and www.
  Preview mode is off (`node scripts/set-preview.mjs off`), so pages are indexable and
  robots.txt no longer disallows crawling. The demo mailbox stays on demo.posternonline.com.
  The 0.1.x preview host next.posternonline.com is retired.

## 0.1.1 (2026-11-10)

- Post-deploy smoke (postern-site#3): after each deploy, `scripts/smoke.mjs` fetches every
  page, asset and robots.txt from each custom-domain route AS A BROWSER and fails on a
  foreign or inline script, a foreign link or frame, a CSP that differs from `site/_headers`,
  a missing X-Robots-Tag noindex in preview mode, any cookie, a wrong status or redirect,
  or a title that differs from the repo. In preview mode robots.txt must contain our own
  `Disallow: /` group; Cloudflare Managed robots.txt may prepend its own groups. The ci
  checks read repo files, so they could not see the analytics beacon the zone injected
  for browsers on 2026-11-10; this step would have failed on it.
- Comment handling in the checks follows the HTML spec (CodeQL alert 1,
  `js/incomplete-multi-character-sanitization`). `parseTags` stripped comments with
  `/<!--[\s\S]*?-->/`, which treats `<!-->` and `<!--->` as openers and ignores `--!>`, so
  a tag a browser runs after one of those was hidden from every check. That included the
  smoke, which reads HTML the edge served. `stripComments` now ends a comment where a browser
  does; `test/comments.test.mjs` holds the controls.
- The smoke tests match the beacon finding with one exact regex (escaped dots, anchored on
  the message), not `/static.cloudflareinsights.com/` (CodeQL alerts 2 and 4).

## 0.1.0 (2026-11-10)

First release, as a PREVIEW at `https://next.posternonline.com`. The apex and www are not
routed here yet; they still go to the demo.

- First site: home, agents, webmail and IMAP, self-host, privacy, and 404 pages.
  Vanilla HTML, CSS and JS with no build step, served as Cloudflare Workers static assets.
  Hero and tagline are marked DRAFT for Conrad.
- Preview mode (`site-mode.json`, applied by `scripts/set-preview.mjs`): a robots
  noindex meta on every page, an `X-Robots-Tag` header, and a robots.txt that disallows
  everything, so search engines do not index the draft. CI fails if the files and the
  flag disagree.
- The self-host page installs from the postern `v1.9.0` release tag and links its
  release notes and docs at that tag.
- CI: `ci` (HTML validation, links, assets, no third-party resources, CSP, preview mode,
  no dashes) and `coverage` (every site map page built, reachable and linked), each with
  controls that prove it goes red.
- Deploy workflow on a `vX.Y.Z` tag on main that matches this changelog. One route: the
  custom domain `next.posternonline.com`.
