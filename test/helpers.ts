import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SMTPServer, type SMTPServerOptions } from "smtp-server";

/** Throw-away certificate authority + certificate for "localhost" (tests only). */
export function selfSignedCert(): { key: Buffer; cert: Buffer } {
	const dir = mkdtempSync(join(tmpdir(), "simple-smtp-"));
	try {
		execFileSync("openssl", [
			"req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
			"-addext", "subjectAltName=DNS:localhost", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
		], { stdio: "ignore" });
		return { key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export interface Received {
	from?: string;
	to: string[];
	data: string;
	user?: string;
}

/** Local SMTP server that records what it receives. */
export async function startServer(options: SMTPServerOptions) {
	const received: Received[] = [];
	const server = new SMTPServer({
		logger: false,
		disabledCommands: [],
		...options,
		onData(stream, session, callback) {
			let data = "";
			stream.on("data", (chunk) => (data += chunk));
			stream.on("end", () => {
				received.push({
					from: session.envelope.mailFrom ? session.envelope.mailFrom.address : undefined,
					to: session.envelope.rcptTo.map((r) => r.address),
					data,
					user: typeof session.user === "string" ? session.user : undefined,
				});
				callback();
			});
		},
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = (server.server.address() as AddressInfo).port;
	return { port, received, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
