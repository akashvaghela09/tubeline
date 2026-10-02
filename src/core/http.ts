// fetch wrapper: retries with exponential backoff + jitter, optional proxy,
// and maps transport failures to typed errors.
import { CliError } from "./errors.ts";
import { log } from "./log.ts";

export type FetchFn = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;

export interface HttpOptions {
  proxy?: string;
  retries?: number;
  baseDelayMs?: number;
  fetch?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function createFetch(opts: HttpOptions = {}): FetchFn {
  const retries = opts.retries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    for (let attempt = 0; ; attempt++) {
      // A Request body can only be read once, so clone it for every attempt.
      const req = (input instanceof Request ? input.clone() : input) as typeof input;
      let res: Response;
      try {
        res = await doFetch(
          req,
          opts.proxy ? ({ ...init, proxy: opts.proxy } as RequestInit) : init,
        );
      } catch (err) {
        if (attempt < retries) {
          log.debug(`network error on ${url}: ${(err as Error).message}; retrying`);
          await sleep(backoff(baseDelay, attempt));
          continue;
        }
        throw new CliError(
          "NETWORK",
          `Network error: ${(err as Error).message}`,
          opts.proxy ? "Check the --proxy setting" : "Check your internet connection",
        );
      }

      if (!RETRYABLE.has(res.status)) return res;
      if (attempt >= retries) {
        if (res.status === 429) {
          throw new CliError(
            "RATE_LIMITED",
            "YouTube rate-limited this client (HTTP 429)",
            "Wait and retry, or use --cookies / --proxy",
          );
        }
        return res;
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30_000)
          : backoff(baseDelay, attempt);
      log.debug(
        `HTTP ${res.status} on ${url}; retry ${attempt + 1}/${retries} in ${Math.round(delay)}ms`,
      );
      await sleep(delay);
    }
  };
}

function backoff(base: number, attempt: number): number {
  return base * 2 ** attempt * (0.5 + Math.random());
}
