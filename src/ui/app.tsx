// App shell: screen stack, header, footer, toasts, the live downloads panel and global keys.
import { appendFileSync } from "node:fs";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Ref } from "../core/resolve.ts";
import { bytes } from "../core/style.ts";
import type { ListType, SearchType } from "../sources/innertube.ts";
import { Keys, Line } from "./components.tsx";
import { clock, progressLine, tildify } from "./format.ts";
import type { Job, JobQueue } from "./jobs.ts";
import { type Prefs, savePrefs } from "./prefs.ts";
import type { BrowseModel } from "./screens/browse.tsx";
import { BrowseScreen, newBrowse } from "./screens/browse.tsx";
import { type ChoiceOption, ChoiceScreen } from "./screens/choice.tsx";
import { DownloadsScreen } from "./screens/downloads.tsx";
import { HomeScreen } from "./screens/home.tsx";
import { PromptScreen } from "./screens/prompt.tsx";
import { SettingsScreen } from "./screens/settings.tsx";
import { type TranscriptModel, TranscriptScreen } from "./screens/transcript.tsx";
import { type VideoModel, VideoScreen } from "./screens/video.tsx";
import { ViewerScreen } from "./screens/viewer.tsx";
import type { UiServices } from "./services.ts";
import { theme } from "./theme.ts";

export type Screen =
  | { kind: "home" }
  | { kind: "video"; model: VideoModel }
  | { kind: "browse"; model: BrowseModel }
  | { kind: "transcript"; model: TranscriptModel }
  | { kind: "viewer"; title: string; text: string }
  | {
      kind: "choice";
      title: string;
      options: ChoiceOption[];
      initial?: number;
      onPick: (value: string) => void;
    }
  | {
      kind: "prompt";
      title: string;
      initial: string;
      hint?: string;
      onSubmit: (value: string) => string | undefined;
    }
  | { kind: "settings"; model: { cursor: number } }
  | { kind: "downloads" };

export interface Toast {
  text: string;
  kind: "info" | "ok" | "error";
}

export interface Ui {
  services: UiServices;
  prefs: Prefs;
  savePrefs(): void;
  jobs: JobQueue;
  push(screen: Screen): void;
  pop(): void;
  toast(text: string, kind?: Toast["kind"]): void;
  setKeys(keys: [string, string][]): void;
  /** Rows available to the current screen's content. */
  bodyHeight: number;
  width: number;
  openRef(ref: Ref, label: string): void;
  openSearch(query: string, type: SearchType): void;
  openChannel(ref: Ref, tab?: ListType): void;
}

const UiContext = createContext<Ui | null>(null);

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("useUi outside App");
  return ui;
}

/** Register the footer key hints for the current screen. */
export function useKeys(keys: [string, string][]) {
  const ui = useUi();
  const sig = JSON.stringify(keys);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by content
  useEffect(() => ui.setKeys(keys), [sig]);
}

const PANEL_MAX = 3;
/** Debug aid: YT_DATA_UI_KEYLOG=/path logs every key event the UI receives. */
const KEYLOG = process.env.YT_DATA_UI_KEYLOG;

export function App({
  services,
  prefs,
  jobs,
  onQuit,
}: {
  services: UiServices;
  prefs: Prefs;
  jobs: JobQueue;
  onQuit: () => void;
}) {
  const { width, height } = useTerminalDimensions();
  const [stack, setStack] = useState<Screen[]>([{ kind: "home" }]);
  const [keys, setKeys] = useState<[string, string][]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quitArmed = useRef(0);
  const jobList = useSyncExternalStore(jobs.subscribe, jobs.getSnapshot);
  const staleWarned = useRef(false);

  const showToast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    setToast({ text, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), kind === "error" ? 8000 : 4000);
  }, []);

  const push = useCallback((s: Screen) => setStack((st) => [...st, s]), []);
  const pop = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);

  // A failed download with an outdated yt-dlp: say so once and offer the fix.
  useEffect(() => {
    const failed = jobList.find(
      (j) =>
        j.status === "failed" &&
        /403|forbidden|not a bot|nsig|signature|unable to extract/i.test(j.error?.message ?? ""),
    );
    if (!failed || staleWarned.current) return;
    staleWarned.current = true;
    void services.ytDlpAge().then((age) => {
      if (age !== null && age > 30)
        showToast(
          `yt-dlp is ${age} days old, which often causes this — press Ctrl+U to update`,
          "error",
        );
    });
  }, [jobList, services, showToast]);

  const panelJobs = pickPanelJobs(jobList);
  const panelHeight = panelJobs.length ? panelJobs.length + 1 : 0;
  const bodyHeight = Math.max(
    3,
    height - 2 /* header + rule */ - 2 /* footer + rule */ - (toast ? 1 : 0) - panelHeight,
  );

  const ui: Ui = useMemo(
    () => ({
      services,
      prefs,
      savePrefs: () => savePrefs(prefs),
      jobs,
      push,
      pop,
      toast: showToast,
      setKeys,
      bodyHeight,
      width,
      openRef(ref, label) {
        addRecentAndSave(prefs, { kind: "ref", value: refString(ref), label });
        if (ref.kind === "video")
          push({ kind: "video", model: { id: ref.id, video: null, error: null, cursor: 0 } });
        else if (ref.kind === "playlist")
          push({ kind: "browse", model: newBrowse({ kind: "playlist", ref, title: label }) });
        else push({ kind: "browse", model: newBrowse({ kind: "channel", ref, tab: "videos" }) });
      },
      openSearch(query, type) {
        addRecentAndSave(prefs, { kind: "search", value: query, label: `“${query}”` });
        push({ kind: "browse", model: newBrowse({ kind: "search", query, type }) });
      },
      openChannel(ref, tab = "videos") {
        push({ kind: "browse", model: newBrowse({ kind: "channel", ref, tab }) });
      },
    }),
    [services, prefs, jobs, push, pop, showToast, bodyHeight, width],
  );

  const top = stack[stack.length - 1] as Screen;

  useKeyboard((key) => {
    if (KEYLOG)
      appendFileSync(
        KEYLOG,
        `${JSON.stringify({ t: Date.now(), screen: top.kind, name: key.name, seq: key.sequence, ctrl: key.ctrl, shift: key.shift, source: key.source, type: key.eventType })}\n`,
      );
    if (key.ctrl && key.name === "c") {
      const active = jobs.active();
      if (active.length && Date.now() - quitArmed.current > 3000) {
        quitArmed.current = Date.now();
        showToast(
          `${active.length} download(s) in progress — Ctrl+C again to cancel them and quit`,
          "error",
        );
        return;
      }
      jobs.cancelAll();
      onQuit();
      return;
    }
    if (key.ctrl && key.name === "o" && top.kind !== "downloads") push({ kind: "downloads" });
    if (key.ctrl && key.name === "s" && top.kind !== "settings")
      push({ kind: "settings", model: { cursor: 0 } });
    if (key.ctrl && key.name === "k") {
      showToast("Checking setup…");
      void services.doctor().then((text) => push({ kind: "viewer", title: "Setup check", text }));
    }
    if (key.ctrl && key.name === "u") {
      showToast("Updating yt-data and yt-dlp…");
      void services
        .update()
        .then((text) => {
          showToast(text.trim().split("\n")[0] ?? "Updated", "ok");
          push({
            kind: "viewer",
            title: "Update",
            text: `${text}\nRestart yt-data to use a new yt-data version.`,
          });
        })
        .catch((err: Error) => showToast(err.message, "error"));
    }
  });

  const crumbs = stack.map(crumb).filter(Boolean).join(" › ");
  const defaults = `${tildify(prefs.downloadDir)} · ${prefs.videoQuality} · ${prefs.audioFormat}`;

  return (
    <UiContext.Provider value={ui}>
      <box flexDirection="column" width="100%" height="100%">
        <text wrapMode="none" truncate>
          <span fg={theme.accent}>
            <strong> yt-data </strong>
          </span>
          <span fg={theme.dim}>{services.version} </span>
          <span fg={theme.fg}>{crumbs ? ` ${crumbs}` : ""}</span>
          <span fg={theme.faint}>{"  "}</span>
          <span fg={theme.dim}>{width > 100 ? defaults : ""}</span>
        </text>
        <Line fg={theme.faint}>{"─".repeat(width)}</Line>
        <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
          <ScreenView screen={top} />
        </box>
        {toast ? (
          <Line
            fg={toast.kind === "error" ? theme.red : toast.kind === "ok" ? theme.green : theme.cyan}
          >
            {` ${toast.kind === "error" ? "✗" : toast.kind === "ok" ? "✓" : "•"} ${toast.text}`}
          </Line>
        ) : null}
        {panelJobs.length ? <JobsPanel jobs={panelJobs} all={jobList} width={width} /> : null}
        <Line fg={theme.faint}>{"─".repeat(width)}</Line>
        <box paddingLeft={1}>
          <Keys keys={[...keys, ["^O", "downloads"], ["^S", "settings"], ["^C", "quit"]]} />
        </box>
      </box>
    </UiContext.Provider>
  );
}

function ScreenView({ screen }: { screen: Screen }) {
  switch (screen.kind) {
    case "home":
      return <HomeScreen />;
    case "video":
      return <VideoScreen key={screen.model.id} model={screen.model} />;
    case "browse":
      return <BrowseScreen model={screen.model} />;
    case "transcript":
      return <TranscriptScreen model={screen.model} />;
    case "viewer":
      return <ViewerScreen title={screen.title} text={screen.text} />;
    case "choice":
      return (
        <ChoiceScreen
          title={screen.title}
          options={screen.options}
          initial={screen.initial}
          onPick={screen.onPick}
        />
      );
    case "prompt":
      return (
        <PromptScreen
          title={screen.title}
          initial={screen.initial}
          hint={screen.hint}
          onSubmit={screen.onSubmit}
        />
      );
    case "settings":
      return <SettingsScreen model={screen.model} />;
    case "downloads":
      return <DownloadsScreen />;
  }
}

function crumb(s: Screen): string {
  switch (s.kind) {
    case "home":
      return "";
    case "video":
      return s.model.video ? short(s.model.video.title) : "video";
    case "browse":
      return short(s.model.title);
    case "transcript":
      return "transcript";
    case "viewer":
      return s.title.toLowerCase();
    case "settings":
      return "settings";
    case "downloads":
      return "downloads";
    default:
      return "";
  }
}

function short(s: string): string {
  return s.length > 28 ? `${s.slice(0, 27)}…` : s;
}

/** Running first, then queued, then the most recent finished ones, up to PANEL_MAX. */
function pickPanelJobs(all: readonly Job[]): Job[] {
  const running = all.filter((j) => j.status === "running");
  const queued = all.filter((j) => j.status === "queued");
  const recent = all
    .filter(
      (j) =>
        (j.status === "done" || j.status === "failed" || j.status === "cancelled") &&
        Date.now() - (j.finishedAt ?? 0) < 15_000,
    )
    .reverse();
  return [...running, ...queued, ...recent].slice(0, PANEL_MAX);
}

function JobsPanel({ jobs, all, width }: { jobs: Job[]; all: readonly Job[]; width: number }) {
  const running = all.filter((j) => j.status === "running").length;
  const queued = all.filter((j) => j.status === "queued").length;
  const done = all.filter((j) => j.status === "done").length;
  const failed = all.filter((j) => j.status === "failed").length;
  const summary = [
    running && `${running} running`,
    queued && `${queued} queued`,
    done && `${done} done`,
    failed && `${failed} failed`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <box flexDirection="column">
      <Line fg={theme.dim}>{` Downloads  ${summary}`}</Line>
      {jobs.map((j) => (
        <JobLine key={j.key} job={j} width={width} />
      ))}
    </box>
  );
}

export function JobLine({ job, width, selected }: { job: Job; width: number; selected?: boolean }) {
  const cols = Math.max(20, width - 4);
  const label = job.kind === "video" || job.kind === "audio" ? job.kind : job.kind;
  let icon = "·";
  let color: string = theme.dim;
  let text = "";
  if (job.status === "running") {
    icon = "◆";
    color = theme.accent;
    text =
      (job.kind === "video" || job.kind === "audio") && job.progress
        ? progressLine(job.progress, job.kind, job.title, cols)
        : `${label}…  ${job.title}`;
    if ((job.kind === "video" || job.kind === "audio") && !job.progress)
      text = `  0% fetching formats  ${job.title}`;
  } else if (job.status === "queued") {
    text = `queued  ${label}  ${job.title}`;
  } else if (job.status === "done") {
    icon = "✓";
    color = theme.green;
    const took =
      job.startedAt && job.finishedAt ? clock((job.finishedAt - job.startedAt) / 1000) : "";
    const size = job.bytes !== null ? bytes(job.bytes) : "";
    text = [job.note ?? label, size, took, job.path ? tildify(job.path) : job.title]
      .filter(Boolean)
      .join("  ");
  } else if (job.status === "failed") {
    icon = "✗";
    color = theme.red;
    text = `${job.error?.message ?? "failed"}  ${job.title}`;
  } else {
    icon = "–";
    text = `cancelled  ${job.title}`;
  }
  return (
    <text wrapMode="none" truncate bg={selected ? theme.cursorBg : undefined}>
      <span fg={color}>{` ${icon} `}</span>
      <span fg={job.status === "running" ? theme.fg : theme.dim}>{text}</span>
    </text>
  );
}

function refString(ref: Ref): string {
  switch (ref.kind) {
    case "video":
      return ref.id;
    case "channel":
      return ref.id;
    case "channelUrl":
      return ref.url;
    case "playlist":
      return ref.id;
  }
}

function addRecentAndSave(prefs: Prefs, item: Prefs["recent"][number]) {
  prefs.recent = [
    item,
    ...prefs.recent.filter((r) => !(r.kind === item.kind && r.value === item.value)),
  ].slice(0, 8);
  savePrefs(prefs);
}
