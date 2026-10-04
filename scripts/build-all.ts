// Cross-compiles release binaries into dist/ and writes dist/SHA256SUMS.
// Asset names must match what `tubeline update` and install.sh look for: tubeline-<os>-<arch>[.exe]
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { $ } from "bun";

const targets = [
  { target: "bun-linux-x64", asset: "tubeline-linux-x64" },
  { target: "bun-linux-arm64", asset: "tubeline-linux-arm64" },
  { target: "bun-darwin-x64", asset: "tubeline-darwin-x64" },
  { target: "bun-darwin-arm64", asset: "tubeline-darwin-arm64" },
  { target: "bun-windows-x64", asset: "tubeline-windows-x64.exe" },
];

await mkdir("dist", { recursive: true });

const sums: string[] = [];
for (const { target, asset } of targets) {
  console.error(`building ${asset}`);
  await $`bun build src/cli.ts --compile --minify --target=${target} --outfile dist/${asset}`.quiet();
  const hash = createHash("sha256")
    .update(await readFile(`dist/${asset}`))
    .digest("hex");
  sums.push(`${hash}  ${asset}`);
}

await writeFile("dist/SHA256SUMS", `${sums.join("\n")}\n`);
console.error("wrote dist/SHA256SUMS");
