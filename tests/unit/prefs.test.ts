import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { expandHome, safeName } from "../../src/ui/prefs.ts";

test("safeName strips path separators and control characters", () => {
  expect(safeName('a/b\\c:d*e?"f<g>h|i')).toBe("a_b_c_d_e__f_g_h_i");
  expect(safeName("  many   spaces \n here ")).toBe("many spaces here");
  expect(safeName("")).toBe("untitled");
  expect(safeName("x".repeat(300)).length).toBe(150);
});

test("expandHome", () => {
  expect(expandHome("~/Downloads")).toBe(join(homedir(), "Downloads"));
  expect(expandHome("/abs")).toBe("/abs");
});
