# @apsulis/emdash-simple-smtp

A minimal, hardened SMTP email provider for **self-hosted [EmDash](https://github.com/emdash-cms/emdash)** (Node.js).
It delivers EmDash's emails (magic links, invitations, plugin mail) through any SMTP relay: Mailjet, Sweego,
Brevo, Amazon SES, Cloudflare Email Service, your own server…

- **Configuration from environment variables only.** Nothing is stored in the database, so credentials never
  end up in backups or site exports, and a fresh clone with an empty `.env` sends nothing.
- **TLS is mandatory and verified** (TLS 1.2 minimum), either implicit TLS (port 465) or STARTTLS that the
  server must offer (port 587, no fallback to plain text). Plain text exists only outside production, for a
  local catcher such as [Mailpit](https://mailpit.axllent.org/).
- **A single off switch.** No `SMTP_HOST`, or `SMTP_DISABLED=1`: the plugin does not register an email
  provider at all, so nothing can leave, and EmDash keeps its own fallbacks (copy the invite link by hand).
- **One runtime dependency:** [nodemailer](https://nodemailer.com/), pinned.
- A small dashboard widget for administrators: state, server, sender, and a **Send a test email** button.

It is a trusted (native) plugin: SMTP needs raw TCP sockets, which EmDash's sandboxed plugins do not have.
On Cloudflare Workers, use EmDash's `cloudflareEmail()` plugin instead.

## Install

```bash
pnpm add @apsulis/emdash-simple-smtp
```

```js
// astro.config.mjs
import emdash from "emdash/astro";
import emdashSimpleSmtp from "@apsulis/emdash-simple-smtp";

export default defineConfig({
	integrations: [emdash({ /* … */ plugins: [emdashSimpleSmtp()] })],
});
```

When it is the only email provider, EmDash selects it automatically (otherwise: **Settings → Email**).

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `SMTP_HOST` | yes | SMTP server. Unset = off. |
| `SMTP_PORT` | no | Defaults to 465 (`tls`), 587 (`starttls`), 25 (`none`). |
| `SMTP_SECURE` | no | `tls` (implicit TLS), `starttls` (STARTTLS required) or `none` (plain text, refused when `NODE_ENV=production`). Defaults to `tls` on port 465, `starttls` otherwise. |
| `SMTP_USER`, `SMTP_PASSWORD` | if the server needs them | Credentials. Never logged: masked in error messages. |
| `SMTP_FROM` | yes | Sender, `Name <address>` accepted. Use an address of a domain authorised (SPF, DKIM) at your provider. |
| `SMTP_DISABLED` | no | `1` turns everything off, whatever else is set. |

Invalid settings turn the plugin off rather than guessing; the reason is logged once at startup and shown in
the widget.

```dotenv
# Production (example: Mailjet over STARTTLS)
SMTP_HOST=in-v3.mailjet.com
SMTP_PORT=587
SMTP_SECURE=starttls
SMTP_USER=…
SMTP_PASSWORD=…
SMTP_FROM=Example <noreply@example.com>

# Local development with Mailpit (docker run -p 8025:8025 -p 1025:1025 axllent/mailpit)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=none
SMTP_FROM=Dev <noreply@example.test>
```

## What it deliberately does not do

No redirection of all mail to a test address, no recipient allow-list, no send log, no templates, queues,
attachments or DKIM signing (your relay signs). Keep a copy of production `.env` files out of local machines;
to work locally, leave `SMTP_HOST` empty or set `SMTP_DISABLED=1`.

If a project needs them later, they belong in separate, provider-agnostic plugins rather than in this one.
EmDash 1.3.0 sends every email through `email:beforeSend` (can rewrite or cancel), `email:deliver` (this plugin)
and `email:afterSend` (fire-and-forget), and system emails (sign-in links, invites) skip the first and last
stages. So:

- a **redirect** plugin on `email:beforeSend` would reroute form notifications on a staging site while sign-in
  links still reach the right person;
- a **send log** plugin on `email:afterSend` would never see a sign-in link.

Both would work with any email provider, not only this one.

## Logs

One line at startup (`[emdash-simple-smtp] actif : host:port (mode), expéditeur …` or `coupé : reason`), then
one line per email with recipient and subject. Message bodies (which contain sign-in links) and credentials are
never logged.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test        # unit tests + integration against a local SMTP server (needs openssl for a throw-away certificate)
pnpm pack        # builds dist/ and produces the npm tarball
```

## License

MIT © Apsulis
