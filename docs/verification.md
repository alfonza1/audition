# Release verification

Local verification used Windows 11, Node.js 24.18.1, and Playwright's headless Chromium. No visible browser window or existing browser profile was used.

Verified behaviors:

- TypeScript compilation, ESLint, production frontend build, and input-validation unit tests.
- Real independently served localhost app together with two fixture apps.
- Semantic fill/click producing changed DOM in all three contexts.
- Explicit missing and duplicate control failures, plus screenshot coordinate-to-semantic target discovery.
- Desktop/mobile viewport switching and browser-storage reset.
- Remote navigation and attempts to reach the Audition API from app contexts blocked.
- Missing API control header and foreign Origin rejected.
- UI demo flow, chosen variant, review feedback and actual downloaded JSON file.
- 390px mobile layout without horizontal overflow; desktop and mobile screenshots inspected.
- No browser page errors during the UI workflow.

`npm run test:e2e` reproduces these checks. The committed screenshot is generated from the actual application. `artifacts/mobile.png` is an ignored local inspection artifact.

Review traced URL validation, HTTP Host/Origin checks, body limits, Chromium request routes, action validation, context cleanup, and exports. Limitations are explicit in the README and architecture document. The tool is for trusted local apps, not hostile-workload containment. Chromium isolation is not a substitute for an OS security boundary.

CI is configured for Windows and Linux. Local execution alone does not establish a Linux CI result; consult the repository's Actions page for the actual run.
