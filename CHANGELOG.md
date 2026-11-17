# Changelog

## 0.2.0

- Explicit per-preview semantic control mappings, preserved across reset and included in review evidence.
- Opt-in local review drafts with restore and deletion; restore revalidates URLs and mapping limits.
- Transactional reconnect keeps the working session on navigation failure; crashed Chromium can be relaunched through reset.
- HTTP 409 concurrency protection covers screenshots, hit testing, reports and mutations.
- Expanded desktop/mobile integration coverage for mappings, drafts, recovery and failures.

## 0.1.0

Initial release: local comparison of two or three independent web apps, semantic click/fill/select/keyboard actions, screenshot targeting, desktop/mobile viewports, mismatch reporting, isolated browser resets, variant picks, review notes, and JSON export. Includes three functioning demo apps, real-browser tests, security boundaries, and a static project page.

Known limits: loopback-only requests; WebSockets blocked; top-level named controls; snapshot-based previews; browser reset does not reset backend data; one shared local session.
