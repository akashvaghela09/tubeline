// Every job of this session: progress, cancel, retry.

import { dirname } from "node:path";
import { useKeyboard } from "@opentui/react";
import { useState, useSyncExternalStore } from "react";
import { openInBrowser } from "../actions.ts";
import { JobLine, useKeys, useUi } from "../app.tsx";
import { Line } from "../components.tsx";
import { theme } from "../theme.ts";

export function DownloadsScreen() {
  const ui = useUi();
  const jobs = [...useSyncExternalStore(ui.jobs.subscribe, ui.jobs.getSnapshot)].reverse();
  const [cursor, setCursor] = useState(0);
  const c = Math.min(cursor, Math.max(0, jobs.length - 1));
  const job = jobs[c];
  useKeys([
    ["x", "cancel"],
    ["X", "cancel all"],
    ["r", "retry"],
    ["o", "open folder"],
    ["Esc", "back"],
  ]);
  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (key.name === "escape") return ui.pop();
    if (key.name === "up") setCursor(Math.max(0, c - 1));
    if (key.name === "down") setCursor(Math.min(jobs.length - 1, c + 1));
    if (key.name === "x" && key.shift) ui.jobs.cancelAll();
    else if (key.name === "x" && job) ui.jobs.cancel(job.key);
    if (key.name === "r" && job) ui.jobs.retry(job.key);
    if (key.name === "o" && job?.path) openInBrowser(dirname(job.path));
  });
  const height = ui.bodyHeight - 1;
  const start = Math.min(
    Math.max(0, c - Math.floor(height / 2)),
    Math.max(0, jobs.length - height),
  );
  return (
    <box flexDirection="column">
      <Line fg={theme.dim}>
        {jobs.length
          ? `${jobs.length} jobs this session (newest first)`
          : "No downloads yet. Press d on a video to start one."}
      </Line>
      {jobs.slice(start, start + height).map((j, i) => (
        <JobLine key={j.key} job={j} width={ui.width - 2} selected={start + i === c} />
      ))}
    </box>
  );
}
