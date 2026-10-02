import { type Command, Option } from "commander";
import type { AppContext } from "../core/context.ts";
import { type CliError, toCliError } from "../core/errors.ts";
import { log } from "../core/log.ts";
import { parseFields, render } from "../core/output.ts";
import { selfStatus, updateSelf } from "../update/self.ts";
import {
  systemUpgradeHint,
  updateYtDlp,
  YTDLP_CHANNELS,
  type YtDlpChannel,
  ytDlpStatus,
} from "../update/ytdlp.ts";

interface UpdateOptions {
  self?: boolean;
  ytDlp?: boolean;
  check?: boolean;
  ytDlpChannel: YtDlpChannel;
  fields?: string;
}

export function registerUpdate(program: Command, getCtx: () => AppContext) {
  program
    .command("update")
    .summary("update yt-data and the managed yt-dlp")
    .description(
      "Update yt-data itself (release binaries only) and install/update the managed yt-dlp. Downloads are verified against published SHA-256 checksums and swapped in atomically. A system-installed yt-dlp is never modified.",
    )
    .option("--self", "only update yt-data")
    .option("--yt-dlp", "only install/update the managed yt-dlp")
    .option("--check", "report available updates without changing anything")
    .addOption(
      new Option("--yt-dlp-channel <channel>", "yt-dlp release channel")
        .choices(Object.keys(YTDLP_CHANNELS))
        .default("stable"),
    )
    .option("--fields <list>", "comma-separated fields to keep (dot paths allowed)")
    .addHelpText(
      "after",
      `
Examples:
  yt-data update                 # both
  yt-data update --check         # what would change
  yt-data update --yt-dlp --yt-dlp-channel nightly

Output: {self: {...}, ytDlp: {...}} with an "action" of installed / updated / current / skipped.
Once installed, the managed yt-dlp is used in preference to one on PATH.`,
    )
    .action(async (opts: UpdateOptions) => {
      const ctx = getCtx();
      const both = !opts.self && !opts.ytDlp;
      const doSelf = both || !!opts.self;
      const doYtDlp = both || !!opts.ytDlp;
      const result: Record<string, unknown> = {};
      let firstError: CliError | undefined;

      const step = async (key: string, explicit: boolean, fn: () => Promise<unknown>) => {
        try {
          result[key] = await fn();
        } catch (err) {
          const e = toCliError(err);
          // When updating everything, "can't self-update from source" is a skip, not a failure.
          if (!explicit && e.code === "USAGE") {
            result[key] = { action: "skipped", reason: e.message, hint: e.hint ?? null };
            return;
          }
          firstError ??= e;
          result[key] = { action: "failed", ...e.toJSON().error };
        }
      };

      if (opts.check) {
        if (doSelf) await step("self", !!opts.self, () => selfStatus(ctx.fetch));
        if (doYtDlp)
          await step("ytDlp", !!opts.ytDlp, () => ytDlpStatus(ctx.fetch, opts.ytDlpChannel));
      } else {
        if (doSelf) await step("self", !!opts.self, () => updateSelf(ctx.fetch));
        if (doYtDlp) {
          await step("ytDlp", !!opts.ytDlp, async () => {
            const status = await ytDlpStatus(ctx.fetch, opts.ytDlpChannel);
            const res = await updateYtDlp(ctx.fetch, opts.ytDlpChannel);
            const system = status.active?.kind === "system" ? status.active : null;
            if (system)
              log.info(
                `a system yt-dlp ${system.version ?? ""} at ${system.path} is now shadowed by the managed copy`,
              );
            return system
              ? {
                  ...res,
                  systemYtDlp: {
                    path: system.path,
                    version: system.version,
                    upgrade: systemUpgradeHint(system.path),
                  },
                }
              : res;
          });
        }
      }

      process.stdout.write(
        render([result], {
          format: ctx.config.format,
          fields: parseFields(opts.fields),
          single: true,
          pretty: process.stdout.isTTY,
        }),
      );
      if (firstError) process.exitCode = firstError.exitCode;
    });
}
