import type { Command } from "commander";
import type { AppContext } from "../core/context.ts";
import { channelHuman } from "../core/human.ts";
import { parseRef } from "../core/resolve.ts";
import { runForRefs } from "../core/run.ts";

export function registerChannel(program: Command, getCtx: () => AppContext) {
  program
    .command("channel")
    .summary("channel details")
    .description(
      "Fetch channel details: name, handle, description, subscriber/video/view counts, join date, country, links, avatar and banner.",
    )
    .argument("<refs...>", "@handle, channel URL, UC… id, or - to read refs from stdin")
    .option("--fields <list>", "comma-separated fields to keep (dot paths allowed)")
    .addHelpText(
      "after",
      `
Examples:
  tubeline channel @mkbhd
  tubeline channel https://www.youtube.com/@mkbhd --fields name,subscriberCount,videoCount
  tubeline channel UCBJycsmduvYEL83R_U4JriQ @LinusTechTips --format table

Output schema: tubeline schema channel`,
    )
    .action(async (refs: string[], opts: { fields?: string }) => {
      const ctx = getCtx();
      await runForRefs(ctx, refs, { ...opts, human: channelHuman }, async (ref) => {
        const parsed = parseRef(ref);
        return (await ctx.innertube()).getChannel(parsed);
      });
    });
}
