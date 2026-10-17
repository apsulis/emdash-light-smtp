import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { startServer } from "./helpers.js";

// EmDash's definePlugin validates and normalises; the plugin logic under test is ours.
vi.mock("emdash", () => ({ definePlugin: (definition: unknown) => definition }));

const { createPlugin } = await import("../src/plugin.js");

type Plugin = ReturnType<typeof createPlugin> & Record<string, any>;
const ENV_KEYS = ["SMTP_URL", "SMTP_DISABLED", "NODE_ENV"];

function fakeCtx(user?: { email: string; role: number }, input?: unknown) {
	const logs: string[] = [];
	const store = new Map<string, unknown>();
	const record = (m: string) => logs.push(m);
	return {
		logs,
		ctx: {
			user,
			input,
			log: { info: record, warn: record, error: record, debug: record },
			kv: { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: unknown) => void store.set(k, v) },
		} as any,
	};
}

function withEnv(env: Record<string, string>) {
	for (const k of ENV_KEYS) delete process.env[k];
	Object.assign(process.env, env);
	delete (globalThis as any)[Symbol.for("emdash-simple-smtp:announced")];
	return createPlugin() as Plugin;
}

describe("plugin", () => {
	let server: Awaited<ReturnType<typeof startServer>>;
	const saved = { ...process.env };
	beforeAll(async () => (server = await startServer({ authOptional: true, allowInsecureAuth: true, disabledCommands: ["STARTTLS"], onAuth: (a, _s, cb) => cb(null, { user: a.username }) })));
	afterAll(() => server.close());
	afterEach(() => {
		for (const k of ENV_KEYS) delete process.env[k];
		Object.assign(process.env, saved);
		vi.restoreAllMocks();
	});

	it("off: no email:deliver hook is registered, and it is announced once", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const plugin = withEnv({});
		expect(plugin.hooks["email:deliver"]).toBeUndefined();
		createPlugin();
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toContain("coupé : SMTP_URL absent");
	});

	it("SMTP_DISABLED=1 removes the hook even with a full configuration", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const plugin = withEnv({ SMTP_URL: `smtp://localhost:${server.port}?from=a@example.test&tls=none`, SMTP_DISABLED: "1" });
		expect(plugin.hooks["email:deliver"]).toBeUndefined();
	});

	it("delivers through the hook; logs carry neither the body nor secrets", async () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		const plugin = withEnv({ SMTP_URL: `smtp://user-secret-id:pw-secret@localhost:${server.port}?from=noreply@example.test&name=Site&tls=none`, NODE_ENV: "test" });
		const hook = plugin.hooks["email:deliver"];
		expect(hook).toMatchObject({ exclusive: true, timeout: 30_000 });
		const { ctx, logs } = fakeCtx();
		const message = { to: "dev@example.test", subject: "Lien de connexion", text: "https://example.test/verify?token=TOP-SECRET" };
		await hook.handler({ message, source: "system" }, ctx);
		expect(server.received.at(-1)!.data).toContain("TOP-SECRET");
		const allLogs = [...logs, ...info.mock.calls.map((c) => String(c[0]))].join("\n");
		expect(allLogs).toContain("dev@example.test");
		expect(allLogs).not.toMatch(/TOP-SECRET|pw-secret|user-secret-id/);
	});

	it("a failed delivery is logged redacted and rethrown", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		const plugin = withEnv({ SMTP_URL: "smtp://user-secret-id:pw-secret@localhost:1?from=a@example.test&tls=none", NODE_ENV: "test" });
		const { ctx, logs } = fakeCtx();
		await expect(plugin.hooks["email:deliver"].handler({ message: { to: "x@example.test", subject: "S", text: "BODY" } }, ctx)).rejects.toThrow(/^SMTP : /);
		expect(logs.join("\n")).not.toMatch(/BODY|pw-secret|user-secret-id/);
	});

	it("widget: administrators only; the test email goes to the signed-in administrator", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		const plugin = withEnv({ SMTP_URL: `smtp://localhost:${server.port}?from=a@example.test&tls=none`, NODE_ENV: "test" });
		const route = plugin.routes.admin.handler;
		const editor = fakeCtx({ email: "editor@example.test", role: 40 }, { type: "block_action", action_id: "test" });
		const before = server.received.length;
		expect(JSON.stringify(await route(editor.ctx))).toContain("Réservé aux administrateurs");
		expect(server.received.length).toBe(before);

		const admin = fakeCtx({ email: "admin@example.test", role: 50 }, { type: "block_action", action_id: "test" });
		const result = await route(admin.ctx);
		expect(result.toast.type).toBe("success");
		expect(server.received.at(-1)!.to).toEqual(["admin@example.test"]);
		expect(JSON.stringify(await route({ ...admin.ctx, input: {} }))).toContain("Dernier test");
	});

	it("widget when off: state and reason, no test button", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const plugin = withEnv({ SMTP_DISABLED: "1" });
		const out = JSON.stringify(await plugin.routes.admin.handler(fakeCtx({ email: "admin@example.test", role: 50 }, {}).ctx));
		expect(out).toContain("coupé : SMTP_DISABLED=1");
		expect(out).not.toContain("Envoyer un e-mail de test");
	});
});
