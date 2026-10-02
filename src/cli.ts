#!/usr/bin/env bun
// Entry point. Commands are registered here as they land — see docs/plan.md for the roadmap.
import pkg from "../package.json";

const args = process.argv.slice(2);

if (args[0] === "--version" || args[0] === "-V") {
  console.log(pkg.version);
  process.exit(0);
}

console.error("yt-data: not implemented yet — see docs/plan.md");
process.exit(1);
