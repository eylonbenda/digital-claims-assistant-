// A local stand-in for the mail provider, so a recording can show the app sending a claim
// to an insurer without any mail leaving this machine. It accepts what the app posts,
// keeps nothing but a count, and answers the way the provider does.
//
//   npm run mail-sink          (listens on 127.0.0.1:47187)
//
// The app must be started with RESEND_BASE_URL pointing here — see the README.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export const MAIL_SINK_PORT = Number(process.env.MAIL_SINK_PORT ?? 47187);
export const MAIL_SINK_URL = `http://127.0.0.1:${MAIL_SINK_PORT}`;

export function startMailSink(port = MAIL_SINK_PORT): Promise<http.Server> {
  let count = 0;
  const server = http.createServer((req, res) => {
    const json = (status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.method === "GET" && req.url === "/count") return json(200, { count });
    if (req.method === "POST" && req.url === "/emails") {
      let to = "";
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        try { to = String((JSON.parse(Buffer.concat(chunks).toString("utf8")) as { to?: unknown }).to ?? ""); } catch { /* counted anyway */ }
        count++;
        console.log(`mail sink: message ${count} to ${to} (kept nowhere, sent nowhere)`);
        json(200, { id: randomUUID() });
      });
      return;
    }
    json(404, { message: "the mail sink only accepts POST /emails" });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/** How many messages the sink has taken; null when it is not running. */
export async function sinkCount(url = MAIL_SINK_URL): Promise<number | null> {
  try {
    const res = await fetch(`${url}/count`);
    return res.ok ? Number(((await res.json()) as { count: number }).count) : null;
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startMailSink().then(
    () => console.log(`mail sink listening on ${MAIL_SINK_URL}`),
    (e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); },
  );
}
