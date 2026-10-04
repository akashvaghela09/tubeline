// Per-OS config / cache / data directories (XDG on Linux).
import { homedir } from "node:os";
import { join } from "node:path";

const APP = "tubeline";

export interface AppPaths {
  config: string;
  cache: string;
  data: string;
}

export function appPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): AppPaths {
  const home = homedir();
  if (platform === "darwin") {
    const support = join(home, "Library", "Application Support", APP);
    return { config: support, cache: join(home, "Library", "Caches", APP), data: support };
  }
  if (platform === "win32") {
    const roaming = env.APPDATA ?? join(home, "AppData", "Roaming");
    const local = env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return { config: join(roaming, APP), cache: join(local, APP, "cache"), data: join(local, APP) };
  }
  return {
    config: join(env.XDG_CONFIG_HOME || join(home, ".config"), APP),
    cache: join(env.XDG_CACHE_HOME || join(home, ".cache"), APP),
    data: join(env.XDG_DATA_HOME || join(home, ".local", "share"), APP),
  };
}
