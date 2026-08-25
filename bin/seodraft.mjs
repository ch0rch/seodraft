#!/usr/bin/env node
/**
 * seodraft CLI.
 *
 *   seodraft install [--providers=a,b] [--scope=project|global]
 *   seodraft update  [--providers=a,b] [--scope=project|global]
 *   seodraft audit    [args...]   -> skill/scripts/audit.mjs
 *   seodraft gate     <file> [--term "..."]
 *   seodraft keywords volume|suggest [args...]
 *
 * audit/gate/keywords delegate to the same deterministic scripts the skill
 * uses, so CI can run them without any harness installed.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runInstall } from "../src/installer/install.mjs";
import { PRODUCT_NAME } from "../src/installer/providers.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (const arg of args) {
    const match = arg.match(/^--([a-z-]+)=(.*)$/);
    if (match) flags[match[1]] = match[2];
    else rest.push(arg);
  }
  return { flags, rest };
}

function delegate(scriptName, args) {
  const script = path.join(packageRoot, "skill", "scripts", scriptName);
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

const [command, ...args] = process.argv.slice(2);
const { flags, rest } = parseFlags(args);

switch (command) {
  case "install":
  case "update": {
    // update is a re-copy over the existing install — same operation.
    const code = await runInstall({ providersFlag: flags.providers ?? null, scope: flags.scope ?? "project" });
    process.exit(code);
    break;
  }
  case "audit":
    delegate("audit.mjs", args);
    break;
  case "gate":
    delegate("gate.mjs", args);
    break;
  case "keywords":
    delegate("dataforseo.mjs", args);
    break;
  case "state":
    delegate("state.mjs", args);
    break;
  default:
    process.stderr.write(
      [
        `usage: ${PRODUCT_NAME} <command>`,
        "",
        "  install   [--providers=claude,codex,cursor,gemini,opencode] [--scope=project|global]",
        "  update    re-copy the skill over an existing install",
        "  audit     [--file <path>]           deterministic content audit (CI-friendly)",
        '  gate      <file> [--term "<term>"]  pre-publish gate, exit 1 on failure',
        '  keywords  volume "t1" "t2" | suggest "seed"',
        "  state     validate",
        "",
        `then, inside your agent: /${PRODUCT_NAME} init`,
      ].join("\n") + "\n",
    );
    process.exit(command ? 1 : 0);
}
