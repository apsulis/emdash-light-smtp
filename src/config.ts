/** SMTP settings, read from the environment only (never stored in the database). */
export type Security = "tls" | "starttls" | "none";

export interface SmtpConfig {
	host: string;
	port: number;
	security: Security;
	user?: string;
	password?: string;
	/** Sender, "Name <address>" accepted. */
	from: string;
}

export type SmtpState = { enabled: true; config: SmtpConfig } | { enabled: false; reason: string };

const DEFAULT_PORTS: Record<Security, number> = { tls: 465, starttls: 587, none: 25 };

/** Off unless SMTP_HOST is set and valid; SMTP_DISABLED=1 wins over everything. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): SmtpState {
	const off = (reason: string): SmtpState => ({ enabled: false, reason });
	if (env.SMTP_DISABLED === "1" || env.SMTP_DISABLED === "true") return off("SMTP_DISABLED=1");
	const host = env.SMTP_HOST?.trim();
	if (!host) return off("SMTP_HOST absent");
	const rawPort = env.SMTP_PORT?.trim();
	const security = (env.SMTP_SECURE?.trim() || (rawPort === "465" ? "tls" : "starttls")) as Security;
	if (!Object.hasOwn(DEFAULT_PORTS, security)) return off(`SMTP_SECURE invalide (${security}) : tls, starttls ou none`);
	if (security === "none" && env.NODE_ENV === "production") return off("SMTP_SECURE=none refusé en production");
	const port = rawPort ? Number(rawPort) : DEFAULT_PORTS[security];
	if (!Number.isInteger(port) || port < 1 || port > 65535) return off(`SMTP_PORT invalide (${rawPort})`);
	const from = env.SMTP_FROM?.trim();
	if (!from?.includes("@")) return off("SMTP_FROM absent ou invalide");
	const user = env.SMTP_USER || undefined;
	const password = env.SMTP_PASSWORD || undefined;
	return { enabled: true, config: { host, port, security, user, password, from } };
}
