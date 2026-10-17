import nodemailer from "nodemailer";

import type { SmtpConfig } from "./config.js";

export interface OutgoingMessage {
	to: string;
	cc?: string[];
	replyTo?: string;
	subject: string;
	text: string;
	html?: string;
}

/**
 * nodemailer options. TLS is mandatory and the certificate verified (TLS 1.2 minimum): implicit TLS
 * ("tls") or STARTTLS required ("starttls"). "none" (plain text) only exists outside production,
 * for a local catcher such as Mailpit. `ca` lets tests trust their own certificate authority; there
 * is no way to turn certificate verification off.
 */
export function transportOptions(config: SmtpConfig, ca?: string | Buffer) {
	const plain = config.security === "none";
	return {
		host: config.host,
		port: config.port,
		secure: config.security === "tls",
		requireTLS: config.security === "starttls",
		ignoreTLS: plain,
		auth: config.user || config.password ? { user: config.user ?? "", pass: config.password ?? "" } : undefined,
		tls: plain ? undefined : { rejectUnauthorized: true, minVersion: "TLSv1.2" as const, ...(ca ? { ca } : {}) },
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 20_000,
	};
}

/** Sends one message; returns the server's message id. */
export async function sendMail(config: SmtpConfig, message: OutgoingMessage, ca?: string | Buffer): Promise<string> {
	const transporter = nodemailer.createTransport(transportOptions(config, ca));
	try {
		const { to, cc, replyTo, subject, text, html } = message;
		const info = await transporter.sendMail({ from: config.from, to, cc, replyTo, subject, text, html });
		return info.messageId;
	} finally {
		transporter.close();
	}
}

/** Masks the SMTP user and password in a text before it is logged or shown. */
export function redact(text: string, config: SmtpConfig): string {
	return [config.password, config.user].reduce<string>((out, secret) => (secret ? out.split(secret).join("***") : out), text);
}
