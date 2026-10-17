/** SMTP settings, read from one environment variable (never stored in the database). */
export type Security = "tls" | "starttls" | "none";

export interface SmtpConfig {
	host: string;
	port: number;
	security: Security;
	user?: string;
	password?: string;
	/** Sender: `address` or `"Name" <address>`. */
	from: string;
}

export type SmtpState = { enabled: true; config: SmtpConfig } | { enabled: false; reason: string };

const DEFAULT_PORTS: Record<Security, number> = { tls: 465, starttls: 587, none: 25 };

/**
 * `SMTP_URL`, one line, parsed by the WHATWG URL parser built into Node:
 *
 *   smtps://user:password@host[:port]?from=address&name=Name   implicit TLS, default port 465
 *   smtp://user:password@host[:port]?from=address&name=Name    STARTTLS required, default port 587
 *   smtp://host:1025?from=address&tls=none                     plain text (local catcher), refused in production
 *
 * User and password are percent-encoded (`encodeURIComponent`). `from` defaults to the user when it is an
 * address. Off unless `SMTP_URL` is set and valid; `SMTP_DISABLED=1` wins over everything.
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): SmtpState {
	const off = (reason: string): SmtpState => ({ enabled: false, reason });
	if (env.SMTP_DISABLED === "1" || env.SMTP_DISABLED === "true") return off("SMTP_DISABLED=1");
	const raw = env.SMTP_URL?.trim();
	if (!raw) return off("SMTP_URL not set");
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return off("SMTP_URL is not a valid URL");
	}
	if (url.protocol !== "smtp:" && url.protocol !== "smtps:") return off(`SMTP_URL: unknown scheme ${url.protocol} (smtp: or smtps:)`);
	if (!url.hostname) return off("SMTP_URL: no host");
	const tls = url.searchParams.get("tls");
	if (tls !== null && tls !== "none") return off(`SMTP_URL: unknown tls=${tls} (only tls=none exists)`);
	const security: Security = tls === "none" ? "none" : url.protocol === "smtps:" ? "tls" : "starttls";
	if (security === "none" && env.NODE_ENV === "production") return off("SMTP_URL: tls=none refused in production");
	const port = url.port ? Number(url.port) : DEFAULT_PORTS[security];
	const user = url.username ? decodeURIComponent(url.username) : undefined;
	const password = url.password ? decodeURIComponent(url.password) : undefined;
	const address = url.searchParams.get("from")?.trim() || (user?.includes("@") ? user : "");
	if (!/^[^\s@<>"]+@[^\s@<>"]+$/.test(address)) return off("SMTP_URL: missing or invalid sender (from=address)");
	const name = url.searchParams.get("name")?.trim();
	// Quoted display name: commas, accents or quotes in it cannot split the address list.
	const from = name ? `"${name.replace(/["\\]/g, "\\$&")}" <${address}>` : address;
	return { enabled: true, config: { host: url.hostname, port, security, user, password, from } };
}
