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
