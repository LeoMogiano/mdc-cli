#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./tui/App.js";
import { runHeadless } from "./headless.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    const { waitUntilExit } = render(React.createElement(App));
    await waitUntilExit();
    return;
  }
  const code = await runHeadless(args);
  process.exit(code);
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
