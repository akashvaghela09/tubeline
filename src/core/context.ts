// Per-invocation state shared by commands: effective config, HTTP, cache and a lazily
// created InnerTube client.
import { join } from "node:path";
import pkg from "../../package.json";
import { createInnertube, InnertubeSource } from "../sources/innertube.ts";
import type { YtDlpOptions } from "../sources/ytdlp.ts";
import { ResponseCache } from "./cache.ts";
import { type Config, type GlobalFlags, loadConfig } from "./config.ts";
import { loadCookieHeader } from "./cookies.ts";
import { setHumanErrors } from "./errors.ts";
import { createFetch, type FetchFn } from "./http.ts";
import { setLogLevel } from "./log.ts";
import { setColor } from "./style.ts";

export class AppContext {
  readonly config: Config;
  readonly fetch: FetchFn;
  readonly cache: ResponseCache;
  private source?: Promise<InnertubeSource>;

  constructor(flags: GlobalFlags, env: NodeJS.ProcessEnv = process.env) {
    this.config = loadConfig(flags, env);
    setLogLevel(this.config.logLevel);
    const human = this.config.format === "human";
    setColor(human && !!process.stdout.isTTY && !env.NO_COLOR);
    setHumanErrors(human && !!process.stderr.isTTY);
    this.fetch = createFetch({ proxy: this.config.proxy });
    this.cache = new ResponseCache(
      join(this.config.cacheDir, "responses"),
      this.config.cacheMode,
      pkg.version,
    );
  }

  /** Options forwarded to every yt-dlp invocation. */
  get ytdlp(): YtDlpOptions {
    const { proxy, cookies, cookiesFromBrowser } = this.config;
    return { proxy, cookies, cookiesFromBrowser };
  }

  innertube(): Promise<InnertubeSource> {
    this.source ??= (async () => {
      const { config } = this;
      const yt = await createInnertube({
        region: config.region,
        fetch: this.fetch,
        cookie: config.cookies ? loadCookieHeader(config.cookies) : undefined,
        cacheDir: config.noCache ? undefined : config.cacheDir,
      });
      return new InnertubeSource(yt, this.cache);
    })();
    return this.source;
  }
}
