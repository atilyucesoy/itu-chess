import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) {
  console.log(".env already exists; left untouched.");
  process.exit(0);
}
const password = randomBytes(15).toString("base64url");
writeFileSync(
  ".env",
  `ADMIN_USERNAME=atil\nADMIN_NAME=Atıl\nADMIN_PASSWORD=${password}\nSESSION_SECRET=${randomBytes(32).toString("hex")}\n`,
  { mode: 0o600 },
);
console.log(
  `Local setup complete. Username: atil\nInitial password: ${password}\nSaved privately in .env. Change it from Kulüp ayarları after signing in.`,
);
