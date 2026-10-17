# @apsulis/emdash-light-smtp

[![CI](https://github.com/apsulis/emdash-light-smtp/actions/workflows/ci.yml/badge.svg)](https://github.com/apsulis/emdash-light-smtp/actions/workflows/ci.yml)

A light, hardened SMTP email provider for **self-hosted [EmDash](https://github.com/emdash-cms/emdash)** (Node.js).
It delivers EmDash's emails (magic links, invitations, plugin mail) through any SMTP relay: Mailjet, Sweego,
Brevo, Amazon SES, Cloudflare Email Service, your own server…

- **One environment variable, one line:** `SMTP_URL`. Nothing is stored in the database, so credentials never
  end up in backups or site exports, and a fresh clone with an empty `.env` sends nothing.
- **TLS is mandatory and verified** (TLS 1.2 minimum), either implicit TLS (port 465) or STARTTLS that the
  server must offer (port 587, no fallback to plain text). Plain text exists only outside production, for a
  local catcher such as [Mailpit](https://mailpit.axllent.org/).
- **A single off switch.** No `SMTP_URL`, or `SMTP_DISABLED=1`: the plugin does not register an email
  provider at all, so nothing can leave, and EmDash keeps its own fallbacks (copy the invite link by hand).
- **One runtime dependency:** [nodemailer](https://nodemailer.com/), pinned.
- A small dashboard widget for administrators: state, server, sender, and a **Send a test email** button.

It is a trusted (native) plugin: SMTP needs raw TCP sockets, which EmDash's sandboxed plugins do not have.
On Cloudflare Workers, use EmDash's `cloudflareEmail()` plugin instead.

## Install

```bash
pnpm add @apsulis/emdash-light-smtp
```

```js
// astro.config.mjs
import emdash from "emdash/astro";
import emdashLightSmtp from "@apsulis/emdash-light-smtp";

export default defineConfig({
	integrations: [emdash({ /* … */ plugins: [emdashLightSmtp()] })],
});
```

When it is the only email provider, EmDash selects it automatically (otherwise: **Settings → Email**).

## Configuration

```dotenv
# Implicit TLS (port 465 by default)
SMTP_URL=smtps://USER:PASSWORD@smtp.example.com?from=noreply@example.com&name=Example
# STARTTLS, required (port 587 by default)
SMTP_URL=smtp://USER:PASSWORD@in-v3.mailjet.com:587?from=noreply@example.com&name=Example
# Local development with Mailpit (docker run -p 8025:8025 -p 1025:1025 axllent/mailpit)
SMTP_URL=smtp://localhost:1025?from=noreply@example.test&tls=none
# Turns everything off, whatever SMTP_URL says
SMTP_DISABLED=1
```

| Part | Meaning |
|---|---|
| `smtps://` / `smtp://` | Implicit TLS / STARTTLS that the server must offer. Both verify the certificate, TLS 1.2 minimum. |
| `USER:PASSWORD` | Optional. **Percent-encode** them (`encodeURIComponent`): `@` is `%40`, `:` is `%3A`, `/` is `%2F`, `#` is `%23`, `%` is `%25`. Never logged: masked in error messages. |
| `:port` | Optional: 465 for `smtps`, 587 for `smtp`. |
| `from=` | Sender address, of a domain authorised (SPF, DKIM) at your provider. Optional when the user is itself an address (mailbox providers such as OVH). |
| `name=` | Optional display name, accents and spaces allowed. |
| `tls=none` | Plain text, for a local catcher only: refused when `NODE_ENV=production`. |

The URL is read by the WHATWG URL parser built into Node, then turned into the same settings whatever the
form. Invalid settings turn the plugin off rather than guessing; the reason is logged once at startup and
shown in the widget.

## What it deliberately does not do

No redirection of all mail to a test address, no recipient allow-list, no send log, no templates, queues,
attachments or DKIM signing (your relay signs). Keep a copy of production `.env` files out of local machines;
to work locally, leave `SMTP_URL` empty or set `SMTP_DISABLED=1`.

If a project needs them later, they belong in separate, provider-agnostic plugins rather than in this one.
EmDash 1.3.0 sends every email through `email:beforeSend` (can rewrite or cancel), `email:deliver` (this plugin)
and `email:afterSend` (fire-and-forget), and system emails (sign-in links, invites) skip the first and last
stages. So:

- a **redirect** plugin on `email:beforeSend` would reroute form notifications on a staging site while sign-in
  links still reach the right person;
- a **send log** plugin on `email:afterSend` would never see a sign-in link.

Both would work with any email provider, not only this one.

## Logs

One line at startup (`[emdash-light-smtp] active: host:port (mode), sender …` or `off: reason`), then
one line per email with recipient and subject. Message bodies (which contain sign-in links) and credentials are
never logged.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test        # unit tests + integration against a local SMTP server (needs openssl for a throw-away certificate)
pnpm pack        # builds dist/ and produces the npm tarball
```

Issues and pull requests are welcome: keep it light. A feature belongs here only if every self-hosted EmDash
site sending email through SMTP needs it; anything else is a separate plugin (see above). Security issues:
see [SECURITY.md](SECURITY.md).

## License

MIT © Apsulis
