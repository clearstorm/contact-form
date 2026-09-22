/**
 * Zero-dependency echo server for the "json" mailer demo.
 *
 * Every form that uses `mailer: "json"` posts its canonical payload here
 * (multipart/form-data). This server just prints the raw body to the terminal
 * so you can inspect exactly what the mailer sends, then answers with the
 * JSON the client treats as success: `{ "ok": true, "message": "…" }`.
 *
 * Run:  npm run demo:api   (from examples/astro-demo, or PORT=9000 to change)
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8787);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const server = createServer((req, res) => {
  // CORS preflight (not required for simple form posts, but harmless).
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...CORS, "Access-Control-Allow-Methods": "POST, OPTIONS" });
    res.end();
    return;
  }

  let size = 0;
  const chunks = [];
  req.on("data", (chunk) => {
    size += chunk.length;
    chunks.push(chunk);
  });
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    console.log(`\n[echo] ${req.method} ${req.url}  (${size} bytes)`);
    console.log(body ? `${body}\n` : "(empty body)\n");

    res.writeHead(200, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify({ ok: true, message: "Payload received by the demo echo server." }));
  });
});

server.listen(PORT, () => {
  console.log(`Echo server listening on http://localhost:${PORT}/submit`);
  console.log("Submit any json-mailer form to see its canonical payload here.\n");
});