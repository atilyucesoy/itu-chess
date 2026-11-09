import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
const production = process.argv.includes("--production");
const dir = await mkdtemp(join(tmpdir(), "itu-chess-e2e-"));
let proxy: ReturnType<typeof createHttpsServer> | undefined;
if (production) {
  const key = join(dir, "test.key"),
    cert = join(dir, "test.crt");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  // Real production middleware/cookies behind a TLS-terminating proxy, using
  // only a newly generated test certificate and an isolated temporary database.
  proxy = createHttpsServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (req, res) => {
      const upstream = httpRequest(
        {
          hostname: "127.0.0.1",
          port: 3101,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, "x-forwarded-proto": "https" },
        },
        (reply) => {
          res.writeHead(reply.statusCode ?? 502, reply.headers);
          reply.pipe(res);
        },
      );
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(503);
        res.end();
      });
      req.pipe(upstream);
    },
  );
  proxy.listen(3100, "127.0.0.1");
}
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: production ? "production" : "test",
    ENABLE_DEVELOPER_MODE: "1",
    ENABLE_ONLINE_SANDBOX: "1",
    ALLOW_LOCAL_DB: "1",
    HOST: "127.0.0.1",
    DB_PATH: join(dir, "test.sqlite"),
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SESSION_SECRET: "isolated-browser-test-secret-32-characters",
    ADMIN_USERNAME: "testowner",
    ADMIN_NAME: "Test Yöneticisi",
    ADMIN_PASSWORD: "test-password-12345",
    APP_ORIGIN: production ? "https://127.0.0.1:3100" : "http://127.0.0.1:3099",
    PORT: production ? "3101" : "3099",
  },
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  proxy?.close();
  child.kill("SIGTERM");
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", async (code) => {
  proxy?.close();
  await rm(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
