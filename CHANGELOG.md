# Changelog

All notable changes to postern-site. SemVer, `0.MINOR.PATCH` before 1.0. A release is a
`## X.Y.Z` heading here plus a matching `vX.Y.Z` tag on a commit on `main`; the deploy
workflow refuses a tag without its heading.

## Unreleased

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
