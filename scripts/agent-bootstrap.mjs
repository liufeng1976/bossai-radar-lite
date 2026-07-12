#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_URL = "https://github.com/liufeng1976/bossai-radar-lite";
const MCP_NAME = "bossai-radar";
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageMeta = JSON.parse(readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

const requestedAgent = String(options.agent || "auto").toLowerCase();
const language = options.language === "en" ? "en" : "zh";
const installDir = path.resolve(String(options["install-dir"] || process.env.RADAR_LITE_HOME || path.join(os.homedir(), ".bossai-radar-lite")));
const apiUrl = String(options["api-url"] || "http://127.0.0.1:3080").replace(/\/$/, "");
const scope = ["local", "user", "project"].includes(String(options.scope)) ? String(options.scope) : "user";
const enableScan = booleanOption(options["enable-scan"], false);
const enableLeadWrite = booleanOption(options["enable-lead-write"], false);
const dryRun = booleanOption(options["dry-run"], false);
const skipService = booleanOption(options["skip-service"], false);
const skipAgentConfig = booleanOption(options["skip-agent-config"], false);
const skipDeps = booleanOption(options["skip-deps"], false);
const skipVerify = booleanOption(options["skip-verify"], false);
const force = booleanOption(options.force, false);
const workspace = options.workspace ? path.resolve(String(options.workspace)) : null;
const agents = resolveAgents(requestedAgent);
const summary = {
  ok: false,
  repository: REPO_URL,
  version: packageMeta.version,
  sourceRoot,
  installDir,
  apiUrl,
  language,
  agents,
  permissions: { scan: enableScan, leadWrite: enableLeadWrite, delete: false },
  dryRun,
  steps: [],
  warnings: [],
};

try {
  checkNodeVersion();
  if (dryRun) {
    summary.steps.push({ step: "plan", status: "ok", detail: plannedActions() });
    summary.ok = true;
    printSummary(summary);
    process.exit(0);
  }

  if (!samePath(sourceRoot, installDir) && installDir.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error("--install-dir cannot be nested inside the source repository.");
  }
  const apiHost = new URL(apiUrl).hostname;
  if (!skipService && !isLocalHost(apiHost)) {
    throw new Error("Automatic service startup is only supported for localhost URLs. Use --skip-service for a remote Radar API.");
  }

  await installFiles();
  if (!skipDeps) {
    if (hasBuildSources(installDir)) {
      runDependencyInstall("dev");
      runNpm(["run", "build"], "Build Radar Lite");
      summary.steps.push({ step: "build", status: "ok", mode: "source" });
    } else {
      requireFile(path.join(installDir, "dist", "src", "server.js"), "Neither build sources nor a production build are available.");
      runDependencyInstall("prod");
      summary.steps.push({ step: "build", status: "ok", mode: "prebuilt-runtime" });
    }
  } else {
    requireFile(path.join(installDir, "dist", "src", "server.js"), "Production build is missing while --skip-deps is enabled.");
    summary.steps.push({ step: "build", status: "skipped" });
  }

  const envState = configureEnvironment();
  summary.steps.push({ step: "environment", status: "ok", generatedAdminKey: envState.generatedAdminKey });

  if (!skipService) {
    const service = runJson(process.execPath, [path.join(installDir, "scripts", "radar-service.mjs"), "restart", "--api-url", apiUrl], {
      cwd: installDir,
      label: "Start Radar service",
    });
    summary.steps.push({ step: "service", status: service.running ? "ok" : "failed", detail: service });
    if (!service.running) throw new Error("Radar service did not become healthy.");
  } else {
    summary.steps.push({ step: "service", status: "skipped" });
  }

  if (!skipAgentConfig) {
    for (const agent of agents) await configureAgent(agent, envState.values);
  } else {
    summary.steps.push({ step: "agent-config", status: "skipped" });
  }

  if (!skipVerify) {
    const health = runJson(process.execPath, [path.join(installDir, "dist", "src", "agent-cli.js"), "health"], {
      cwd: installDir,
      env: envState.values,
      label: "Verify Radar health through Agent CLI",
    });
    if (!health.ok || !health.data?.ok) throw new Error("Agent CLI health verification failed.");
    if (health.data.version !== packageMeta.version) {
      throw new Error(`Installed v${packageMeta.version}, but the running Radar API reports v${health.data.version}. Stop the old Radar service or use a different --api-url, then run the installer again.`);
    }
    summary.steps.push({ step: "verification", status: "ok", version: health.data.version });
  } else {
    summary.steps.push({ step: "verification", status: "skipped" });
  }
  summary.ok = true;
  printSummary(summary);
} catch (error) {
  summary.error = error instanceof Error ? error.message : String(error);
  printSummary(summary, true);
}

async function installFiles() {
  if (samePath(sourceRoot, installDir)) {
    summary.steps.push({ step: "files", status: "ok", detail: "Using the current repository in place." });
    return;
  }
  await mkdir(installDir, { recursive: true });
  await cp(sourceRoot, installDir, {
    recursive: true,
    force: true,
    filter: (source) => shouldCopy(source),
  });
  summary.steps.push({ step: "files", status: "ok", detail: `Installed repository files to ${installDir}.` });
}

function shouldCopy(source) {
  const relative = path.relative(sourceRoot, source);
  if (!relative) return true;
  const first = relative.split(path.sep)[0];
  return !new Set([".agents", ".git", ".env", ".radar", "data", "node_modules", "nul", "release"]).has(first);
}

function configureEnvironment() {
  const envPath = path.join(installDir, ".env");
  const examplePath = path.join(installDir, ".env.example");
  const base = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : requireText(examplePath, "Missing .env.example");
  const parsed = parseEnv(base);
  let adminKey = parsed.RADAR_ADMIN_API_KEY;
  let generatedAdminKey = false;
  if (!adminKey || adminKey === "change-this-before-public-deployment" || adminKey.length < 24) {
    adminKey = randomBytes(32).toString("hex");
    generatedAdminKey = true;
  }
  const url = new URL(apiUrl);
  const updates = {
    HOST: isLocalHost(url.hostname) ? "127.0.0.1" : parsed.HOST || "127.0.0.1",
    PORT: url.port || (url.protocol === "https:" ? "443" : "80"),
    RADAR_API_URL: apiUrl,
    RADAR_AUTO_SCAN: "false",
    RADAR_RUN_ON_STARTUP: "false",
    RADAR_ADMIN_API_KEY: adminKey,
    RADAR_MCP_LANGUAGE: language,
    RADAR_MCP_ALLOW_SCAN: String(enableScan),
    RADAR_MCP_ALLOW_LEAD_WRITE: String(enableLeadWrite),
    RADAR_SKILL_ALLOW_SCAN: String(enableScan),
    RADAR_SKILL_ALLOW_LEAD_WRITE: String(enableLeadWrite),
  };
  writeFileSync(envPath, updateEnvText(base, updates), "utf8");
  return { generatedAdminKey, values: { ...process.env, ...parsed, ...updates } };
}

async function configureAgent(agent, envValues) {
  ensureAgentHome(agent);
  if (agent === "openclaw") return configureOpenClaw(envValues);
  if (agent === "codex") return configureCodex(envValues);
  if (agent === "claude") return configureClaude(envValues);
  if (agent === "hermes") return configureHermes(envValues);
  throw new Error(`Unsupported agent: ${agent}`);
}

async function configureOpenClaw(envValues) {
  const openClawWorkspace = workspace || detectOpenClawWorkspace();
  const destination = path.join(openClawWorkspace, "skills", MCP_NAME);
  await mkdir(destination, { recursive: true });
  await cp(path.join(installDir, "skills", "openclaw", MCP_NAME), destination, { recursive: true, force: true });
  writeFileSync(path.join(destination, "config.json"), `${JSON.stringify({
    radarHome: installDir,
    apiUrl,
    language,
    permissions: { scan: enableScan, leadWrite: enableLeadWrite, delete: false },
    installedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  writeFileSync(path.join(destination, "RADAR_HOME.txt"), `${installDir}\n`, "utf8");
  summary.steps.push({ step: "openclaw-skill", status: "ok", destination });
}

async function configureCodex(envValues) {
  requireCommand("codex", "Codex CLI was not found in PATH.");
  if (force || commandSucceeds("codex", ["mcp", "get", MCP_NAME])) runOptional("codex", ["mcp", "remove", MCP_NAME]);
  const args = ["mcp", "add"];
  for (const [key, value] of mcpEnvironment(envValues)) args.push("--env", `${key}=${value}`);
  args.push(MCP_NAME, "--", process.execPath, path.join(installDir, "dist", "src", "mcp-server.js"));
  runRequired("codex", args, { label: "Register Codex MCP" });
  const registered = runOptional("codex", ["mcp", "get", MCP_NAME]);
  if (registered.status !== 0 || !registered.stdout.includes(MCP_NAME)) throw new Error("Codex MCP registration could not be verified.");
  if (workspace) await installPortableSkill(path.join(workspace, ".agents", "skills"));
  summary.steps.push({ step: "codex-mcp", status: "ok" });
}

async function configureClaude(envValues) {
  requireCommand("claude", "Claude Code CLI was not found in PATH.");
  if (force || commandSucceeds("claude", ["mcp", "get", MCP_NAME])) runOptional("claude", ["mcp", "remove", MCP_NAME]);
  const args = ["mcp", "add", "--scope", scope, MCP_NAME];
  for (const [key, value] of mcpEnvironment(envValues)) args.push("-e", `${key}=${value}`);
  args.push("--", process.execPath, path.join(installDir, "dist", "src", "mcp-server.js"));
  runRequired("claude", args, { label: "Register Claude Code MCP" });
  const registered = runOptional("claude", ["mcp", "get", MCP_NAME]);
  if (registered.status !== 0 || !registered.stdout.includes(MCP_NAME)) throw new Error("Claude Code MCP registration could not be verified.");
  if (workspace) await installPortableSkill(path.join(workspace, ".claude", "skills"));
  summary.steps.push({ step: "claude-mcp", status: "ok", scope });
}

async function configureHermes(envValues) {
  requireCommand("hermes", "Hermes CLI was not found in PATH.");
  if (force || commandSucceeds("hermes", ["mcp", "list"])) runOptional("hermes", ["mcp", "remove", MCP_NAME]);
  const args = ["mcp", "add", MCP_NAME, "--command", process.execPath, "--env"];
  for (const [key, value] of mcpEnvironment(envValues)) args.push(`${key}=${value}`);
  args.push("--args", path.join(installDir, "dist", "src", "mcp-server.js"));
  runRequired("hermes", args, { label: "Register Hermes MCP", input: "\n" });
  const mcpList = runOptional("hermes", ["mcp", "list"]);
  if (mcpList.status !== 0 || !mcpList.stdout.includes(MCP_NAME)) throw new Error("Hermes MCP registration could not be verified. Ensure the Radar service is running and retry.");
  const hermesHome = resolveHermesHome();
  const skillDestination = path.join(hermesHome, "skills", MCP_NAME);
  await mkdir(skillDestination, { recursive: true });
  await cp(path.join(installDir, "skills", "hermes", MCP_NAME), skillDestination, { recursive: true, force: true });
  writeFileSync(path.join(skillDestination, "config.json"), `${JSON.stringify({ radarHome: installDir, apiUrl, language }, null, 2)}\n`, "utf8");
  summary.steps.push({ step: "hermes-mcp", status: "ok", skillDestination });
}

async function installPortableSkill(targetRoot) {
  const destination = path.join(targetRoot, MCP_NAME);
  await mkdir(destination, { recursive: true });
  await cp(path.join(installDir, "skills", MCP_NAME), destination, { recursive: true, force: true });
  writeFileSync(path.join(destination, "config.json"), `${JSON.stringify({ radarHome: installDir, apiUrl, language }, null, 2)}\n`, "utf8");
}

function mcpEnvironment(_envValues) {
  return [
    ["RADAR_API_URL", apiUrl],
    ["RADAR_MCP_LANGUAGE", language],
    ["RADAR_LITE_HOME", installDir],
  ];
}

function ensureAgentHome(agent) {
  const value = agent === "codex"
    ? process.env.CODEX_HOME
    : agent === "hermes"
      ? process.env.HERMES_HOME
      : null;
  if (value) mkdirSync(path.resolve(value), { recursive: true });
}

function resolveHermesHome() {
  if (process.env.HERMES_HOME) return path.resolve(process.env.HERMES_HOME);
  const result = runOptional("hermes", ["config", "path"]);
  const configPath = result.status === 0 ? result.stdout.trim() : "";
  if (!configPath) throw new Error("Could not determine the Hermes home directory.");
  return path.dirname(path.resolve(configPath));
}

function detectOpenClawWorkspace() {
  const candidates = [
    process.env.OPENCLAW_WORKSPACE,
    process.env.OPENCLAW_HOME ? path.join(process.env.OPENCLAW_HOME, "workspace") : null,
    path.join(os.homedir(), ".openclaw", "workspace"),
  ].filter(Boolean);
  const existing = candidates.find((candidate) => existsSync(candidate));
  return path.resolve(existing || candidates[candidates.length - 1]);
}

function resolveAgents(value) {
  const valid = ["openclaw", "hermes", "claude", "codex"];
  if (value === "all") return valid.filter((agent) => agent === "openclaw" || commandExists(agent === "claude" ? "claude" : agent));
  if (valid.includes(value)) return [value];
  if (value !== "auto") throw new Error(`Unknown agent: ${value}. Use openclaw, hermes, claude, codex, all, or auto.`);
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) return ["claude"];
  if (process.env.CODEX_HOME || process.env.CODEX_SANDBOX) return ["codex"];
  if (process.env.HERMES_HOME || process.env.HERMES_PROFILE) return ["hermes"];
  if (process.env.OPENCLAW_HOME || process.env.OPENCLAW_WORKSPACE) return ["openclaw"];
  const detected = ["hermes", "claude", "codex"].filter(commandExists);
  if (detected.length === 1) return detected;
  throw new Error(`Could not safely determine the current agent. Pass --agent openclaw|hermes|claude|codex. Detected CLIs: ${detected.join(", ") || "none"}.`);
}

function plannedActions() {
  return [
    `Install or update Radar Lite in ${installDir}`,
    skipDeps ? "Reuse the existing production build" : "Run npm ci --ignore-scripts and npm run build",
    "Create or update a local .env with a generated administrator key",
    skipService ? "Do not start the Radar service" : `Start Radar at ${apiUrl}`,
    skipAgentConfig ? "Do not modify Agent configuration" : `Configure: ${agents.join(", ")}`,
    `Permissions: scan=${enableScan}, leadWrite=${enableLeadWrite}, delete=false`,
    skipVerify ? "Skip health verification" : "Run a read-only health verification",
  ];
}

function runRequired(command, args, options = {}) {
  const invocation = prepareCommand(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd || installDir,
    env: options.env || process.env,
    encoding: "utf8",
    windowsHide: true,
    input: options.input,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = result.error?.message || result.stderr || result.stdout || `exit status ${String(result.status)}`;
    throw new Error(`${options.label || command} failed: ${String(detail).trim()}`);
  }
  return result;
}

function runOptional(command, args, options = {}) {
  const invocation = prepareCommand(command, args);
  return spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd || installDir,
    env: options.env || process.env,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runJson(command, args, options = {}) {
  const result = runRequired(command, args, options);
  try { return JSON.parse(result.stdout); }
  catch { throw new Error(`${options.label || command} returned invalid JSON.`); }
}

function commandExists(command) {
  return Boolean(resolveCommandPath(command));
}

function resolveCommandPath(command) {
  if (path.isAbsolute(command) && existsSync(command)) return command;
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(checker, [command], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  if (result.status !== 0) return null;
  const candidates = result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (process.platform === "win32") {
    return candidates.find((candidate) => /\.(?:exe|com|cmd|bat)$/i.test(candidate)) || candidates[0] || null;
  }
  return candidates[0] || null;
}

function prepareCommand(command, args) {
  const resolved = resolveCommandPath(command) || command;
  if (process.platform === "win32" && /\.cmd$/i.test(resolved)) {
    const npmEntry = resolveNpmShimEntry(resolved);
    if (npmEntry) return { command: process.execPath, args: [npmEntry, ...args] };
  }
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(resolved)) {
    const commandLine = [`"${resolved.replaceAll('"', '""')}"`, ...args.map(quoteWindowsArg)].join(" ");
    return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `"${commandLine}"`] };
  }
  return { command: resolved, args };
}

function resolveNpmShimEntry(commandPath) {
  try {
    const content = readFileSync(commandPath, "utf8");
    const match = /%dp0%[\\/]([^"\r\n]+\.js)/i.exec(content);
    if (!match) return null;
    const entry = path.resolve(path.dirname(commandPath), match[1]);
    return existsSync(entry) ? entry : null;
  } catch {
    return null;
  }
}

function requireCommand(command, message) {
  if (!commandExists(command)) throw new Error(message);
}

function commandSucceeds(command, args) {
  return runOptional(command, args).status === 0;
}

function runDependencyInstall(mode) {
  const hasLock = existsSync(path.join(installDir, "package-lock.json"))
    || existsSync(path.join(installDir, "npm-shrinkwrap.json"));
  const args = hasLock
    ? ["ci", "--ignore-scripts", mode === "dev" ? "--include=dev" : "--omit=dev", "--no-audit", "--no-fund"]
    : ["install", "--ignore-scripts", mode === "dev" ? "--include=dev" : "--omit=dev", "--no-audit", "--no-fund"];
  runNpm(args, mode === "dev" ? "Install dependencies" : "Install runtime dependencies");
  summary.steps.push({ step: "dependencies", status: "ok", mode: hasLock ? "locked" : "npm-package-fallback" });
}

function runNpm(args, label) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) {
    return runRequired(process.execPath, [npmExecPath, ...args], { cwd: installDir, label });
  }
  if (process.platform === "win32") {
    const commandLine = ["npm", ...args].map(quoteWindowsArg).join(" ");
    return runRequired(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine], { cwd: installDir, label });
  }
  return runRequired("npm", args, { cwd: installDir, label });
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[\s"&|<>^]/.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

function checkNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 5)) throw new Error(`Node.js 22.5+ is required. Current version: ${process.versions.node}.`);
}

function updateEnvText(text, updates) {
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const output = lines.map((line) => {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });
  for (const [key, value] of Object.entries(updates)) if (!seen.has(key)) output.push(`${key}=${value}`);
  return `${output.join("\n").replace(/\n+$/, "")}\n`;
}

function parseEnv(text) {
  const result = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return result;
}

function parseArgs(tokens) {
  const result = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "-h" || token === "--help") { result.help = true; continue; }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [rawKey, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) { result[rawKey] = inline; continue; }
    const next = tokens[index + 1];
    if (!next || next.startsWith("--")) result[rawKey] = true;
    else { result[rawKey] = next; index += 1; }
  }
  return result;
}

function booleanOption(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function samePath(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function hasBuildSources(rootDir) {
  return existsSync(path.join(rootDir, "tsconfig.json"))
    && existsSync(path.join(rootDir, "src", "server.ts"))
    && existsSync(path.join(rootDir, "scripts", "copy-public.mjs"));
}

function requireFile(file, message) {
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(message);
}

function requireText(file, message) {
  requireFile(file, message);
  return readFileSync(file, "utf8");
}

function isLocalHost(hostname) {
  return ["127.0.0.1", "localhost", "::1"].includes(hostname);
}

function printSummary(value, failed = false) {
  const safe = JSON.parse(JSON.stringify(value));
  const text = `${JSON.stringify(safe, null, 2)}\n`;
  (failed ? process.stderr : process.stdout).write(text);
  if (failed) process.exitCode = 1;
}

function helpText() {
  return `BossAI Radar Lite Agent self-installer\n\nUsage:\n  bossai-radar-install --agent <openclaw|hermes|claude|codex|all> [options]\n\nOptions:\n  --install-dir <path>       Stable Radar installation directory (default: ~/.bossai-radar-lite)\n  --workspace <path>         Agent workspace for Skill installation\n  --api-url <url>            Radar API URL (default: http://127.0.0.1:3080)\n  --language <zh|en>         Agent management language (default: zh)\n  --scope <user|project|local> Claude Code MCP scope (default: user)\n  --enable-scan              Explicitly expose live scan tools\n  --enable-lead-write        Explicitly expose lead mutation tools\n  --skip-service             Do not start the background Radar service\n  --skip-agent-config        Install Radar without changing Agent configuration\n  --skip-deps                Reuse an existing production build\n  --skip-verify              Do not run the final health check\n  --force                    Replace an existing MCP registration named bossai-radar\n  --dry-run                  Print the plan without changing files or configuration\n  --help                     Show this help\n\nSafe defaults:\n  live scan=false, lead write=false, delete tool unavailable, automatic customer sending unavailable.\n`;
}
