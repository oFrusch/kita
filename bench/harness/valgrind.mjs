import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Locate a usable valgrind. Prefers a system install on PATH; falls back to the
 * rootless prefix under bench/.valgrind/ created by bootstrap-valgrind.sh.
 * @returns { bin, env } — env carries VALGRIND_LIB when using the local prefix.
 */
export function findValgrind() {
  // 1. system valgrind
  try {
    execFileSync("valgrind", ["--version"], { stdio: "ignore" });
    return { bin: "valgrind", env: {} };
  } catch {
    // not on PATH — try the local rootless prefix
  }

  // 2. rootless prefix (bench/.valgrind, populated by bootstrap-valgrind.sh)
  const prefix = fileURLToPath(new URL("../.valgrind/", import.meta.url));
  const bin = `${prefix}usr/bin/valgrind`;
  if (existsSync(bin)) {
    // Debian/Ubuntu ship the tool libdir at usr/libexec/valgrind (valgrind >=3.19)
    // or usr/lib/valgrind (older). Pick whichever exists.
    const libexec = `${prefix}usr/libexec/valgrind`;
    const lib = `${prefix}usr/lib/valgrind`;
    return { bin, env: { VALGRIND_LIB: existsSync(libexec) ? libexec : lib } };
  }

  throw new Error(
    "valgrind not found. Install it (sudo apt-get install -y valgrind) or, on a " +
      "machine without sudo, run: bash bench/harness/bootstrap-valgrind.sh",
  );
}
