import { mkdir, writeFile, copyFile, chmod } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { downloadVerified } from "./download.mjs";

export async function buildEngine() {
  const commit = "16a000f9811de322b0e835d5643198226165b5a9";
  const sha256 =
    "257fea40994e0ee8a8d95ebdb11e6ecb249d84ebc463e4764b412241d8881a4f";
  const sourceDir = resolve("bin/bbpPairings-source-v6.0.0");
  const outputDir = resolve("bin/bbpPairings-v6.0.0");
  const buffer = await downloadVerified(
    `https://codeload.github.com/BieremaBoyzProgramming/bbpPairings/tar.gz/${commit}`,
    sha256,
  );
  await mkdir(sourceDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await writeFile("bin/bbp-source.tar.gz", buffer);
  execFileSync("tar", [
    "xzf",
    resolve("bin/bbp-source.tar.gz"),
    "--strip-components=1",
    "-C",
    sourceDir,
  ]);
  console.log(
    `Compiling verified bbpPairings v6.0.0 source (${commit}) for this host.`,
  );
  // Keep upstream defaults and both engines. Override warning-only build flags
  // (not algorithm code) so newer host compilers don't fail on upstream -Werror.
  // Force a fresh serial build: objects from another host must not be reused.
  execFileSync(
    "make",
    [
      "-B",
      "-j1",
      "CXXFLAGS=-std=c++20 -O2 -DNDEBUG -DVERSION_INFO=v6.0.0",
      "bbpPairings.exe",
    ],
    { cwd: sourceDir, stdio: "inherit", timeout: 300_000 },
  );
  for (const name of [
    "bbpPairings.exe",
    "LICENSE.txt",
    "Apache-2.0.txt",
    "README.txt",
  ])
    await copyFile(resolve(sourceDir, name), resolve(outputDir, name));
  await chmod(resolve(outputDir, "bbpPairings.exe"), 0o755);
  await writeFile(
    resolve(outputDir, "build-info.json"),
    JSON.stringify(
      { version: "6.0.0", method: "source", commit, sourceSha256: sha256 },
      null,
      2,
    ),
  );
}
