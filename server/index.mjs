import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, extname, sep } from "node:path";
import { AuditionEngine } from "./engine.mjs";
import { MAX_BODY } from "./validation.mjs";
import { fixture } from "./fixtures.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
async function body(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Request too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    throw new Error("Invalid JSON request.");
  }
}
export async function startServer(port = 4321) {
  const engine = new AuditionEngine(port);
  const server = http.createServer(async (req, res) => {
    const host = req.headers.host;
    const permittedHosts = new Set([
      `127.0.0.1:${engine.port}`,
      `localhost:${engine.port}`,
    ]);
    if (!permittedHosts.has(host)) {
      res.writeHead(403);
      res.end("Invalid host");
      return;
    }
    const base = `http://${host}`;
    let url;
    try {
      url = new URL(req.url, base);
    } catch {
      res.writeHead(400);
      res.end("Invalid request URL");
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    const json = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (url.pathname.startsWith("/api/")) {
        if (req.headers.origin && req.headers.origin !== base) {
          json(403, { error: "Cross-origin control is not allowed." });
          return;
        }
        if (req.headers["x-audition"] !== "1") {
          json(403, { error: "Missing control header." });
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/session") {
          json(200, await engine.exclusive(() => engine.snapshot()));
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/report") {
          json(200, await engine.exclusive(() => engine.report()));
          return;
        }
        if (req.method !== "POST") {
          json(405, { error: "Method not allowed." });
          return;
        }
        const data = await body(req);
        if (url.pathname === "/api/connect") {
          json(200, await engine.connect(data.targets, data.mappings || []));
          return;
        }
        if (url.pathname === "/api/mappings") {
          json(200, await engine.setMappings(data.mappings));
          return;
        }
        if (url.pathname === "/api/action") {
          json(200, await engine.act(data));
          return;
        }
        if (url.pathname === "/api/hit-test") {
          json(200, await engine.exclusive(() => engine.hitTest(data)));
          return;
        }
        if (url.pathname === "/api/viewport") {
          json(200, await engine.resize(data.viewport));
          return;
        }
        if (url.pathname === "/api/reset") {
          json(200, await engine.reset());
          return;
        }
        if (url.pathname === "/api/disconnect") {
          json(
            200,
            await engine.exclusive(async () => {
              await engine.closeLanes();
              return engine.snapshot();
            }),
          );
          return;
        }
        json(404, { error: "Unknown endpoint." });
        return;
      }
      if (req.method !== "GET") {
        res.writeHead(405);
        res.end();
        return;
      }
      const match = url.pathname.match(/^\/fixtures\/([abc])$/);
      if (match) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fixture(match[1]));
        return;
      }
      const path = resolve(
        join(root, "dist"),
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
      if (!path.startsWith(join(root, "dist") + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const content = await readFile(path);
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
      );
      res.writeHead(200, {
        "Content-Type": mime[extname(path)] || "application/octet-stream",
      });
      res.end(content);
    } catch (error) {
      if (!res.headersSent)
        json(error.code === "ENOENT" ? 404 : error.status || 400, {
          error:
            error.code === "ENOENT"
              ? "Run npm run build before starting Audition."
              : error.message,
        });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  engine.port = server.address().port;
  return {
    server,
    engine,
    port: engine.port,
    close: async () => {
      await engine.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 4321);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("PORT must be an integer from 1024 to 65535.");
  const app = await startServer(port);
  console.log(`Audition is ready at http://127.0.0.1:${app.port}`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      app.close().finally(() => process.exit());
    });
}
