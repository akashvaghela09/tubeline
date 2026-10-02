import { describe, expect, test } from "bun:test";
import { chooseTrack } from "../../src/services/transcript.ts";
import type { CaptionTrackRef } from "../../src/sources/innertube.ts";

const t = (lang: string, isAuto = false): CaptionTrackRef => ({
  lang,
  name: lang,
  isAuto,
  isTranslatable: true,
  baseUrl: `https://x/${lang}/${isAuto}`,
});

describe("chooseTrack", () => {
  const tracks = [t("ja"), t("en-US"), t("en", true), t("pt-BR")];

  test("defaults to English, manual first", () => {
    expect(chooseTrack(tracks, { prefer: "manual" })).toEqual(t("en-US"));
  });

  test("prefer auto", () => {
    expect(chooseTrack(tracks, { prefer: "auto" })).toEqual(t("en", true));
  });

  test("exact code beats base-language match", () => {
    expect(chooseTrack([t("pt-BR"), t("pt")], { lang: "pt", prefer: "manual" })).toEqual(t("pt"));
    expect(chooseTrack(tracks, { lang: "pt", prefer: "manual" })).toEqual(t("pt-BR"));
  });

  test("no English and no --lang → first track", () => {
    expect(chooseTrack([t("ja"), t("ko")], { prefer: "manual" })).toEqual(t("ja"));
  });

  test("explicit missing language → undefined", () => {
    expect(chooseTrack(tracks, { lang: "de", prefer: "manual" })).toBeUndefined();
  });
});
