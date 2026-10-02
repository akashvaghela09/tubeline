import { expect, test } from "bun:test";
import { CliError } from "../../src/core/errors.ts";
import { createFetch } from "../../src/core/http.ts";

const noSleep = async () => {};

function scripted(responses: (number | Error)[]) {
  const calls: string[] = [];
  const fn = async (input: Parameters<typeof fetch>[0]) => {
    const req = input as Request;
    calls.push(req instanceof Request ? await req.text() : String(input));
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return new Response("body", { status: next ?? 200 });
  };
  return { fn, calls };
}

test("retries 5xx then succeeds, re-sending the request body", async () => {
  const { fn, calls } = scripted([503, 502, 200]);
  const f = createFetch({ fetch: fn, sleep: noSleep });
  const res = await f(new Request("https://x.test/", { method: "POST", body: "payload" }));
  expect(res.status).toBe(200);
  expect(calls).toEqual(["payload", "payload", "payload"]);
});

test("persistent 429 → RATE_LIMITED", async () => {
  const { fn } = scripted([429, 429, 429, 429]);
  const f = createFetch({ fetch: fn, sleep: noSleep });
  const err = await f("https://x.test/").catch((e) => e);
  expect(err).toBeInstanceOf(CliError);
  expect((err as CliError).code).toBe("RATE_LIMITED");
});

test("network failures → NETWORK after retries", async () => {
  const { fn, calls } = scripted([
    new Error("ECONNRESET"),
    new Error("ECONNRESET"),
    new Error("ECONNRESET"),
  ]);
  const f = createFetch({ fetch: fn, sleep: noSleep, retries: 2 });
  const err = await f("https://x.test/").catch((e) => e);
  expect((err as CliError).code).toBe("NETWORK");
  expect(calls.length).toBe(3);
});

test("non-retryable status is returned as-is", async () => {
  const { fn, calls } = scripted([404]);
  const f = createFetch({ fetch: fn, sleep: noSleep });
  expect((await f("https://x.test/")).status).toBe(404);
  expect(calls.length).toBe(1);
});
