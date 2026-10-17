import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

import { readConfig, type SmtpConfig } from "./config.js";
import { PLUGIN_ID, VERSION } from "./index.js";
import { redact, sendMail } from "./transport.js";

const ADMIN = 50;
const ANNOUNCED = Symbol.for("emdash-simple-smtp:announced");

type Caller = { email: string; role: number } | undefined;
type LastTest = { at: string; to: string; ok: boolean; message: string };

const errorText = (error: unknown, config: SmtpConfig) => redact(error instanceof Error ? error.message : String(error), config);

/**
 * Native plugin. Active: provides the exclusive `email:deliver` hook over SMTP. Off (no SMTP_HOST,
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
			console.info(`[emdash-simple-smtp] actif : ${host}:${port} (${security}), expéditeur ${from}`);
		} else {
			console.warn(`[emdash-simple-smtp] coupé : ${state.reason}. Aucun e-mail ne sera envoyé par cette extension.`);
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
							ctx.log.info(`e-mail envoyé à ${message.to} (« ${message.subject} »)`);
						} catch (error) {
							const reason = errorText(error, state.config);
							ctx.log.warn(`échec de l'envoi à ${message.to} (« ${message.subject} ») : ${reason}`);
							throw new Error(`SMTP : ${reason}`);
						}
					},
				},
			}
		: {};

	async function widget(ctx: PluginContext) {
		const last = await ctx.kv.get<LastTest>("lastTest");
		const fields = state.enabled
			? [
					{ label: "État", value: "actif" },
					{ label: "Serveur", value: `${state.config.host}:${state.config.port} (${state.config.security})` },
					{ label: "Expéditeur", value: state.config.from },
				]
			: [{ label: "État", value: `coupé : ${state.reason}` }];
		if (last) fields.push({ label: "Dernier test", value: `${last.at.slice(0, 16).replace("T", " ")} UTC · ${last.to} · ${last.ok ? "envoyé" : "échec"} · ${last.message}` });
		const actions = state.enabled ? [{ type: "actions", elements: [{ type: "button", action_id: "test", label: "Envoyer un e-mail de test", style: "primary" }] }] : [];
		return { blocks: [{ type: "fields", fields }, ...actions] };
	}

	return definePlugin({
		id: PLUGIN_ID,
		version: VERSION,
		capabilities: ["hooks.email-transport:register"],
		admin: { widgets: [{ id: "status", title: "E-mail (SMTP)", size: "half" }] },
		hooks: deliver,
		routes: {
			admin: {
				// Every signed-in user may load the dashboard; only administrators see or do anything.
				permission: "content:read",
				handler: async (ctx) => {
					const user = ctx.user as Caller;
					if (!user || user.role < ADMIN) return { blocks: [{ type: "context", text: "Réservé aux administrateurs." }] };
					const input = (ctx.input ?? {}) as { type?: string; action_id?: string };
					if (input.type !== "block_action" || input.action_id !== "test" || !state.enabled) return widget(ctx);
					const at = new Date().toISOString();
					let last: LastTest;
					try {
						const subject = "E-mail de test EmDash (SMTP)";
						const text = `E-mail de test envoyé depuis l'administration EmDash par emdash-simple-smtp, le ${at}.`;
						const id = await sendMail(state.config, { to: user.email, subject, text });
						last = { at, to: user.email, ok: true, message: `accepté par le serveur (${id})` };
					} catch (error) {
						last = { at, to: user.email, ok: false, message: errorText(error, state.config) };
					}
					await ctx.kv.set("lastTest", last);
					ctx.log.info(`e-mail de test à ${user.email} : ${last.ok ? "envoyé" : `échec : ${last.message}`}`);
					return { ...(await widget(ctx)), toast: { type: last.ok ? "success" : "error", message: last.message } };
				},
			},
		},
	});
}

export default createPlugin;
