import { describe, expect, test } from "bun:test";
import { CliError } from "../../src/core/errors.ts";
import { chooseTrack } from "../../src/services/transcript.ts";
import { type CaptionTrackRef, captionTracksFrom } from "../../src/sources/innertube.ts";

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

describe("captionTracksFrom", () => {
  const track = {
    base_url: "https://x",
    language_code: "en",
    name: { text: "English" },
    is_translatable: true,
  };

  test("maps tracks", () => {
    expect(
      captionTracksFrom("v", {
        captions: { caption_tracks: [track] },
        playability_status: { status: "OK" },
      }),
    ).toEqual([
      { lang: "en", name: "English", isAuto: false, isTranslatable: true, baseUrl: "https://x" },
    ]);
  });

  test("no tracks on an OK player = genuinely no captions", () => {
    expect(captionTracksFrom("v", { playability_status: { status: "OK" } })).toEqual([]);
  });

  test.each([
    [{ status: "LOGIN_REQUIRED", reason: "Sign in to confirm you’re not a bot" }, "RATE_LIMITED"],
    [{ status: "LOGIN_REQUIRED", reason: "Sign in to confirm your age" }, "UNAVAILABLE"],
    [{ status: "UNPLAYABLE", reason: "Members only" }, "UNAVAILABLE"],
    [{ status: "ERROR", reason: "This video is unavailable" }, "NOT_FOUND"],
  ])("blocked player %p → %s", (playability_status, code) => {
    try {
      captionTracksFrom("v", { playability_status });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe(code as CliError["code"]);
    }
  });
});
