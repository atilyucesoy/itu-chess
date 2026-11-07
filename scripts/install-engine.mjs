import { mkdir, writeFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const version = "v6.0.0";
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error(
    "Automatic engine installation requires Linux x64. Set BBP_PATH for other systems.",
  );
const response = await fetch(
  `https://github.com/BieremaBoyzProgramming/bbpPairings/releases/download/${version}/bbpPairings-${version}-x86_64-pc-linux.tar.gz`,
);
if (!response.ok) throw new Error(`Engine download failed: ${response.status}`);
const buffer = Buffer.from(await response.arrayBuffer());
if (
  createHash("sha256").update(buffer).digest("hex") !==
  "bffd2d5a4dc9d86eb3d9886339e8ca446d88683f77559f0889ea0d2040e7d827"
)
  throw new Error("Engine checksum mismatch");
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
console.log(
  `Installed verified bbpPairings ${version}. License files retained in bin/.`,
);
