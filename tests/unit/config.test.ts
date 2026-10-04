import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/core/config.ts";
import { CliError } from "../../src/core/errors.ts";

const dir = mkdtempSync(join(tmpdir(), "tubeline-config-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function withFile(content: unknown): NodeJS.ProcessEnv {
  const path = join(dir, `c${Math.random()}.json`);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return { TUBELINE_CONFIG: path, XDG_CACHE_HOME: join(dir, "cache") };
}

describe("loadConfig", () => {
  test("defaults", () => {
    const c = loadConfig({}, { TUBELINE_CONFIG: join(dir, "missing.json"), XDG_CACHE_HOME: "/x" });
    expect(c).toMatchObject({
      format: "json",
      region: "US",
      noCache: false,
      updateCheck: true,
      logLevel: "warn",
    });
    if (process.platform === "linux") expect(c.cacheDir).toBe("/x/tubeline");
  });

  test("precedence: flag > env > file", () => {
    const env = {
      ...withFile({ format: "csv", proxy: "http://file", region: "DE" }),
      TUBELINE_PROXY: "http://env",
    };
    expect(loadConfig({}, env)).toMatchObject({ format: "csv", proxy: "http://env", region: "DE" });
    expect(loadConfig({ format: "table", proxy: "http://flag", region: "in" }, env)).toMatchObject({
      format: "table",
      proxy: "http://flag",
      region: "IN",
    });
  });

  test("log level from flags and env", () => {
    const env = withFile({});
    expect(loadConfig({ verbose: true }, env).logLevel).toBe("debug");
    expect(loadConfig({ quiet: true }, env).logLevel).toBe("error");
    expect(loadConfig({}, { ...env, TUBELINE_LOG: "info" }).logLevel).toBe("info");
  });

  test("--no-cache and env booleans", () => {
    const env = withFile({});
    expect(loadConfig({ cache: false }, env).noCache).toBe(true);
    expect(loadConfig({}, { ...env, TUBELINE_NO_CACHE: "1" }).noCache).toBe(true);
    expect(loadConfig({}, { ...env, TUBELINE_NO_CACHE: "0" }).noCache).toBe(false);
    expect(loadConfig({}, { ...env, TUBELINE_NO_UPDATE_CHECK: "1" }).updateCheck).toBe(false);
  });

  test.each([
    ["invalid JSON", "{nope"],
    ["unknown key", { colour: "red" }],
    ["bad type", { noCache: "yes" }],
  ])("rejects config file with %s", (_, content) => {
    expect(() => loadConfig({}, withFile(content))).toThrow(CliError);
  });

  test("rejects bad flag values", () => {
    const env = withFile({});
    expect(() => loadConfig({ format: "xml" }, env)).toThrow(CliError);
    expect(() => loadConfig({ region: "USA" }, env)).toThrow(CliError);
    expect(() => loadConfig({}, { ...env, TUBELINE_LOG: "loud" })).toThrow(CliError);
  });
});
