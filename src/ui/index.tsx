// Entry for the interactive UI (OpenTUI). Loaded lazily by `tubeline ui`.
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { AppContext } from "../core/context.ts";
import { bytes } from "../core/style.ts";
import { App } from "./app.tsx";
import { JobQueue } from "./jobs.ts";
import { loadPrefs } from "./prefs.ts";
import { realServices, type UiServices } from "./services.ts";

export async function runUi(ctx: AppContext): Promise<void> {
  await runWith(realServices(ctx));
}

export async function runWith(services: UiServices): Promise<void> {
  const prefs = loadPrefs();
  const jobs = new JobQueue(services);
  const renderer = await createCliRenderer({ exitOnCtrlC: false, targetFps: 30 });
  // For the "auto" theme: ask the terminal whether its background is light or dark.
  const terminalMode = await renderer.waitForThemeMode(300).catch(() => null);
  const root = createRoot(renderer);
  await new Promise<void>((resolve) => {
    root.render(
      <App
        services={services}
        prefs={prefs}
        jobs={jobs}
        onQuit={resolve}
        terminalMode={terminalMode}
      />,
    );
  });
  root.unmount();
  renderer.destroy();
  // Keep a record in the scrollback of what this session produced.
  const saved = jobs.all().filter((j) => j.status === "done" && j.path);
  const failed = jobs.all().filter((j) => j.status === "failed");
  if (saved.length || failed.length) {
    process.stdout.write("tubeline session:\n");
    for (const j of saved)
      process.stdout.write(`  ✓ ${j.path}${j.bytes !== null ? ` (${bytes(j.bytes)})` : ""}\n`);
    for (const j of failed)
      process.stdout.write(`  ✗ ${j.title}: ${j.error?.message ?? "failed"}\n`);
  }
}
