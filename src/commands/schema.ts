import type { Command } from "commander";
import { CliError } from "../core/errors.ts";
import { jsonSchema, SCHEMAS } from "../models/index.ts";

export function registerSchema(program: Command) {
  program
    .command("schema")
    .summary("JSON Schema of a command's output")
    .description(
      "Print the JSON Schema (draft 2020-12) of a command's output. Without a name, list the available schemas.",
    )
    .argument("[name]", "schema name, e.g. video, videos, transcript, error")
    .option("--all", "print every schema as one object keyed by name")
    .addHelpText(
      "after",
      `
Examples:
  yt-data schema              # list
  yt-data schema video
  yt-data schema --all > schemas.json`,
    )
    .action((name: string | undefined, opts: { all?: boolean }) => {
      const pretty = process.stdout.isTTY ? 2 : undefined;
      if (opts.all) {
        const all = Object.fromEntries(SCHEMAS.map((e) => [e.name, jsonSchema(e)]));
        process.stdout.write(`${JSON.stringify(all, null, pretty)}\n`);
        return;
      }
      if (!name) {
        process.stdout.write(
          `${JSON.stringify(
            SCHEMAS.map(({ name, summary }) => ({ name, summary })),
            null,
            pretty,
          )}\n`,
        );
        return;
      }
      const entry = SCHEMAS.find((e) => e.name === name);
      if (!entry) {
        throw new CliError(
          "USAGE",
          `Unknown schema "${name}"`,
          `Available: ${SCHEMAS.map((e) => e.name).join(", ")}`,
        );
      }
      process.stdout.write(`${JSON.stringify(jsonSchema(entry), null, pretty)}\n`);
    });
}
