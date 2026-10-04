// All diagnostics go to stderr so stdout stays pure data.

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const ORDER: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

let current: LogLevel = "warn";

export function setLogLevel(level: LogLevel) {
  current = level;
}

function write(level: Exclude<LogLevel, "silent">, msg: string) {
  if (ORDER[level] <= ORDER[current]) process.stderr.write(`tubeline: ${level}: ${msg}\n`);
}

export const log = {
  error: (msg: string) => write("error", msg),
  warn: (msg: string) => write("warn", msg),
  info: (msg: string) => write("info", msg),
  debug: (msg: string) => write("debug", msg),
};
