// Channel tabs, playlists and search results: one list with columns, filter, multi-select
// and bulk actions. State lives in the model so going back restores it.
import { useKeyboard } from "@opentui/react";
import { useEffect, useReducer } from "react";
import { toCliError } from "../../core/errors.ts";
import type { Ref } from "../../core/resolve.ts";
import { compact } from "../../core/style.ts";
import type { Channel } from "../../models/channel.ts";
import type { SearchResult } from "../../models/search.ts";
import type { VideoSummary } from "../../models/video.ts";
import type { ListType, SearchType } from "../../sources/innertube.ts";
import {
  audioWithOptions,
  downloadWithOptions,
  queueThumbnails,
  queueTranscripts,
  queueVideos,
  type Target,
} from "../actions.ts";
import { useKeys, useUi } from "../app.tsx";
import { Line, List } from "../components.tsx";
import { row, searchCells, VIDEO_COLUMNS, videoCells } from "../format.ts";
import { theme } from "../theme.ts";

export type BrowseSource =
  | { kind: "channel"; ref: Ref; tab: ListType }
  | { kind: "playlist"; ref: Ref; title: string }
  | { kind: "search"; query: string; type: SearchType };

type Item = VideoSummary | SearchResult;

interface TabState {
  items: Item[];
  iter: AsyncGenerator<Item> | null;
  exhausted: boolean;
  loading: boolean;
  error: string | null;
  cursor: number;
  filter: string;
  selected: Set<string>;
}

export interface BrowseModel {
  source: BrowseSource;
  title: string;
  channel: Channel | null;
  tabs: Map<string, TabState>;
  filtering: boolean;
}

const CHANNEL_TABS: ListType[] = ["videos", "shorts", "streams", "all"];
const SEARCH_TABS: SearchType[] = ["video", "shorts", "channel", "playlist"];
const PAGE = 30;

export function newBrowse(source: BrowseSource): BrowseModel {
  const title =
    source.kind === "search"
      ? `“${source.query}”`
      : source.kind === "playlist"
        ? source.title
        : "channel";
  return { source, title, channel: null, tabs: new Map(), filtering: false };
}

function tabKey(s: BrowseSource): string {
  return s.kind === "channel" ? s.tab : s.kind === "search" ? s.type : "playlist";
}

function itemKey(item: Item): string {
  return "type" in item && (item.type === "channel" || item.type === "playlist")
    ? `${item.type}:${item.id}`
    : item.id;
}

function itemTitle(item: Item): string {
  return "name" in item ? item.name : item.title;
}

/** Only videos can be downloaded/transcribed in bulk. */
function asTarget(item: Item): Target | null {
  if ("type" in item && (item.type === "channel" || item.type === "playlist")) return null;
  return { id: item.id, title: itemTitle(item) };
}

export function BrowseScreen({ model }: { model: BrowseModel }) {
  const ui = useUi();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const key = tabKey(model.source);
  let tab = model.tabs.get(key);
  if (!tab) {
    tab = {
      items: [],
      iter: null,
      exhausted: false,
      loading: false,
      error: null,
      cursor: 0,
      filter: "",
      selected: new Set(),
    };
    model.tabs.set(key, tab);
  }
  const t = tab;

  const loadMore = async () => {
    if (t.loading || t.exhausted) return;
    t.loading = true;
    redraw();
    try {
      if (!t.iter) {
        const s = model.source;
        t.iter =
          s.kind === "search"
            ? ui.services.search(s.query, s.type)
            : ui.services.listVideos(s.ref, s.kind === "channel" ? s.tab : "videos");
      }
      for (let i = 0; i < PAGE; i++) {
        const next = await t.iter.next();
        if (next.done) {
          t.exhausted = true;
          break;
        }
        t.items.push(next.value);
      }
    } catch (err) {
      const e = toCliError(err);
      t.error = e.hint ? `${e.message} — ${e.hint}` : e.message;
      t.exhausted = true;
    } finally {
      t.loading = false;
      redraw();
    }
  };

  // First page, and the channel header.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per tab
  useEffect(() => {
    if (!t.items.length && !t.exhausted) void loadMore();
    if (model.source.kind === "channel" && !model.channel) {
      ui.services
        .getChannel(model.source.ref)
        .then((c) => {
          model.channel = c;
          model.title = c.name;
          redraw();
        })
        .catch(() => {});
    }
  }, [key]);

  const needle = t.filter.toLowerCase();
  const visible = needle
    ? t.items.filter((i) => itemTitle(i).toLowerCase().includes(needle))
    : t.items;
  const cursor = Math.min(t.cursor, Math.max(0, visible.length - 1));

  // Keep a page ahead of the cursor.
  useEffect(() => {
    if (!needle && cursor >= visible.length - 5) void loadMore();
  });

  const targets = (): Target[] => {
    const chosen = t.selected.size
      ? t.items.filter((i) => t.selected.has(itemKey(i)))
      : visible[cursor]
        ? [visible[cursor] as Item]
        : [];
    return chosen.map(asTarget).filter((x): x is Target => x !== null);
  };

  const withTargets = (fn: (ts: Target[]) => void) => {
    const ts = targets();
    if (!ts.length) return ui.toast("Select one or more videos first", "error");
    fn(ts);
    t.selected.clear();
  };

  const switchTab = (dir: 1 | -1) => {
    const s = model.source;
    if (s.kind === "channel") {
      const i = CHANNEL_TABS.indexOf(s.tab);
      model.source = {
        ...s,
        tab: CHANNEL_TABS[(i + dir + CHANNEL_TABS.length) % CHANNEL_TABS.length] as ListType,
      };
    } else if (s.kind === "search") {
      const i = SEARCH_TABS.indexOf(s.type);
      model.source = {
        ...s,
        type: SEARCH_TABS[(i + dir + SEARCH_TABS.length) % SEARCH_TABS.length] as SearchType,
      };
    }
    redraw();
  };

  const open = (item: Item) => {
    if ("type" in item && item.type === "channel")
      return ui.openChannel({ kind: "channel", id: item.id });
    if ("type" in item && item.type === "playlist")
      return ui.openRef({ kind: "playlist", id: item.id }, item.title);
    ui.push({ kind: "video", model: { id: item.id, video: null, error: null, cursor: 0 } });
  };

  const bulk = t.selected.size ? ` ${t.selected.size} selected` : "";
  useKeys(
    model.filtering
      ? [
          ["Enter", "keep filter"],
          ["Esc", "clear"],
        ]
      : [
          ["Enter", "open"],
          ["space", "select"],
          ["d", `video${bulk}`],
          ["a", "audio"],
          ["t", "transcripts"],
          ["i", "thumbs"],
          ["/", "filter"],
          ...(model.source.kind !== "playlist" ? ([["Tab", "switch"]] as [string, string][]) : []),
          ["Esc", "back"],
        ],
  );

  useKeyboard((k) => {
    if (k.ctrl || k.meta) return;
    if (model.filtering) {
      if (k.name === "escape") {
        t.filter = "";
        model.filtering = false;
      } else if (k.name === "return") model.filtering = false;
      else if (k.name === "backspace") t.filter = t.filter.slice(0, -1);
      else if (k.sequence && k.sequence.length === 1 && !k.ctrl && k.sequence >= " ")
        t.filter += k.sequence;
      t.cursor = 0;
      return redraw();
    }
    const page = Math.max(1, ui.bodyHeight - 4);
    switch (k.name) {
      case "up":
        t.cursor = Math.max(0, cursor - 1);
        break;
      case "down":
        t.cursor = Math.min(visible.length - 1, cursor + 1);
        break;
      case "pageup":
        t.cursor = Math.max(0, cursor - page);
        break;
      case "pagedown":
        t.cursor = Math.min(visible.length - 1, cursor + page);
        break;
      case "home":
        t.cursor = 0;
        break;
      case "end":
        t.cursor = visible.length - 1;
        break;
      case "return":
        if (visible[cursor]) open(visible[cursor] as Item);
        break;
      case "space": {
        const item = visible[cursor];
        if (item && asTarget(item)) {
          const id = itemKey(item);
          if (t.selected.has(id)) t.selected.delete(id);
          else t.selected.add(id);
          t.cursor = Math.min(visible.length - 1, cursor + 1);
        }
        break;
      }
      case "tab":
        switchTab(k.shift ? -1 : 1);
        return;
      case "escape":
        if (t.selected.size) t.selected.clear();
        else if (t.filter) t.filter = "";
        else return ui.pop();
        break;
      case "d":
        withTargets((ts) => (k.shift ? downloadWithOptions(ui, ts) : queueVideos(ui, ts, "video")));
        break;
      case "a":
        withTargets((ts) => (k.shift ? audioWithOptions(ui, ts) : queueVideos(ui, ts, "audio")));
        break;
      case "t":
        withTargets((ts) => queueTranscripts(ui, ts));
        break;
      case "i":
        withTargets((ts) => queueThumbnails(ui, ts));
        break;
      default:
        if (k.sequence === "/") model.filtering = true;
        else if (k.sequence === "*") {
          const all = visible.filter((i) => asTarget(i)).map(itemKey);
          const allSelected = all.every((id) => t.selected.has(id));
          for (const id of all) allSelected ? t.selected.delete(id) : t.selected.add(id);
        }
    }
    redraw();
  });

  const w = Math.max(20, ui.width - 6);
  const s = model.source;
  const tabs = s.kind === "channel" ? CHANNEL_TABS : s.kind === "search" ? SEARCH_TABS : [];
  const current = s.kind === "channel" ? s.tab : s.kind === "search" ? s.type : "";
  const ch = model.channel;
  const status = [
    `${t.items.length}${t.exhausted ? "" : "+"} loaded`,
    t.loading ? "loading…" : null,
    t.filter ? `filter “${t.filter}” (${visible.length})` : null,
    t.selected.size ? `${t.selected.size} selected` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const isSearch = s.kind === "search";

  return (
    <box flexDirection="column">
      <text wrapMode="none" truncate>
        <span fg={theme.fg}>
          <strong>{s.kind === "search" ? `Search ${model.title}` : model.title}</strong>
        </span>
        <span fg={theme.accent}>{ch?.isVerified ? " ✓" : ""}</span>
        <span fg={theme.dim}>
          {ch ? `  ${ch.handle ?? ""}  ${compact(ch.subscriberCount)} subscribers` : ""}
        </span>
      </text>
      <text wrapMode="none" truncate>
        {tabs.map((name, i) => (
          <span key={name} fg={name === current ? theme.accent : theme.dim}>
            {`${i ? "  " : ""}${name === current ? `[${name}]` : ` ${name} `}`}
          </span>
        ))}
        <span fg={theme.dim}>{`${tabs.length ? "    " : ""}${status}`}</span>
      </text>
      {model.filtering ? (
        <Line fg={theme.yellow}>{`/ ${t.filter}█`}</Line>
      ) : (
        <Line fg={theme.faint}>
          {`${t.selected.size ? "    " : "  "}${row(["length", "views", "age", isSearch ? "title · channel" : "title"], VIDEO_COLUMNS, w)}`}
        </Line>
      )}
      {t.error ? <Line fg={theme.red}>{`✗ ${t.error}`}</Line> : null}
      <List
        rows={visible.map((item) => ({
          key: itemKey(item),
          text: row(
            isSearch ? searchCells(item as SearchResult) : videoCells(item as VideoSummary),
            VIDEO_COLUMNS,
            w,
          ),
          color: "type" in item && item.type !== "video" && isSearch ? theme.cyan : undefined,
        }))}
        cursor={cursor}
        height={ui.bodyHeight - 3 - (t.error ? 1 : 0)}
        selected={t.selected}
        showMarks={t.selected.size > 0}
        empty={t.loading ? "Loading…" : t.filter ? "No matches." : "Nothing here."}
      />
    </box>
  );
}
