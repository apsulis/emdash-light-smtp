# Changelog

## 0.1.0 — 2026-10-17

First version: SMTP delivery through nodemailer 10.1.1 for EmDash 1.3.x, configuration in one environment
variable (`SMTP_URL`: `smtps://` or `smtp://`, percent-encoded credentials, `from`, `name`, `tls=none` outside
production), mandatory verified TLS 1.2+, off switch (`SMTP_URL` unset or `SMTP_DISABLED=1`), administrator
widget with a test email.
