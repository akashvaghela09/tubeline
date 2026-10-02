import { expect, test } from "bun:test";
import { parseNetscapeCookies } from "../../src/core/cookies.ts";

test("parseNetscapeCookies keeps unexpired youtube.com cookies", () => {
  const text = [
    "# Netscape HTTP Cookie File",
    ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tabc",
    "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tHSID\tdef",
    "music.youtube.com\tFALSE\t/\tTRUE\t2000000000\tPREF\tx=1",
    ".youtube.com\tTRUE\t/\tTRUE\t1000\tOLD\texpired",
    ".google.com\tTRUE\t/\tTRUE\t2000000000\tNID\tother",
    ".notyoutube.com\tTRUE\t/\tTRUE\t2000000000\tEVIL\tx",
    "malformed line",
    "",
  ].join("\n");
  expect(parseNetscapeCookies(text, 1_700_000_000)).toBe("SID=abc; HSID=def; PREF=x=1");
});
