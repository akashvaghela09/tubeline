// Per-invocation state shared by commands: effective config and a lazily created client.

import { join } from "node:path";
import pkg from "../../package.json";
import { createInnertube, InnertubeSource } from "../sources/innertube.ts";
import { ResponseCache } from "./cache.ts";
import { type Config, type GlobalFlags, loadConfig } from "./config.ts";
import { loadCookieHeader } from "./cookies.ts";
import { createFetch } from "./http.ts";
import { setLogLevel } from "./log.ts";

export class AppContext {
  readonly config: Config;
  private source?: Promise<InnertubeSource>;

  constructor(flags: GlobalFlags, env: NodeJS.ProcessEnv = process.env) {
    this.config = loadConfig(flags, env);
    setLogLevel(this.config.logLevel);
  }

  innertube(): Promise<InnertubeSource> {
    this.source ??= (async () => {
      const { config } = this;
      const yt = await createInnertube({
        region: config.region,
        fetch: createFetch({ proxy: config.proxy }),
        cookie: config.cookies ? loadCookieHeader(config.cookies) : undefined,
        cacheDir: config.noCache ? undefined : config.cacheDir,
      });
      const cache = new ResponseCache(
        join(config.cacheDir, "responses"),
        config.cacheMode,
        pkg.version,
      );
      return new InnertubeSource(yt, cache);
    })();
    return this.source;
  }
}
