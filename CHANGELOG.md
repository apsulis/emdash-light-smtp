# Changelog

## 0.1.1 — 2026-10-17

Release process only, no change in behaviour: versions are now staged on npm from GitHub Actions with provenance
and approved by a maintainer with two-factor authentication. The plugin reports the same version as the package.

## 0.1.0 — 2026-10-17

First version of `@apsulis/emdash-light-smtp`: SMTP delivery through nodemailer 10.1.1 for EmDash 1.3.x, configuration in one environment
variable (`SMTP_URL`: `smtps://` or `smtp://`, percent-encoded credentials, `from`, `name`, `tls=none` outside
production), mandatory verified TLS 1.2+, off switch (`SMTP_URL` unset or `SMTP_DISABLED=1`), administrator
widget with a test email.
