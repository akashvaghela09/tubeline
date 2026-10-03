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
import { bytes, width as textWidth, truncate } from "../core/style.ts";
import type { ListType, SearchType } from "../sources/innertube.ts";
import { fitHints, type Hint, Keys, Line } from "./components.tsx";
import { clock, progressLine, tildify } from "./format.ts";
import type { Job, JobQueue } from "./jobs.ts";
import { KEY_REFERENCE } from "./keys.ts";
import { type Prefs, savePrefs } from "./prefs.ts";
import type { BrowseModel } from "./screens/browse.tsx";
import { BrowseScreen, newBrowse } from "./screens/browse.tsx";
import { type ChoiceOption, ChoiceScreen } from "./screens/choice.tsx";
import { type DownloadModel, DownloadScreen } from "./screens/download.tsx";
import { DownloadsScreen } from "./screens/downloads.tsx";
import { HomeScreen } from "./screens/home.tsx";
import { type FolderModel, FolderScreen } from "./screens/prompt.tsx";
import { SettingsScreen } from "./screens/settings.tsx";
import { type TranscriptModel, TranscriptScreen } from "./screens/transcript.tsx";
import { type VideoModel, VideoScreen } from "./screens/video.tsx";
import { ViewerScreen } from "./screens/viewer.tsx";
import type { UiServices } from "./services.ts";
import { applyTheme, normalizeTheme, resolveTheme, type ThemeChoice, theme } from "./theme.ts";

export type Screen =
  | { kind: "home" }
  | { kind: "video"; model: VideoModel }
  | { kind: "browse"; model: BrowseModel }
  | { kind: "transcript"; model: TranscriptModel }
  | { kind: "download"; model: DownloadModel }
  | { kind: "viewer"; title: string; text: string }
  | {
      kind: "choice";
      title: string;
      options: ChoiceOption[];
      initial?: number;
      onPick: (value: string) => void;
      onHover?: (value: string) => void;
      onCancel?: () => void;
    }
  | { kind: "folder"; model: FolderModel }
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
  setKeys(keys: Hint[]): void;
  /** Apply a theme now; `persist` saves it as the default. */
  setTheme(choice: ThemeChoice, persist: boolean): void;
  /** The terminal's own background, when it told us. */
  terminalMode: "light" | "dark" | null;
  /** Rows available to the current screen's content. */
  bodyHeight: number;
  width: number;
  openRef(ref: Ref, label: string): void;
  openSearch(query: string, type: SearchType): void;
  openChannel(ref: Ref, tab?: ListType): void;
  /** Update a recent item's label once we know what it resolved to. */
  labelRecent(value: string, label: string): void;
}

const UiContext = createContext<Ui | null>(null);

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("useUi outside App");
  return ui;
}

/** Register the footer key hints for the current screen, most important first. */
export function useKeys(keys: Hint[]) {
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
  terminalMode = null,
}: {
  services: UiServices;
  prefs: Prefs;
  jobs: JobQueue;
  onQuit: () => void;
  terminalMode?: "light" | "dark" | null;
}) {
  const { width, height } = useTerminalDimensions();
  const [stack, setStack] = useState<Screen[]>([{ kind: "home" }]);
  const [themeKey, setThemeKey] = useState(() => {
    const name = resolveTheme(
      normalizeTheme(process.env.YT_DATA_THEME ?? prefs.theme),
      terminalMode,
    );
    applyTheme(name);
    return name;
  });
  const [keys, setKeys] = useState<Hint[]>([]);
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
      if (age !== null && age > 30) {
        showToast(
          `yt-data's downloader (yt-dlp) is ${age} days old — press Ctrl+U to update it`,
          "error",
        );
      }
    });
  }, [jobList, services, showToast]);

  const panelJobs = pickPanelJobs(jobList);
  const multi = jobList.filter((j) => j.status === "running" || j.status === "queued").length > 1;
  const panelHeight = panelJobs.length ? panelJobs.length + (multi ? 1 : 0) : 0;
  const bodyHeight = Math.max(3, height - 2 - 2 - (toast ? 1 : 0) - panelHeight);

  // themeKey is a deliberate extra dependency: a new context object re-renders every screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
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
      terminalMode,
      setTheme(choice, persist) {
        const name = resolveTheme(choice, terminalMode);
        applyTheme(name);
        setThemeKey(name);
        if (persist) {
          prefs.theme = choice;
          savePrefs(prefs);
        }
      },
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
      labelRecent(value, label) {
        const item = prefs.recent.find((r) => r.kind === "ref" && r.value === value);
        if (item && item.label !== label) {
          item.label = label;
          savePrefs(prefs);
        }
      },
    }),
    [services, prefs, jobs, push, pop, showToast, bodyHeight, width, themeKey, terminalMode],
  );

  const top = stack[stack.length - 1] as Screen;

  useKeyboard((key) => {
    if (KEYLOG) {
      appendFileSync(
        KEYLOG,
        `${JSON.stringify({ t: Date.now(), screen: top.kind, name: key.name, seq: key.sequence, ctrl: key.ctrl, shift: key.shift })}\n`,
      );
    }
    if (key.ctrl && key.name === "c") {
      // Ctrl+C steps out to Home first; on Home it quits.
      if (top.kind !== "home") {
        setStack([{ kind: "home" }]);
        return;
      }
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
    if (key.ctrl && key.name === "k") checkSetup(ui);
    if (key.ctrl && key.name === "u") updateAll(ui);
    // "?" shows every key, except while typing into a field.
    if (
      key.sequence === "?" &&
      !key.ctrl &&
      !TYPING.has(top.kind) &&
      !(top.kind === "browse" && top.model.filtering)
    ) {
      push({ kind: "viewer", title: "Keys", text: KEY_REFERENCE });
    }
  });

  const crumbs = stack.map(crumb).filter(Boolean);
  const status = jobStatus(jobList);
  const footer = fitHints(
    [...keys, ...(top.kind === "home" ? ([["^C", "quit"]] as Hint[]) : [])],
    [["?", "keys"]],
    width - 2,
  );

  return (
    <UiContext.Provider value={ui}>
      <box flexDirection="column" width="100%" height="100%" backgroundColor={theme.bg}>
        <Header crumbs={crumbs} status={status} width={width} />
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
        {panelJobs.length ? (
          <JobsPanel jobs={panelJobs} all={jobList} width={width} showSummary={multi} />
        ) : null}
        <Line fg={theme.faint}>{"─".repeat(width)}</Line>
        <box paddingLeft={1}>
          <Keys keys={footer} />
        </box>
      </box>
    </UiContext.Provider>
  );
}

/** Screens where printable keys go into a text field. */
const TYPING = new Set<Screen["kind"]>(["home", "folder"]);

function checkSetup(ui: Ui) {
  ui.toast("Checking setup…");
  void ui.services.doctor().then((text) => ui.push({ kind: "viewer", title: "Setup check", text }));
}

function updateAll(ui: Ui) {
  ui.toast("Updating yt-data and its downloader (yt-dlp)…");
  void ui.services
    .update()
    .then((text) => {
      ui.toast(text.trim().split("\n")[0] ?? "Updated", "ok");
      ui.push({
        kind: "viewer",
        title: "Update",
        text: `${text}\nRestart yt-data to use a new yt-data version.`,
      });
    })
    .catch((err: Error) => ui.toast(err.message, "error"));
}

export const actions = { checkSetup, updateAll };

/** "yt-data › Marques Brownlee › Xiaomi 18 Pro Max › transcript" with live job status on the right. */
function Header({ crumbs, status, width }: { crumbs: string[]; status: string; width: number }) {
  const room = Math.max(10, width - 2 - 8 - (status ? textWidth(status) + 3 : 0));
  const parts = [...crumbs];
  // Shorten the longest crumb first, only as much as needed.
  for (let guard = 0; guard < 20; guard++) {
    const total = parts.reduce((a, p) => a + textWidth(p) + 3, 0);
    if (total <= room || !parts.length) break;
    let longest = 0;
    parts.forEach((p, i) => {
      if (textWidth(p) > textWidth(parts[longest] ?? "")) longest = i;
    });
    const p = parts[longest] as string;
    parts[longest] = truncate(p, Math.max(6, textWidth(p) - (total - room)));
  }
  const left = 1 + 7 + parts.reduce((a, p) => a + 3 + textWidth(p), 0);
  return (
    <text wrapMode="none" truncate>
      <span fg={theme.accent}>
        <strong> yt-data</strong>
      </span>
      {parts.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional crumbs
        <span key={i}>
          <span fg={theme.faint}> › </span>
          <span fg={i === parts.length - 1 ? theme.fg : theme.dim}>{p}</span>
        </span>
      ))}
      {status ? (
        <span fg={theme.accent}>
          {" ".repeat(Math.max(2, width - left - textWidth(status) - 1)) + status}
        </span>
      ) : null}
    </text>
  );
}

function jobStatus(all: readonly Job[]): string {
  const running = all.filter((j) => j.status === "running").length;
  const queued = all.filter((j) => j.status === "queued").length;
  if (!running && !queued) return "";
  return `↓ ${running} running${queued ? ` · ${queued} queued` : ""}`;
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
    case "download":
      return <DownloadScreen model={screen.model} />;
    case "viewer":
      return <ViewerScreen title={screen.title} text={screen.text} />;
    case "choice":
      return (
        <ChoiceScreen
          title={screen.title}
          options={screen.options}
          initial={screen.initial}
          onPick={screen.onPick}
          onHover={screen.onHover}
          onCancel={screen.onCancel}
        />
      );
    case "folder":
      return <FolderScreen model={screen.model} />;
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
      return s.model.video?.title ?? "video";
    case "browse":
      return s.model.title;
    case "transcript":
      return "transcript";
    case "download":
      return "download";
    case "viewer":
      return s.title.toLowerCase();
    case "settings":
      return "settings";
    case "downloads":
      return "downloads";
    case "folder":
      return "folder";
    case "choice":
      return "";
  }
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

function JobsPanel({
  jobs,
  all,
  width,
  showSummary,
}: {
  jobs: Job[];
  all: readonly Job[];
  width: number;
  showSummary: boolean;
}) {
  const count = (s: Job["status"]) => all.filter((j) => j.status === s).length;
  const summary = [
    count("running") && `${count("running")} running`,
    count("queued") && `${count("queued")} queued`,
    count("done") && `${count("done")} done`,
    count("failed") && `${count("failed")} failed`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <box flexDirection="column">
      {showSummary ? <Line fg={theme.dim}>{` Downloads  ${summary}  ·  ^O all`}</Line> : null}
      {jobs.map((j) => (
        <JobLine key={j.key} job={j} width={width} />
      ))}
    </box>
  );
}

export function JobLine({ job, width, selected }: { job: Job; width: number; selected?: boolean }) {
  const cols = Math.max(20, width - 4);
  const media = job.kind === "video" || job.kind === "audio";
  let icon = "·";
  let color: string = theme.dim;
  let text = "";
  if (job.status === "running") {
    icon = "◆";
    color = theme.accent;
    if (media && job.progress)
      text = progressLine(job.progress, job.kind as "video" | "audio", job.title, cols);
    else if (media)
      text = `  0% ${"─".repeat(Math.min(30, Math.floor(cols / 5)))}  fetching formats  ${job.title}`;
    else text = `${job.kind}…  ${job.title}`;
  } else if (job.status === "queued") {
    text = `queued  ${job.kind}  ${job.title}`;
  } else if (job.status === "done") {
    icon = "✓";
    color = theme.green;
    const took =
      job.startedAt && job.finishedAt ? clock((job.finishedAt - job.startedAt) / 1000) : "";
    const size = job.bytes !== null ? bytes(job.bytes) : "";
    text = [
      job.note ?? "saved",
      job.path ? tildify(job.path) : job.title,
      size,
      took,
      selected ? "" : "· ^O to open folder",
    ]
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
  const existing = prefs.recent.find((r) => r.kind === item.kind && r.value === item.value);
  const next = existing ? { ...item, label: existing.label } : item;
  prefs.recent = [next, ...prefs.recent.filter((r) => r !== existing)].slice(0, 8);
  savePrefs(prefs);
}
