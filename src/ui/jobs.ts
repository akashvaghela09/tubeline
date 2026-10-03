// The download queue: video/audio downloads, transcripts and thumbnails run one at a time
// in the background while the user keeps browsing. Screens subscribe for redraws.
import type { CliError } from "../core/errors.ts";
import { toCliError } from "../core/errors.ts";
import type { Progress } from "../services/download.ts";
import type { DownloadSpec, UiServices } from "./services.ts";

export type JobKind = "video" | "audio" | "transcript" | "thumbnail";
export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface Job {
  key: number;
  kind: JobKind;
  videoId: string;
  title: string;
  status: JobStatus;
  progress: Progress | null;
  /** Saved file, when done. */
  path: string | null;
  note: string | null;
  error: CliError | null;
  startedAt: number | null;
  finishedAt: number | null;
  bytes: number | null;
}

export type JobTask =
  | { kind: "video" | "audio"; spec: DownloadSpec }
  | { kind: "transcript" | "thumbnail"; run: () => Promise<string> };

const NOTIFY_MS = 100;

export class JobQueue {
  private jobs: Job[] = [];
  private tasks = new Map<number, JobTask>();
  private next = 1;
  private running: { key: number; abort: AbortController } | null = null;
  private listeners = new Set<() => void>();
  private snapshot: readonly Job[] = [];
  private pending: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly services: UiServices) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): readonly Job[] => this.snapshot;

  add(videoId: string, title: string, task: JobTask): Job {
    const job: Job = {
      key: this.next++,
      kind: task.kind,
      videoId,
      title,
      status: "queued",
      progress: null,
      path: null,
      note: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      bytes: null,
    };
    this.jobs.push(job);
    this.tasks.set(job.key, task);
    this.emit(true);
    void this.pump();
    return job;
  }

  /** Cancel one job (the running one is stopped and its partial files removed). */
  cancel(key: number) {
    const job = this.jobs.find((j) => j.key === key);
    if (!job) return;
    if (job.status === "queued") this.finish(job, "cancelled");
    else if (job.status === "running" && this.running?.key === key) this.running.abort.abort();
  }

  cancelAll() {
    for (const j of this.jobs) if (j.status === "queued") this.finish(j, "cancelled");
    this.running?.abort.abort();
  }

  retry(key: number) {
    const job = this.jobs.find((j) => j.key === key);
    const task = this.tasks.get(key);
    if (!job || !task || (job.status !== "failed" && job.status !== "cancelled")) return;
    this.add(job.videoId, job.title, task);
  }

  active(): Job[] {
    return this.jobs.filter((j) => j.status === "queued" || j.status === "running");
  }

  all(): readonly Job[] {
    return this.jobs;
  }

  private async pump() {
    if (this.running) return;
    const job = this.jobs.find((j) => j.status === "queued");
    if (!job) return;
    const task = this.tasks.get(job.key) as JobTask;
    const abort = new AbortController();
    this.running = { key: job.key, abort };
    job.status = "running";
    job.startedAt = Date.now();
    this.emit(true);
    try {
      if ("spec" in task) {
        const result = await this.services.download(
          job.videoId,
          task.spec,
          (p) => {
            job.progress = p;
            this.emit(false);
          },
          abort.signal,
        );
        job.path = result.path;
        job.bytes = result.sizeBytes;
        if (result.alreadyDownloaded) job.note = "already downloaded";
      } else {
        job.path = await task.run();
      }
      this.finish(job, "done");
    } catch (err) {
      if (abort.signal.aborted) this.finish(job, "cancelled");
      else {
        job.error = toCliError(err);
        this.finish(job, "failed");
      }
    } finally {
      this.running = null;
      void this.pump();
    }
  }

  private finish(job: Job, status: JobStatus) {
    job.status = status;
    job.finishedAt = Date.now();
    this.emit(true);
  }

  /** Progress lines arrive many times a second; redraw at most every 100 ms. */
  private emit(now: boolean) {
    const flush = () => {
      this.pending = null;
      this.snapshot = this.jobs.map((j) => ({ ...j }));
      for (const fn of this.listeners) fn();
    };
    if (now) {
      if (this.pending) clearTimeout(this.pending);
      flush();
    } else if (!this.pending) {
      this.pending = setTimeout(flush, NOTIFY_MS);
    }
  }
}
