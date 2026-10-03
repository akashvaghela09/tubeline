// One video: a card with what decides the action, then hotkeyed actions.
import { useKeyboard } from "@opentui/react";
import { useEffect, useReducer } from "react";
import { toCliError } from "../../core/errors.ts";
import { videoHuman } from "../../core/human.ts";
import { bytes, compact, duration, setColor } from "../../core/style.ts";
import type { Video } from "../../models/video.ts";
import {
  audioWithOptions,
  downloadWithOptions,
  openInBrowser,
  queueThumbnails,
  queueVideos,
} from "../actions.ts";
import { useKeys, useUi } from "../app.tsx";
import { Blank, Line, List } from "../components.tsx";
import { tildify, wrap } from "../format.ts";
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
  }, [model, ui.services]);

  const v = model.video;
  const target = v ? [{ id: v.id, title: v.title }] : [];
  const existing = v ? ui.services.existing(v.id, ui.prefs.downloadDir) : null;
  const q = ui.prefs.videoQuality;
  const qSize = v
    ? q === "best"
      ? v.qualities[0]?.bytes
      : v.qualities.find((x) => x.label === q)?.bytes
    : null;

  const actions: Action[] = v
    ? [
        {
          key: "d",
          label: "Download video",
          detail: `${q === "best" ? `best${v.qualities[0] ? ` (${v.qualities[0].label})` : ""}` : q}${qSize ? ` ≈ ${bytes(qSize)}` : ""} → ${tildify(ui.prefs.downloadDir)}   D: choose`,
          run: () => queueVideos(ui, target, "video"),
        },
        {
          key: "a",
          label: "Download audio",
          detail: `${ui.prefs.audioFormat} → ${tildify(ui.prefs.downloadDir)}   A: choose`,
          run: () => queueVideos(ui, target, "audio"),
        },
        {
          key: "t",
          label: "Transcript",
          detail: v.captions.length ? "read, then save" : "no captions listed — will try anyway",
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
          detail: `→ ${tildify(ui.prefs.thumbnailDir)}`,
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
        { key: "o", label: "Open in browser", detail: v.url, run: () => openInBrowser(v.url) },
      ]
    : [];

  useKeys(
    v
      ? [
          ["d", "video"],
          ["a", "audio"],
          ["t", "transcript"],
          ["i", "thumbnail"],
          ["c", "channel"],
          ["Esc", "back"],
        ]
      : [["Esc", "back"]],
  );

  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (key.name === "escape") return ui.pop();
    if (!v) return;
    if (key.name === "up") model.cursor = Math.max(0, model.cursor - 1);
    else if (key.name === "down") model.cursor = Math.min(actions.length - 1, model.cursor + 1);
    else if (key.name === "return") actions[model.cursor]?.run();
    else if (key.name === "d" && key.shift) downloadWithOptions(ui, target, v);
    else if (key.name === "a" && key.shift) audioWithOptions(ui, target);
    else if (!key.ctrl && !key.meta) actions.find((a) => a.key === key.name && !key.shift)?.run();
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
  const captions = [...new Set(v.captions.map((c) => (c.isAuto ? `${c.lang} (auto)` : c.lang)))];
  const stats = [
    `${compact(v.viewCount)} views`,
    v.likeCount !== null ? `${compact(v.likeCount)} likes` : null,
    duration(v.durationSeconds),
    v.publishedAt?.slice(0, 10),
  ]
    .filter(Boolean)
    .join(" · ");
  const descHeight = Math.max(0, ui.bodyHeight - 8 - actions.length - 2);
  const desc = wrap(v.description.trim(), w).slice(0, descHeight);

  return (
    <box flexDirection="column">
      <Line bold>{v.title}</Line>
      <text wrapMode="none" truncate>
        <span fg={theme.fg}>{v.channel.name}</span>
        <span fg={theme.accent}>{v.channel.isVerified ? " ✓" : ""}</span>
        <span
          fg={theme.dim}
        >{`  ${v.channel.subscriberCount !== null ? `${compact(v.channel.subscriberCount)} subscribers` : ""}`}</span>
      </text>
      <Line fg={theme.dim}>{stats}</Line>
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
          {v.qualities[0]
            ? `${v.qualities[0].label}${v.qualities[0].bytes ? ` ≈ ${bytes(v.qualities[0].bytes)}` : ""}`
            : "?"}
        </span>
        <span fg={existing ? theme.green : theme.dim}>
          {existing ? `   ✓ already in ${tildify(ui.prefs.downloadDir)}` : ""}
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
        <Line key={i} fg={theme.dim}>
          {line || " "}
        </Line>
      ))}
      {desc.length ? <Line fg={theme.faint}>{"─".repeat(w)}</Line> : null}
      <List
        rows={actions.map((a) => ({
          key: a.key,
          text: `${a.key}  ${a.label.padEnd(16)} ${a.detail}`,
        }))}
        cursor={model.cursor}
        height={actions.length}
      />
    </box>
  );
}
