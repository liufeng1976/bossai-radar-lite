import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.resolve(moduleDir, "../../.env"),
  path.resolve(moduleDir, "../.env"),
  path.resolve(process.cwd(), ".env"),
];

const envPath = candidates.find((candidate) => existsSync(candidate));
if (envPath) loadDotEnv({ path: envPath, override: false, quiet: true });

export const loadedEnvPath = envPath ?? null;
