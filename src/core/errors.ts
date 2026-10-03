// Typed errors that map 1:1 to the exit codes documented in docs/cli.md.

export const EXIT_CODES = {
  INTERNAL: 1,
  USAGE: 2,
  NOT_FOUND: 3,
  RATE_LIMITED: 4,
  UNAVAILABLE: 5,
  MISSING_DEPENDENCY: 6,
  NETWORK: 7,
} as const;

export type ErrorCode = keyof typeof EXIT_CODES;

export class CliError extends Error {
  override name = "CliError";

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }

  get exitCode(): number {
    return EXIT_CODES[this.code];
  }

  toJSON(ref?: string) {
    return {
      error: {
        code: this.code,
        message: this.message,
        hint: this.hint ?? null,
        ...(ref ? { ref } : {}),
      },
    };
  }
}

export function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new CliError("INTERNAL", message);
}

let humanErrors = false;

/** Readable errors for people at a terminal; JSON lines everywhere else. */
export function setHumanErrors(on: boolean) {
  humanErrors = on;
}

export function formatError(err: CliError, ref?: string): string {
  if (!humanErrors) return `${JSON.stringify(err.toJSON(ref))}\n`;
  const red =
    process.stderr.isTTY && !process.env.NO_COLOR
      ? (s: string) => `\x1b[31m${s}\x1b[39m`
      : (s: string) => s;
  const where = ref ? ` (${ref})` : "";
  return `${red("✗")} ${err.message}${where}\n${err.hint ? `  → ${err.hint}\n` : ""}`;
}
