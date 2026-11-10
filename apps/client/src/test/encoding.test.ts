import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");
/** UTF-8 read as Windows-1252 and saved again: "Ã³" for "ó", "â€”" for "—", "âœ“" for "✓". */
const MOJIBAKE = /Ã[\u0080-¿]|â€|âœ|Â[·°ºª]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

describe("source encoding", () => {
  it("keeps every client source file in clean UTF-8, without BOM or double-encoded text", () => {
    const damaged = sourceFiles(SRC).filter((file) => {
      if (file.endsWith("encoding.test.ts")) return false;
      const text = readFileSync(file, "utf8");
      return text.startsWith("﻿") || MOJIBAKE.test(text);
    });
    expect(damaged).toEqual([]);
  });
});
