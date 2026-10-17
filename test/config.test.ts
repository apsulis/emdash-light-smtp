import { describe, expect, it } from "vitest";

import { readConfig } from "../src/config.js";

const base = { SMTP_HOST: "smtp.example.test", SMTP_FROM: "Site <noreply@example.test>" };

describe("readConfig", () => {
	it("is off without SMTP_HOST (empty .env of a fresh clone)", () => {
		expect(readConfig({})).toEqual({ enabled: false, reason: "SMTP_HOST absent" });
	});

	it("SMTP_DISABLED=1 wins over a complete configuration", () => {
		expect(readConfig({ ...base, SMTP_USER: "u", SMTP_PASSWORD: "p", SMTP_DISABLED: "1" })).toEqual({ enabled: false, reason: "SMTP_DISABLED=1" });
	});

	it("defaults to STARTTLS on 587, implicit TLS on 465", () => {
		expect(readConfig(base)).toMatchObject({ enabled: true, config: { port: 587, security: "starttls" } });
		expect(readConfig({ ...base, SMTP_PORT: "465" })).toMatchObject({ enabled: true, config: { port: 465, security: "tls" } });
		expect(readConfig({ ...base, SMTP_SECURE: "tls" })).toMatchObject({ enabled: true, config: { port: 465 } });
	});

	it("refuses plain text in production, accepts it elsewhere", () => {
		expect(readConfig({ ...base, SMTP_SECURE: "none", NODE_ENV: "production" })).toEqual({ enabled: false, reason: "SMTP_SECURE=none refusé en production" });
		expect(readConfig({ ...base, SMTP_SECURE: "none", SMTP_PORT: "1025", NODE_ENV: "development" })).toMatchObject({ enabled: true, config: { security: "none", port: 1025 } });
	});

	it("is off on invalid settings instead of guessing", () => {
		expect(readConfig({ ...base, SMTP_SECURE: "ssl" })).toMatchObject({ enabled: false });
		expect(readConfig({ ...base, SMTP_PORT: "abc" })).toMatchObject({ enabled: false });
		expect(readConfig({ SMTP_HOST: "smtp.example.test" })).toEqual({ enabled: false, reason: "SMTP_FROM absent ou invalide" });
	});
});
