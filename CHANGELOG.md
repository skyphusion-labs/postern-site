# Changelog

All notable changes to postern-site. SemVer, `0.MINOR.PATCH` before 1.0. A release is a
`## X.Y.Z` heading here plus a matching `vX.Y.Z` tag on a commit on `main`; the deploy
workflow refuses a tag without its heading.

## Unreleased

- First site: home, agents, webmail and IMAP, self-host, privacy, and 404 pages.
  Vanilla HTML, CSS and JS with no build step, served as Cloudflare Workers static assets.
- CI: `ci` (HTML validation, links, assets, no third-party resources, CSP, no dashes) and
  `coverage` (every site map page built, reachable and linked), each with controls that
  prove it goes red.
- Deploy workflow on a `vX.Y.Z` tag, gated on main ancestry and this changelog. No routes
  yet, so a deploy is not public.
