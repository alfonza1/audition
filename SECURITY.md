# Security

Audition 0.1 is intended only for trusted local development apps. It is not a remote browser service and must not be exposed through a public tunnel or reverse proxy.

The API binds to loopback, validates Host/Origin, and requires a custom control header. Target URLs and browser HTTP requests are loopback-only; WebSockets are blocked. Browser contexts are isolated and ephemeral. No existing user profile, saved credentials, or browser cookies are loaded.

This is not a complete hostile-code sandbox. Your development apps can modify their own backends when you click or fill controls. Use disposable data. Browser reset does not undo application writes. Exports include typed input, action names, and local URLs; screenshots may contain personal information.

For sensitive security reports, use the repository's private vulnerability reporting feature when enabled. Do not put secrets or exploit details affecting users in public issues. If private reporting is unavailable, open a minimal issue requesting a private contact channel without including the vulnerability details.

Only the latest 0.1.x release is supported. Update dependencies and Chromium regularly.
