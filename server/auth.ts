import {
  scryptSync,
  randomBytes,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import type { Manager } from "../shared/types.js";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(":");
  const actual = scryptSync(password, salt, 64);
  return (
    actual.length === Buffer.from(expected, "hex").length &&
    timingSafeEqual(actual, Buffer.from(expected, "hex"))
  );
}
const fingerprint = (m: Manager) =>
  createHmac("sha256", m.passwordHash).update(m.id).digest("hex").slice(0, 20);
export function tokenFor(manager: Manager, secret: string) {
  const data = Buffer.from(
    JSON.stringify({
      id: manager.id,
      expires: Date.now() + 12 * 60 * 60 * 1000,
      fp: fingerprint(manager),
    }),
  ).toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}
export function authenticate(
  cookie: string | undefined,
  managers: Manager[],
  secret: string,
) {
  try {
    const token = cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("itu_session="))
      ?.slice(12);
    if (!token) return null;
    const [data, sig] = token.split(".");
    const expected = createHmac("sha256", secret).update(data).digest();
    const supplied = Buffer.from(sig, "base64url");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return null;
    const session = JSON.parse(Buffer.from(data, "base64url").toString());
    const manager = managers.find((m) => m.id === session.id);
    return manager &&
      session.expires > Date.now() &&
      fingerprint(manager) === session.fp
      ? manager
      : null;
  } catch {
    return null;
  }
}
