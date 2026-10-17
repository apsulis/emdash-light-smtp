import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

import { readConfig, type SmtpConfig } from "./config.js";
import { PLUGIN_ID, VERSION } from "./index.js";
import { redact, sendMail } from "./transport.js";

const ADMIN = 50;
const ANNOUNCED = Symbol.for("emdash-light-smtp:announced");

type Caller = { email: string; role: number } | undefined;
type LastTest = { at: string; to: string; ok: boolean; message: string };

const errorText = (error: unknown, config: SmtpConfig) => redact(error instanceof Error ? error.message : String(error), config);

/**
 * Native plugin. Active: provides the exclusive `email:deliver` hook over SMTP. Off (no SMTP_URL,
 * SMTP_DISABLED=1, invalid settings): the hook is not registered at all, so nothing can leave and
 * EmDash keeps its own fallbacks (copy the invite link, magic link unavailable).
 */
export function createPlugin() {
	const state = readConfig();
	const g = globalThis as Record<symbol, unknown>;
	if (!g[ANNOUNCED]) {
		g[ANNOUNCED] = true;
		if (state.enabled) {
			const { host, port, security, from } = state.config;
			console.info(`[emdash-light-smtp] active: ${host}:${port} (${security}), sender ${from}`);
		} else {
			console.warn(`[emdash-light-smtp] off: ${state.reason}. This plugin will not send any email.`);
		}
	}

	const deliver = state.enabled
		? {
				"email:deliver": {
					exclusive: true,
					// SMTP connection + TLS + authentication can exceed EmDash's 5 s default.
					timeout: 30_000,
					handler: async (event: { message: { to: string; subject: string } }, ctx: PluginContext) => {
						const { message } = event;
						try {
							await sendMail(state.config, event.message as Parameters<typeof sendMail>[1]);
							ctx.log.info(`email sent to ${message.to} ("${message.subject}")`);
						} catch (error) {
							const reason = errorText(error, state.config);
							ctx.log.warn(`failed to send to ${message.to} ("${message.subject}"): ${reason}`);
							throw new Error(`SMTP: ${reason}`);
						}
					},
				},
			}
		: {};

	async function widget(ctx: PluginContext) {
		const last = await ctx.kv.get<LastTest>("lastTest");
		const fields = state.enabled
			? [
					{ label: "State", value: "active" },
					{ label: "Server", value: `${state.config.host}:${state.config.port} (${state.config.security})` },
					{ label: "Sender", value: state.config.from },
				]
			: [{ label: "State", value: `off: ${state.reason}` }];
		if (last) fields.push({ label: "Last test", value: `${last.at.slice(0, 16).replace("T", " ")} UTC · ${last.to} · ${last.ok ? "sent" : "failed"} · ${last.message}` });
		const actions = state.enabled ? [{ type: "actions", elements: [{ type: "button", action_id: "test", label: "Send a test email", style: "primary" }] }] : [];
		return { blocks: [{ type: "fields", fields }, ...actions] };
	}

	return definePlugin({
		id: PLUGIN_ID,
		version: VERSION,
		capabilities: ["hooks.email-transport:register"],
		admin: { widgets: [{ id: "status", title: "Email (SMTP)", size: "half" }] },
		hooks: deliver,
		routes: {
			admin: {
				// Every signed-in user may load the dashboard; only administrators see or do anything.
				permission: "content:read",
				handler: async (ctx) => {
					const user = ctx.user as Caller;
					if (!user || user.role < ADMIN) return { blocks: [{ type: "context", text: "Administrators only." }] };
					const input = (ctx.input ?? {}) as { type?: string; action_id?: string };
					if (input.type !== "block_action" || input.action_id !== "test" || !state.enabled) return widget(ctx);
					const at = new Date().toISOString();
					let last: LastTest;
					try {
						const subject = "EmDash test email (SMTP)";
						const text = `Test email sent from the EmDash admin by emdash-light-smtp on ${at}.`;
						const id = await sendMail(state.config, { to: user.email, subject, text });
						last = { at, to: user.email, ok: true, message: `accepted by the server (${id})` };
					} catch (error) {
						last = { at, to: user.email, ok: false, message: errorText(error, state.config) };
					}
					await ctx.kv.set("lastTest", last);
					ctx.log.info(`test email to ${user.email}: ${last.ok ? "sent" : `failed: ${last.message}`}`);
					return { ...(await widget(ctx)), toast: { type: last.ok ? "success" : "error", message: last.message } };
				},
			},
		},
	});
}

export default createPlugin;
