#!/usr/bin/env node
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "status";
const options = parseOptions(process.argv.slice(3));
const stateDir = options["state-dir"] ? path.resolve(String(options["state-dir"])) : path.join(root, ".radar");
const pidPath = path.join(stateDir, "server.pid");
const logPath = path.join(stateDir, "server.log");
const env = { ...readEnv(path.join(root, ".env")), ...process.env };
const apiUrl = String(options["api-url"] || env.RADAR_API_URL || `http://${env.HOST || "127.0.0.1"}:${env.PORT || "3080"}`).replace(/\/$/, "");
const parsedApiUrl = new URL(apiUrl);
env.RADAR_API_URL = apiUrl;
if (parsedApiUrl.port) env.PORT = parsedApiUrl.port;
if (["localhost", "127.0.0.1", "::1"].includes(parsedApiUrl.hostname)) env.HOST = "127.0.0.1";
if (options["data-dir"]) env.DATA_DIR = path.resolve(String(options["data-dir"]));

try {
  let result;
  if (command === "start") result = await start();
  else if (command === "stop") result = await stop();
  else if (command === "restart") {
    await stop();
    result = await start();
  } else if (command === "status") result = await status();
  else throw new Error(`Unknown service command: ${command}. Use start, stop, restart, or status.`);
  output({ ok: true, command, ...result });
} catch (error) {
  output({ ok: false, command, error: error instanceof Error ? error.message : String(error) }, true);
}

async function start() {
  const healthy = await health();
  if (healthy) return { running: true, apiUrl, pid: readPid(), alreadyRunning: true, logPath };
  const currentPid = readPid();
  if (currentPid && isProcessAlive(currentPid)) {
    const recovered = await waitForHealth(12_000);
    if (recovered) return { running: true, apiUrl, pid: currentPid, alreadyRunning: true, logPath };
    throw new Error(`Radar process ${currentPid} is alive but ${apiUrl}/api/health did not become ready.`);
  }

  const serverPath = path.join(root, "dist", "src", "server.js");
  if (!existsSync(serverPath)) throw new Error("Production build is missing. Run npm run build first.");
  mkdirSync(stateDir, { recursive: true });
  const logFd = openSync(logPath, "a");
  const child = spawn(process.execPath, [serverPath], {
    cwd: root,
    env,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);
  if (!child.pid) throw new Error("Failed to start the Radar process.");
  writeFileSync(pidPath, `${child.pid}\n`, "utf8");
  child.unref();
  const ready = await waitForHealth(25_000);
  if (!ready) throw new Error(`Radar started as PID ${child.pid}, but health check failed. Review ${logPath}.`);
  return { running: true, apiUrl, pid: child.pid, alreadyRunning: false, logPath };
}

async function stop() {
  const pid = readPid();
  if (!pid) return { running: false, apiUrl, stopped: false };
  if (!isProcessAlive(pid)) {
    rmSync(pidPath, { force: true });
    return { running: false, apiUrl, stopped: false, stalePid: pid };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!isProcessAlive(pid)) break;
    await sleep(100);
  }
  if (isProcessAlive(pid)) {
    try { process.kill(pid, "SIGKILL"); } catch { /* process already exited */ }
  }
  rmSync(pidPath, { force: true });
  return { running: false, apiUrl, stopped: true, pid };
}

async function status() {
  const pid = readPid();
  const healthy = await health();
  return {
    running: healthy,
    apiUrl,
    pid: pid && isProcessAlive(pid) ? pid : null,
    logPath,
  };
}

async function health() {
  try {
    const response = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await health()) return true;
    await sleep(250);
  }
  return false;
}

function readPid() {
  try {
    const value = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readEnv(file) {
  if (!existsSync(file)) return {};
  const result = {};
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

function parseOptions(tokens) {
  const result = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token?.startsWith("--")) throw new Error(`Unexpected argument: ${token || ""}`);
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function output(value, failed = false) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  (failed ? process.stderr : process.stdout).write(text);
  if (failed) process.exitCode = 1;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
