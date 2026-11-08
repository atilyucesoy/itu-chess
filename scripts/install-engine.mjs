import { mkdir, writeFile, chmod } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { downloadVerified } from "./download.mjs";
import { buildEngine } from "./build-engine.mjs";
const version = "v6.0.0";
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error(
    "Automatic engine installation requires Linux x64. Set BBP_PATH for other systems.",
  );
const sha256 =
  "bffd2d5a4dc9d86eb3d9886339e8ca446d88683f77559f0889ea0d2040e7d827";
const binary = `bin/bbpPairings-${version}/bbpPairings.exe`;
const fromSource =
  process.argv.includes("--source") ||
  process.env.BBP_BUILD_FROM_SOURCE === "1";
if (fromSource) {
  await buildEngine();
  console.log(execFileSync(binary, [], { encoding: "utf8", timeout: 5000 }));
  process.exit(0);
}
let buffer;
try {
  // Immutable release asset ID for v6.0.0 Linux x64. The API avoids transient
  // failures of github.com's browser-facing release download endpoint.
  buffer = await downloadVerified(
    "https://api.github.com/repos/BieremaBoyzProgramming/bbpPairings/releases/assets/349245793",
    sha256,
  );
} catch (error) {
  if (error instanceof Error && error.message === "Engine checksum mismatch")
    throw error;
  console.warn("GitHub asset API unavailable; trying the pinned release URL.");
  buffer = await downloadVerified(
    `https://github.com/BieremaBoyzProgramming/bbpPairings/releases/download/${version}/bbpPairings-${version}-x86_64-pc-linux.tar.gz`,
    sha256,
  );
}
await mkdir("bin", { recursive: true });
await writeFile("bin/engine.tar.gz", buffer);
execFileSync("tar", ["xzf", "engine.tar.gz"], { cwd: "bin" });
console.log(
  execFileSync("find", ["bin", "-maxdepth", "3", "-type", "f"], {
    encoding: "utf8",
  }),
);
// The release archive contains bbpPairings.exe even on Linux.
await chmod(`bin/bbpPairings-${version}/bbpPairings.exe`, 0o755);
try {
  console.log(
    execFileSync(binary, [], {
      encoding: "utf8",
      timeout: 5000,
      stdio: "pipe",
    }),
  );
} catch (error) {
  const detail = String(error.stderr ?? error.message);
  if (!/GLIBC|GLIBCXX|CXXABI|ld-linux/.test(detail)) throw error;
  console.warn(
    "The official binary is incompatible with this host's runtime; building the same pinned release from source.",
  );
  await buildEngine();
  console.log(execFileSync(binary, [], { encoding: "utf8", timeout: 5000 }));
}
console.log(
  `Installed verified bbpPairings ${version}. License files retained in bin/.`,
);
