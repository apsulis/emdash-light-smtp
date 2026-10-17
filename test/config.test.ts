import { describe, expect, it } from "vitest";

import { readConfig } from "../src/config.js";

const url = (value: string, extra: Record<string, string> = {}) => readConfig({ SMTP_URL: value, ...extra });

describe("readConfig (SMTP_URL)", () => {
	it("is off without SMTP_URL (empty .env of a fresh clone)", () => {
		expect(readConfig({})).toEqual({ enabled: false, reason: "SMTP_URL not set" });
	});

	it("SMTP_DISABLED=1 wins over a complete configuration", () => {
		expect(url("smtps://u%40example.test:p@smtp.example.test", { SMTP_DISABLED: "1" })).toEqual({ enabled: false, reason: "SMTP_DISABLED=1" });
	});

	it("smtps: is implicit TLS on 465, smtp: is required STARTTLS on 587, explicit ports kept", () => {
		expect(url("smtps://smtp.example.test?from=a@example.test")).toMatchObject({ enabled: true, config: { port: 465, security: "tls" } });
		expect(url("smtp://smtp.example.test?from=a@example.test")).toMatchObject({ enabled: true, config: { port: 587, security: "starttls" } });
		expect(url("smtp://smtp.example.test:2525?from=a@example.test")).toMatchObject({ enabled: true, config: { port: 2525, security: "starttls" } });
	});

	it("decodes percent-encoded credentials; sender defaults to the user when it is an address", () => {
		const state = url("smtps://bark%40example.test:p%40ss%3Aw%2Fo%23rd@ssl0.example.test");
		expect(state).toMatchObject({ enabled: true, config: { user: "bark@example.test", password: "p@ss:w/o#rd", from: "bark@example.test" } });
	});

	it("from and name build a quoted sender, accents and commas included", () => {
		const state = url("smtp://key:secret@in-v3.example.test:587?from=noreply@example.test&name=Teréga, recette");
		expect(state).toMatchObject({ enabled: true, config: { user: "key", from: '"Teréga, recette" <noreply@example.test>' } });
	});

	it("refuses plain text in production, accepts it elsewhere", () => {
		expect(url("smtp://localhost:1025?from=a@example.test&tls=none", { NODE_ENV: "production" })).toEqual({ enabled: false, reason: "SMTP_URL: tls=none refused in production" });
		expect(url("smtp://localhost:1025?from=a@example.test&tls=none", { NODE_ENV: "development" })).toMatchObject({ enabled: true, config: { security: "none", port: 1025 } });
	});

	it("is off on invalid settings instead of guessing", () => {
		expect(url("not a url")).toEqual({ enabled: false, reason: "SMTP_URL is not a valid URL" });
		expect(url("https://smtp.example.test?from=a@example.test")).toMatchObject({ enabled: false });
		expect(url("smtp://smtp.example.test?from=a@example.test&tls=off")).toMatchObject({ enabled: false });
		expect(url("smtp://key:secret@smtp.example.test")).toEqual({ enabled: false, reason: "SMTP_URL: missing or invalid sender (from=address)" });
	});
});
