// Netscape cookies.txt → Cookie header for youtube.com requests.
import { readFileSync } from "node:fs";
import { CliError } from "./errors.ts";

export function parseNetscapeCookies(text: string, nowSeconds = Date.now() / 1000): string {
  const pairs: string[] = [];
  for (let line of text.split(/\r?\n/)) {
    // curl/yt-dlp mark HttpOnly cookies with this prefix; they're still valid cookies.
    if (line.startsWith("#HttpOnly_")) line = line.slice("#HttpOnly_".length);
    if (!line.trim() || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length < 7) continue;
    const [domain, , , , expires, name, value] = parts as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const host = domain.replace(/^\./, "");
    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) continue;
    const exp = Number(expires);
    if (exp > 0 && exp < nowSeconds) continue;
    pairs.push(`${name}=${value}`);
  }
  return pairs.join("; ");
}

export function loadCookieHeader(path: string): string {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new CliError("USAGE", `Cannot read cookies file ${path}: ${(err as Error).message}`);
  }
  const header = parseNetscapeCookies(text);
  if (!header) {
    throw new CliError(
      "USAGE",
      `No valid youtube.com cookies in ${path}`,
      "Export cookies in Netscape cookies.txt format while logged in to youtube.com",
    );
  }
  return header;
}
