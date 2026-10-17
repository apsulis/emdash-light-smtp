import type { PluginDescriptor } from "emdash";

export const PLUGIN_ID = "simple-smtp";
export const VERSION = "0.1.0";

/** Descriptor for `emdash({ plugins: [emdashSimpleSmtp()] })`. Configuration: SMTP_* environment variables. */
export function emdashSimpleSmtp(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: VERSION,
		format: "native",
		entrypoint: "@apsulis/emdash-simple-smtp/plugin",
		capabilities: ["hooks.email-transport:register"],
		adminWidgets: [{ id: "status", title: "E-mail (SMTP)", size: "half" }],
	};
}

export default emdashSimpleSmtp;
