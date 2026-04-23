#!/usr/bin/env node

import { spawn } from "child_process";
import { createInterface } from "readline/promises";
import { stdin, stdout, argv, env, platform, exit } from "process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const binDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(binDir);
const serverPath = join(packageRoot, "server.js");

function getArg(name) {
  const exact = argv.find((value) => value === name || value.startsWith(`${name}=`));
  if (!exact) return undefined;
  if (exact.includes("=")) return exact.split("=").slice(1).join("=");
  const index = argv.indexOf(exact);
  return index >= 0 ? argv[index + 1] : undefined;
}

function hasFlag(name) {
  return argv.includes(name);
}

function getPort() {
  const raw = getArg("--port") || env.CAMOFOX_PORT || env.PORT || "9377";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 9377;
}

function printBanner(port) {
  console.log("");
  console.log("Camofox Browser");
  console.log("AI-guided localhost studio for anti-detection browser automation.");
  console.log("");
  console.log("What it can do:");
  console.log("- Launch a Camoufox-backed browser server locally");
  console.log("- Create tabs, take snapshots, click, type, scroll, and navigate");
  console.log("- Import cookies for authenticated browsing");
  console.log("- Support OpenClaw agents and direct REST API usage");
  console.log("");
  console.log(`Local studio: http://127.0.0.1:${port}/studio`);
  console.log("");
}

function printUsage() {
  console.log("Usage:");
  console.log("  camofox");
  console.log("  camofox --start");
  console.log("  camofox --help");
  console.log("");
  console.log("Options:");
  console.log("  --port <port>   Override the local server port");
  console.log("  --start         Skip the menu and start the studio immediately");
  console.log("");
}

function printHowToUse(port) {
  console.log("");
  console.log("How to use it:");
  console.log("1. Start the local studio.");
  console.log("2. Open the browser UI or use the REST endpoints.");
  console.log("3. Create a tab, inspect the snapshot, then click/type by ref.");
  console.log("");
  console.log("Quick API examples:");
  console.log(`curl -X POST http://127.0.0.1:${port}/tabs \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"userId":"agent1","sessionKey":"task1","url":"https://example.com"}'`);
  console.log(`curl "http://127.0.0.1:${port}/health"`);
  console.log("");
  console.log("OpenClaw:");
  console.log("  openclaw plugins install @askjo/camofox-browser");
  console.log("");
}

async function openBrowser(url) {
  const commands = {
    win32: ["cmd", ["/c", "start", "", url]],
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
  };

  const entry = commands[platform];
  if (!entry) return false;

  return new Promise((resolve) => {
    try {
      const child = spawn(entry[0], entry[1], {
        detached: true,
        stdio: "ignore",
        shell: false,
      });
      child.unref();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

async function waitForHealth(baseUrl, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return true;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function startServer(port) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: packageRoot,
    env: {
      ...env,
      CAMOFOX_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => {
    const text = data.toString().trim();
    if (text) console.log(text);
  });

  child.stderr.on("data", (data) => {
    const text = data.toString().trim();
    if (text) console.error(text);
  });

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`Studio exited with code ${code}`);
    }
  });

  return child;
}

async function launchStudio(port, openAfterStart = true) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const studioUrl = `${baseUrl}/studio`;
  console.log(`Starting local studio on ${studioUrl} ...`);
  const child = startServer(port);
  const ready = await waitForHealth(baseUrl);

  if (!ready) {
    console.error("Camofox studio did not become ready in time.");
    child.kill();
    return;
  }

  console.log(`Studio is ready at ${studioUrl}`);
  if (openAfterStart) {
    const opened = await openBrowser(studioUrl);
    if (opened) {
      console.log("Opened the browser automatically.");
    } else {
      console.log(`Open this in your browser: ${studioUrl}`);
    }
  } else {
    console.log(`Open this in your browser: ${studioUrl}`);
  }
  console.log("");
  printHowToUse(port);
}

async function runInteractive(port) {
  printBanner(port);

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      console.log("Choose what you want to do:");
      console.log("1) Start the local studio");
      console.log("2) Learn how to use it");
      console.log("3) Show OpenClaw setup");
      console.log("4) Exit");
      console.log("");

      const answer = (await rl.question("Select 1-4: ")).trim();
      console.log("");

      if (answer === "1") {
        const openAnswer = (await rl.question("Open the browser automatically after start? [Y/n]: ")).trim().toLowerCase();
        console.log("");
        await launchStudio(port, openAnswer !== "n" && openAnswer !== "no");
        break;
      }

      if (answer === "2") {
        printHowToUse(port);
        continue;
      }

      if (answer === "3") {
        console.log("OpenClaw setup:");
        console.log("  openclaw plugins install @askjo/camofox-browser");
        console.log("  openclaw camofox start");
        console.log("  openclaw camofox status");
        console.log("");
        console.log("The plugin automatically talks to the local Camofox server and exposes:");
        console.log("  camofox_create_tab, camofox_snapshot, camofox_click, camofox_type,");
        console.log("  camofox_navigate, camofox_scroll, camofox_screenshot, camofox_list_tabs,");
        console.log("  camofox_close_tab, camofox_import_cookies, camofox_evaluate");
        console.log("");
        continue;
      }

      if (answer === "4" || answer === "q" || answer === "quit" || answer === "exit") {
        break;
      }

      console.log("Enter 1, 2, 3, or 4.");
      console.log("");
    }
  } finally {
    rl.close();
  }
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    process.exit(0);
  }

  const port = getPort();
  if (!stdin.isTTY || !stdout.isTTY) {
    printBanner(port);
    printUsage();
    printHowToUse(port);
    return;
  }

  if (hasFlag("--start")) {
    await launchStudio(port, true);
    return;
  }

  await runInteractive(port);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  exit(1);
});
