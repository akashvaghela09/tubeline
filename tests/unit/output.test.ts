import { describe, expect, test } from "bun:test";
import { CliError } from "../../src/core/errors.ts";
import { flatten, parseFields, project, render } from "../../src/core/output.ts";

const video = {
  id: "abc",
  title: 'Hello, "world"',
  viewCount: 10,
  channel: { id: "UC1", name: "Chan" },
  thumbnails: [
    { url: "u1", width: 1 },
    { url: "u2", width: 2 },
  ],
};

describe("project", () => {
  test("top-level and nested paths", () => {
    expect(project(video, ["id", "channel.name"])).toEqual({
      id: "abc",
      channel: { name: "Chan" },
    });
  });

  test("paths through arrays apply to each element", () => {
    expect(project(video, ["thumbnails.url"])).toEqual({
      thumbnails: [{ url: "u1" }, { url: "u2" }],
    });
  });

  test("merges sibling paths under the same parent", () => {
    expect(project(video, ["channel.id", "channel.name"])).toEqual({
      channel: { id: "UC1", name: "Chan" },
    });
    expect(project(video, ["thumbnails.url", "thumbnails.width"])).toEqual({
      thumbnails: video.thumbnails,
    });
  });

  test("unknown fields are dropped", () => {
    expect(project(video, ["nope", "id"])).toEqual({ id: "abc" });
  });
});

test("parseFields", () => {
  expect(parseFields(undefined)).toBeUndefined();
  expect(parseFields(" id, title ,")).toEqual(["id", "title"]);
  expect(() => parseFields(" , ")).toThrow(CliError);
});

describe("render", () => {
  test("json: single ref → object, many → array", () => {
    expect(render([video], { format: "json", single: true })).toBe(`${JSON.stringify(video)}\n`);
    expect(render([video], { format: "json", single: false })).toBe(`${JSON.stringify([video])}\n`);
    expect(render([], { format: "json", single: false })).toBe("[]\n");
  });

  test("json pretty", () => {
    expect(render([{ a: 1 }], { format: "json", single: true, pretty: true })).toBe(
      '{\n  "a": 1\n}\n',
    );
  });

  test("ndjson: one line per item", () => {
    expect(render([{ a: 1 }, { a: 2 }], { format: "ndjson", single: false })).toBe(
      '{"a":1}\n{"a":2}\n',
    );
  });

  test("csv: flattened columns, RFC 4180 quoting", () => {
    const out = render([video], {
      format: "csv",
      single: true,
      fields: ["id", "title", "channel.name"],
    });
    expect(out).toBe('id,title,channel.name\nabc,"Hello, ""world""",Chan\n');
  });

  test("table: key/value for one record, columns for many", () => {
    expect(render([{ id: "a", n: 1 }], { format: "table", single: true })).toBe("id  a\nn   1\n");
    expect(render([{ id: "a" }, { id: "bb" }], { format: "table", single: false })).toBe(
      "id\n--\na\nbb\n",
    );
    expect(render([], { format: "table", single: false })).toBe("");
  });
});

test("flatten serializes arrays as JSON", () => {
  expect(flatten({ a: { b: 1 }, c: [1, 2], d: null })).toEqual({ "a.b": "1", c: "[1,2]", d: "" });
});
