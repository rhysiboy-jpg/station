// ADR 0001: the simulation core has no rendering or browser dependencies.
// tsconfig.sim.json rejects browser globals; this test rejects package imports
// (PixiJS, Three.js, anything else), so the core only ever imports itself.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const simDir = import.meta.dirname;

function coreSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return coreSourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

function importsOf(source: string): string[] {
  const pattern = /(?:import|export)\s[^"']*?from\s*["']([^"']+)["']|import\s*\(?\s*["']([^"']+)["']/g;
  return [...source.matchAll(pattern)].map((m) => m[1] ?? m[2] ?? "");
}

describe("the simulation core", () => {
  it("imports nothing outside itself", () => {
    const outside = coreSourceFiles(simDir).flatMap((file) =>
      importsOf(readFileSync(file, "utf8"))
        .filter((specifier) => !specifier.startsWith("./"))
        .map((specifier) => `${file}: ${specifier}`),
    );

    expect(outside).toEqual([]);
  });
});
