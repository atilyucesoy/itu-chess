import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "itu-chess-e2e-"));
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    ENABLE_DEVELOPER_MODE: "1",
    DB_PATH: join(dir, "test.sqlite"),
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SESSION_SECRET: "isolated-browser-test-secret-32-characters",
    ADMIN_USERNAME: "testowner",
    ADMIN_NAME: "Test Yöneticisi",
    ADMIN_PASSWORD: "test-password-12345",
    APP_ORIGIN: "http://127.0.0.1:3099",
    PORT: "3099",
  },
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", async (code) => {
  await rm(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
