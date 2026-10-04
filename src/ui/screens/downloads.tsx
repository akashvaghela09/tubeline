// Downloads (Ctrl+O): every job of the session in a fixed-column table, and a detail card for
// the selected one. With a single job, just its card.
import { dirname } from "node:path";
import { useKeyboard } from "@opentui/react";
import { useState, useSyncExternalStore } from "react";
import { truncate } from "../../core/style.ts";
import { openInBrowser } from "../actions.ts";
import { useKeys, useUi } from "../app.tsx";
import { Bar, Blank, Line } from "../components.tsx";
import {
  clock,
  etaText,
  jobColumns,
  jobPercent,
  overall,
  pad,
  rate,
  STAGE_WIDTH,
  sizeText,
  speedText,
  stageStrip,
  stageWord,
  tildify,
  wrap,
} from "../format.ts";
import type { Job } from "../jobs.ts";
import { theme } from "../theme.ts";

const ICON: Record<Job["status"], string> = {
  queued: "·",
  running: "◆",
  done: "✓",
  failed: "✗",
  cancelled: "–",
};

function iconColor(job: Job): string {
  return job.status === "done"
    ? theme.green
    : job.status === "failed"
      ? theme.red
      : job.status === "running"
        ? theme.accent
        : theme.dim;
}

const cell = (s: string, w: number, align: "left" | "right" = "left") =>
  pad(truncate(s, w), w, align);

export function DownloadsScreen() {
  const ui = useUi();
  const jobs = [...useSyncExternalStore(ui.jobs.subscribe, ui.jobs.getSnapshot)].reverse();
  const [cursor, setCursor] = useState(0);
  const c = Math.min(cursor, Math.max(0, jobs.length - 1));
  const job = jobs[c];
  const many = jobs.length > 1;

  useKeys([
    ...(many ? ([["↑↓", "select"]] as [string, string][]) : []),
    ["x", "cancel"],
    ["r", "retry"],
    ["o", "open folder"],
    ["Enter", "open file"],
    ...(many ? ([["X", "cancel all"]] as [string, string][]) : []),
    ["Esc", "back"],
  ]);

  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (key.name === "escape" || key.name === "backspace") return ui.pop();
    if (key.name === "up") setCursor(Math.max(0, c - 1));
    if (key.name === "down") setCursor(Math.min(jobs.length - 1, c + 1));
    if (key.name === "x" && key.shift) ui.jobs.cancelAll();
    else if (key.name === "x" && job) ui.jobs.cancel(job.key);
    if (key.name === "r" && job) ui.jobs.retry(job.key);
    if (key.name === "o" && job)
      openInBrowser(job.path ? dirname(job.path) : (job.spec?.dir ?? ui.prefs.downloadDir));
    if (key.name === "return" && job?.path) openInBrowser(job.path);
  });

  if (!job) {
    return (
      <box flexDirection="column">
        <Blank />
        <Line fg={theme.dim}>No downloads yet. Open a video and press d.</Line>
      </box>
    );
  }

  const w = Math.max(40, ui.width - 4);
  const card = <Card job={job} width={w} />;
  if (!many) return card;

  const o = overall(jobs, new Set(jobs.map((j) => j.key)));
  // "▸ ◆ " title "  " bar " 42%  " size(17) "  " [speed] [time] status
  const col = jobColumns(w, 4 + 2 + 7 + 17 + 2 + STAGE_WIDTH);
  const barW = col.bar;
  const titleW = col.title;
  const tableH = Math.max(3, Math.min(jobs.length, ui.bodyHeight - 12));
  const start = Math.min(
    Math.max(0, c - Math.floor(tableH / 2)),
    Math.max(0, jobs.length - tableH),
  );

  return (
    <box flexDirection="column">
      <text wrapMode="none" truncate>
        <span fg={theme.fg}>
          <strong>{`${jobs.length} downloads`}</strong>
        </span>
        <span fg={theme.dim}>
          {`   ${[o.active && `${o.active} running`, o.queued && `${o.queued} queued`, o.done && `${o.done} done`, o.failed && `${o.failed} failed`].filter(Boolean).join(" · ")}`}
        </span>
        <span fg={theme.dim}>{"   "}</span>
        <Bar percent={o.percent} width={barW} />
        <span fg={theme.fg}>{` ${Math.floor(o.percent)}% overall`}</span>
        <span
          fg={theme.dim}
        >{`${o.speed ? `   ${rate(o.speed)}` : ""}${o.eta !== null ? `   ~${clock(o.eta)} left` : ""}`}</span>
      </text>
      <Line fg={theme.dim}>
        {`    ${cell("title", titleW)}  ${cell("", barW)} ${cell("", 4)}  ${cell("size", 17, "right")}  ${col.speed ? `${cell("speed", 10, "right")}  ` : ""}${col.eta ? `${cell("time", 10, "right")}  ` : ""}status`}
      </Line>
      {jobs.slice(start, start + tableH).map((j, i) => {
        const selected = start + i === c;
        return (
          <text key={j.key} wrapMode="none" truncate bg={selected ? theme.cursorBg : undefined}>
            <span fg={selected ? theme.accent : theme.faint}>{selected ? "▸ " : "  "}</span>
            <span fg={iconColor(j)}>{`${ICON[j.status]} `}</span>
            <span
              fg={j.status === "running" ? theme.fg : theme.dim}
            >{`${cell(j.title, titleW)}  `}</span>
            <Bar
              percent={jobPercent(j)}
              width={barW}
              color={j.status === "failed" ? theme.red : undefined}
            />
            <span
              fg={theme.fg}
            >{` ${cell(j.status === "queued" ? "" : `${Math.floor(jobPercent(j))}%`, 4, "right")}  `}</span>
            <span
              fg={theme.dim}
            >{`${cell(sizeText(j), 17, "right")}  ${col.speed ? `${cell(speedText(j), 10, "right")}  ` : ""}${col.eta ? `${cell(etaText(j), 10, "right")}  ` : ""}`}</span>
            <span fg={iconColor(j)}>{cell(stageWord(j), STAGE_WIDTH)}</span>
          </text>
        );
      })}
      <Line fg={theme.faint}>{"─".repeat(w)}</Line>
      {card}
    </box>
  );
}

/** Everything about one job. */
function Card({ job, width }: { job: Job; width: number }) {
  const strip = stageStrip(job);
  const spec = job.spec;
  const what =
    job.kind === "video"
      ? `video · ${spec?.quality === "best" ? "best quality" : `up to ${spec?.quality ?? "?"}`}`
      : job.kind === "audio"
        ? `audio · ${spec?.audioFormat ?? ""}`
        : job.kind;
  const where = job.path ? tildify(job.path) : tildify(spec?.dir ?? "");
  const numbers = [sizeText(job), speedText(job), etaText(job)].filter(Boolean).join("   ·   ");
  return (
    <box flexDirection="column">
      <Line bold>{job.title}</Line>
      <text wrapMode="none" truncate>
        {strip.map((s, i) => (
          <span key={s.label}>
            {i ? <span fg={s.state === "todo" ? theme.faint : theme.accent}>{" ━━ "}</span> : null}
            <span
              fg={s.state === "done" ? theme.green : s.state === "now" ? theme.accent : theme.faint}
            >
              {s.state === "done" ? "● " : s.state === "now" ? "◉ " : "○ "}
            </span>
            <span fg={s.state === "todo" ? theme.dim : theme.fg}>{s.label}</span>
          </span>
        ))}
      </text>
      <Blank />
      <text wrapMode="none">
        <Bar
          percent={jobPercent(job)}
          width={Math.max(10, width - 10)}
          color={
            job.status === "failed" ? theme.red : job.status === "done" ? theme.green : undefined
          }
        />
        <span fg={theme.fg}>
          <strong>{`  ${Math.floor(jobPercent(job))}%`}</strong>
        </span>
      </text>
      <Line fg={theme.dim}>{numbers || " "}</Line>
      <Blank />
      <text wrapMode="none" truncate>
        <span fg={theme.dim}>{"what   "}</span>
        <span fg={theme.fg}>{what}</span>
      </text>
      <text wrapMode="none" truncate>
        <span fg={theme.dim}>{job.path ? "file   " : "to     "}</span>
        <span fg={theme.fg}>{where}</span>
        <span fg={theme.dim}>{job.note ? `   (${job.note})` : ""}</span>
      </text>
      {job.error
        ? [
            ...wrap(`✗ ${job.error.message}`, width).map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: wrapped lines of one message
              <Line key={`e${i}`} fg={theme.red}>
                {l}
              </Line>
            )),
            ...(job.error.hint
              ? [
                  <Line key="h" fg={theme.yellow}>
                    {`→ ${job.error.hint}`}
                  </Line>,
                ]
              : []),
          ]
        : null}
    </box>
  );
}
