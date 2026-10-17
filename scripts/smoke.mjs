#!/usr/bin/env node
/**
 * Smoke test against a real SMTP relay, through the plugin's own code path (readConfig + sendMail:
 * TLS required, certificate verified). Reads SMTP_URL from the environment, sends one message to
 * SMOKE_TO, prints the outcome. Credentials are never printed.
 *
 *   pnpm build && SMTP_URL='smtps://user:password@host?from=…' SMOKE_TO=you@example.org node scripts/smoke.mjs
 */
import { readConfig } from "../dist/config.js";
import { redact, sendMail } from "../dist/transport.js";

const to = process.env.SMOKE_TO?.trim();
const label = process.env.SMOKE_LABEL?.trim() || "relay";
if (!to?.includes("@")) {
	console.error("SMOKE_TO missing");
	process.exit(2);
}

const state = readConfig(process.env);
if (!state.enabled) {
	console.error(`[${label}] plugin would be off: ${state.reason}`);
	process.exit(2);
}
const { config } = state;
const fromDomain = config.from.replace(/^.*@/, "").replace(/>.*$/, "");
console.log(`[${label}] ${config.host}:${config.port} (${config.security}), sender domain ${fromDomain}`);

const started = Date.now();
try {
	const id = await sendMail(config, {
		to,
		subject: `[emdash-simple-smtp] smoke test ${label} ${new Date().toISOString()}`,
		text: `Smoke test sent through ${config.host}:${config.port} (${config.security}) by @apsulis/emdash-simple-smtp.`,
		html: `<p>Smoke test sent through <strong>${config.host}:${config.port}</strong> (${config.security}) by @apsulis/emdash-simple-smtp.</p>`,
	});
	console.log(`[${label}] accepted in ${Date.now() - started} ms, message id ${id}`);
} catch (error) {
	const e = /** @type {{ message?: string, code?: string, responseCode?: number, errors?: Error[] }} */ (error);
	const message = [e.code, e.responseCode, e.message || e.errors?.map((x) => x.message).join(" ; ")].filter(Boolean).join(" ");
	console.error(`[${label}] failed after ${Date.now() - started} ms: ${redact(message, config)}`);
	process.exit(1);
}
