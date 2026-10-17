import type { PluginDescriptor } from "emdash";

export const PLUGIN_ID = "light-smtp";
export const VERSION = "0.1.0";

/** Descriptor for `emdash({ plugins: [emdashLightSmtp()] })`. Configuration: the SMTP_URL environment variable (see README). */
export function emdashLightSmtp(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: VERSION,
		format: "native",
		entrypoint: "@apsulis/emdash-light-smtp/plugin",
		capabilities: ["hooks.email-transport:register"],
		adminWidgets: [{ id: "status", title: "Email (SMTP)", size: "half" }],
	};
}

export default emdashLightSmtp;
