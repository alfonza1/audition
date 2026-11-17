# Contributing

Start with the README quick start. Before sending a pull request, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`.

Keep changes focused and describe a reproducible user-visible behavior. Semantic matching must fail explicitly when it cannot identify exactly one target. Never silently introduce coordinate matching across different app layouts.

Useful first contributions include fixture apps with realistic control structures, accessible-name edge cases, an explicit per-variant mapping format, and better recovery messages. New adapters should include independent-server integration tests; do not rely solely on the built-in fixtures.

Use Node 22.12+ and npm. Runtime dependencies should stay small. Test on Windows if introducing subprocess or filesystem behavior, and avoid shell-specific npm commands. Do not commit credentials, private screenshots, browser profiles, node_modules, or generated build output.

The maintainer reviews changes before releases. Adding internet access, filesystem access from browser contexts, remote control, or custom script execution requires an explicit security design and tests.
