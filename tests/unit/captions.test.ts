import { expect, test } from "bun:test";
import { parseJson3, parseSrv3, toSrt, toTxt, toVtt } from "../../src/core/captions.ts";

const SRV3 = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3"><body>
<p t="1360" d="1680">[&#9834;&#9834;&#9834;]</p>
<p t="18640" d="3240">We&#39;re no strangers
to love</p>
<w t="0" id="1"/>
<p t="20000" d="5600" w="1"><s>Often</s><s t="440"> I</s><s t="640"> think &amp; </s></p>
<p t="21000" d="10" w="1" a="1">
</p>
</body></timedtext>`;

test("parseSrv3: entities, line joins, word spans, empty cues dropped", () => {
  expect(parseSrv3(SRV3)).toEqual([
    { start: 1.36, duration: 1.68, text: "[♪♪♪]" },
    { start: 18.64, duration: 3.24, text: "We're no strangers to love" },
    { start: 20, duration: 5.6, text: "Often I think &" },
  ]);
});

test("parseJson3", () => {
  const json = JSON.stringify({
    events: [
      { tStartMs: 0, dDurationMs: 1000 },
      { tStartMs: 500, dDurationMs: 2000, segs: [{ utf8: "Hello" }, { utf8: " world" }] },
      { tStartMs: 2600, dDurationMs: 100, segs: [{ utf8: "\n" }] },
    ],
  });
  expect(parseJson3(json)).toEqual([{ start: 0.5, duration: 2, text: "Hello world" }]);
});

const SEGS = [
  { start: 1.5, duration: 4, text: "first" },
  { start: 3, duration: 1.25, text: "second" },
  { start: 3725.007, duration: 1, text: "third" },
];

test("toTxt with and without timestamps", () => {
  expect(toTxt(SEGS)).toBe("first\nsecond\nthird\n");
  expect(toTxt(SEGS, true)).toBe("[00:01] first\n[00:03] second\n[1:02:05] third\n");
});

test("toVtt clips overlapping cues", () => {
  expect(toVtt(SEGS)).toBe(
    "WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nfirst\n\n00:00:03.000 --> 00:00:04.250\nsecond\n\n01:02:05.007 --> 01:02:06.007\nthird\n",
  );
});

test("toSrt numbering and comma separator", () => {
  expect(toSrt(SEGS.slice(0, 1))).toBe("1\n00:00:01,500 --> 00:00:05,500\nfirst\n");
});
