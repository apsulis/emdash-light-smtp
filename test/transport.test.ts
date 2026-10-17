import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SmtpConfig } from "../src/config.js";
import { redact, sendMail, transportOptions } from "../src/transport.js";
import { selfSignedCert, startServer } from "./helpers.js";

const config = (over: Partial<SmtpConfig>): SmtpConfig => ({ host: "localhost", port: 25, security: "starttls", from: "Site <noreply@example.test>", ...over });
const message = { to: "someone@example.test", subject: "Hello", text: "Body with a secret link https://example.test/verify?token=abc" };

describe("transportOptions", () => {
	it("mandatory, verified TLS 1.2+ for tls and starttls", () => {
		const tls = transportOptions(config({ security: "tls", port: 465 }));
		expect(tls).toMatchObject({ secure: true, requireTLS: false, ignoreTLS: false, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" } });
		const starttls = transportOptions(config({ security: "starttls" }));
		expect(starttls).toMatchObject({ secure: false, requireTLS: true, ignoreTLS: false, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" } });
	});

	it("plain text only when explicitly none", () => {
		expect(transportOptions(config({ security: "none" }))).toMatchObject({ secure: false, requireTLS: false, ignoreTLS: true, tls: undefined });
	});
});

describe("redact", () => {
	it("masks user and password", () => {
		const c = config({ user: "api-key-123", password: "s3cr3t-pass" });
		expect(redact("535 auth failed for api-key-123 with s3cr3t-pass", c)).toBe("535 auth failed for *** with ***");
	});
});

describe("sendMail against a local SMTP server", () => {
	const { key, cert } = selfSignedCert();
	let starttls: Awaited<ReturnType<typeof startServer>>;
	let implicit: Awaited<ReturnType<typeof startServer>>;
	let noStarttls: Awaited<ReturnType<typeof startServer>>;
	const auth = { onAuth: (a: { username?: string; password?: string }, _s: unknown, cb: (e: Error | null, r?: { user: string }) => void) => (a.username === "user" && a.password === "good-pass" ? cb(null, { user: "user" }) : cb(new Error("Invalid credentials"))) };

	beforeAll(async () => {
		starttls = await startServer({ key, cert, ...auth });
		implicit = await startServer({ key, cert, secure: true, ...auth });
		noStarttls = await startServer({ hideSTARTTLS: true, authOptional: true });
	});
	afterAll(async () => Promise.all([starttls.close(), implicit.close(), noStarttls.close()]));

	it("delivers over STARTTLS with authentication and the configured sender", async () => {
		const id = await sendMail(config({ port: starttls.port, user: "user", password: "good-pass" }), message, cert);
		expect(id).toBeTruthy();
		const got = starttls.received.at(-1)!;
		expect(got).toMatchObject({ from: "noreply@example.test", to: ["someone@example.test"], user: "user" });
		expect(got.data).toContain("Subject: Hello");
	});

	it("delivers over implicit TLS", async () => {
		await sendMail(config({ security: "tls", port: implicit.port, user: "user", password: "good-pass" }), message, cert);
		expect(implicit.received).toHaveLength(1);
	});

	it("refuses an untrusted certificate (verification cannot be skipped)", async () => {
		await expect(sendMail(config({ port: starttls.port, user: "user", password: "good-pass" }), message)).rejects.toThrow(/certificate/i);
	});

	it("refuses to continue in clear when the server does not offer STARTTLS", async () => {
		await expect(sendMail(config({ port: noStarttls.port }), message, cert)).rejects.toThrow();
		expect(noStarttls.received).toHaveLength(0);
	});

	it("bad credentials: the error can be redacted", async () => {
		const c = config({ port: starttls.port, user: "user", password: "wrong-pass" });
		const error = await sendMail(c, message, cert).catch((e: Error) => e);
		expect(error).toBeInstanceOf(Error);
		expect(redact((error as Error).message, c)).not.toContain("wrong-pass");
	});
});
