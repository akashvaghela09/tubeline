// One video: a card with what decides the action, then keyed actions.
import { useKeyboard } from "@opentui/react";
import { useEffect, useReducer } from "react";
import { toCliError } from "../../core/errors.ts";
import { videoHuman } from "../../core/human.ts";
import { bytes, duration, setColor } from "../../core/style.ts";
import type { Video } from "../../models/video.ts";
import { openDownload, openInBrowser, queueThumbnails } from "../actions.ts";
import { useKeys, useUi } from "../app.tsx";
import { Blank, Line, List } from "../components.tsx";
import { num, tildify, wrap } from "../format.ts";
import { theme } from "../theme.ts";

export interface VideoModel {
  id: string;
  video: Video | null;
  error: string | null;
  cursor: number;
}

interface Action {
  key: string;
  label: string;
  detail: string;
  run: () => void;
}

export function VideoScreen({ model }: { model: VideoModel }) {
  const ui = useUi();
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (model.video || model.error) return;
    let live = true;
    ui.services
      .getVideo(model.id)
      .then((v) => {
        model.video = v;
        ui.labelRecent(model.id, `${v.title}  · ${v.channel.name}`);
        if (live) redraw();
      })
      .catch((err) => {
        const e = toCliError(err);
        model.error = e.hint ? `${e.message} — ${e.hint}` : e.message;
        if (live) redraw();
      });
    return () => {
      live = false;
    };
  }, [model, ui]);

  const v = model.video;
  const target = v ? [{ id: v.id, title: v.title }] : [];
  const p = ui.prefs;
  const q = p.videoQuality;
  const best = v?.qualities[0];
  const qSize = v
    ? q === "best"
      ? best?.bytes
      : v.qualities.find((x) => x.label === q)?.bytes
    : null;
  const langs = v ? [...new Set(v.captions.map((c) => c.lang.split("-")[0]))] : [];

  const actions: Action[] = v
    ? [
        {
          key: "d",
          label: "Download",
          detail: `video ${q === "best" ? `best${best ? ` (${best.label})` : ""}` : q}${qSize ? ` ≈ ${bytes(qSize)}` : ""} → ${tildify(p.downloadDir)}`,
          run: () => openDownload(ui, target, v, "video"),
        },
        {
          key: "a",
          label: "Download audio",
          detail: `${p.audioFormat} → ${tildify(p.downloadDir)}`,
          run: () => openDownload(ui, target, v, "audio"),
        },
        {
          key: "t",
          label: "Transcript",
          detail: langs.length
            ? langs.slice(0, 5).join(", ") + (langs.length > 5 ? ` +${langs.length - 5}` : "")
            : "no captions listed — will try",
          run: () =>
            ui.push({
              kind: "transcript",
              model: {
                videoId: v.id,
                title: v.title,
                langs: [
                  ...new Map(
                    v.captions.map((c) => [c.lang, { lang: c.lang, name: c.name }]),
                  ).values(),
                ],
                lang: undefined,
                top: 0,
              },
            }),
        },
        {
          key: "i",
          label: "Thumbnail",
          detail: `→ ${tildify(p.thumbnailDir)}`,
          run: () => queueThumbnails(ui, target),
        },
        {
          key: "c",
          label: "Channel",
          detail: v.channel.name,
          run: () => ui.openChannel({ kind: "channel", id: v.channel.id }),
        },
        {
          key: "m",
          label: "Details",
          detail: "full description, chapters",
          run: () => {
            setColor(false);
            ui.push({ kind: "viewer", title: "Details", text: videoHuman([v]) });
          },
        },
        { key: "o", label: "Open in browser", detail: "", run: () => openInBrowser(v.url) },
      ]
    : [];

  useKeys(
    v
      ? [
          ["↑↓ Enter", "choose"],
          ["Esc", "back"],
        ]
      : [["Esc", "back"]],
  );

  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (key.name === "escape" || key.name === "backspace") return ui.pop();
    if (!v) return;
    if (key.name === "up") model.cursor = Math.max(0, model.cursor - 1);
    else if (key.name === "down") model.cursor = Math.min(actions.length - 1, model.cursor + 1);
    else if (key.name === "return") actions[model.cursor]?.run();
    else actions.find((a) => a.key === key.name && !key.shift)?.run();
    redraw();
  });

  if (model.error) {
    return (
      <box flexDirection="column">
        <Blank />
        <Line fg={theme.red}>{`✗ ${model.error}`}</Line>
      </box>
    );
  }
  if (!v) {
    return (
      <box flexDirection="column">
        <Blank />
        <Line fg={theme.dim}>Loading video…</Line>
      </box>
    );
  }

  const w = Math.max(20, ui.width - 4);
  const existing = ui.services.existing(v.id, p.downloadDir);
  const stats = [
    `${num(v.viewCount)} views`,
    v.likeCount !== null ? `${num(v.likeCount)} likes` : null,
    duration(v.durationSeconds),
    v.publishedAt?.slice(0, 10),
  ]
    .filter(Boolean)
    .join(" · ");
  const captions = [...new Set(v.captions.map((c) => (c.isAuto ? `${c.lang} (auto)` : c.lang)))];
  const descHeight = Math.max(
    0,
    ui.bodyHeight - 7 - actions.length - (v.playability.status !== "OK" ? 1 : 0),
  );
  const descAll = wrap(v.description.trim(), w);
  const cut = descAll.length > descHeight;
  const desc = descAll.slice(0, cut ? Math.max(0, descHeight - 1) : descHeight);

  return (
    <box flexDirection="column">
      <Line bold>{v.title}</Line>
      <text wrapMode="none" truncate>
        <span fg={theme.fg}>{v.channel.name}</span>
        <span fg={theme.accent}>{v.channel.isVerified ? " ✓" : ""}</span>
        <span fg={theme.dim}>
          {v.channel.subscriberCount !== null
            ? `  ${num(v.channel.subscriberCount)} subscribers`
            : ""}
          {`  ·  ${stats}`}
        </span>
      </text>
      <text wrapMode="none" truncate>
        <span fg={theme.dim}>captions </span>
        <span fg={theme.fg}>
          {captions.length
            ? captions.slice(0, 6).join(", ") +
              (captions.length > 6 ? ` +${captions.length - 6}` : "")
            : "none"}
        </span>
        <span fg={theme.dim}>{"   best "}</span>
        <span fg={theme.fg}>
          {best ? `${best.label}${best.bytes ? ` ≈ ${bytes(best.bytes)}` : ""}` : "?"}
        </span>
        <span fg={existing ? theme.green : theme.dim}>
          {existing ? `   ✓ already in ${tildify(p.downloadDir)}` : ""}
        </span>
      </text>
      {v.playability.status !== "OK" ? (
        <Line
          fg={theme.yellow}
        >{`⚠ ${v.playability.status}${v.playability.reason ? `: ${v.playability.reason}` : ""}`}</Line>
      ) : null}
      <Line fg={theme.faint}>{"─".repeat(w)}</Line>
      {desc.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static wrapped lines
        <Line key={i}>{line || " "}</Line>
      ))}
      {cut ? <Line fg={theme.dim}>{"… m for full description"}</Line> : null}
      <Line fg={theme.faint}>{"─".repeat(w)}</Line>
      <List
        rows={actions.map((a) => ({
          key: a.key,
          parts: [
            { text: `${a.key}  `, fg: theme.accent, bold: true },
            { text: a.label.padEnd(16) },
            { text: a.detail, fg: theme.dim },
          ],
        }))}
        cursor={model.cursor}
        height={actions.length}
        width={w}
      />
    </box>
  );
}
