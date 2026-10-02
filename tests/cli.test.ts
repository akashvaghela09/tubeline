import { expect, test } from "bun:test";
import pkg from "../package.json";

test("--version prints the package version", async () => {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", "--version"], { stdout: "pipe" });
  expect(await proc.exited).toBe(0);
  expect((await new Response(proc.stdout).text()).trim()).toBe(pkg.version);
});
