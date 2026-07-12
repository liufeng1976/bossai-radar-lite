import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const variant = args[0] || "portable";
const options = parseOptions(args.slice(1));
const root = process.cwd();

const sourceByVariant = {
  portable: path.join(root, "skills", "bossai-radar"),
  openclaw: path.join(root, "skills", "openclaw", "bossai-radar"),
  hermes: path.join(root, "skills", "hermes", "bossai-radar"),
};

if (!(variant in sourceByVariant)) {
  fail(`Unknown skill variant: ${variant}. Use portable, openclaw, or hermes.`);
}

const source = sourceByVariant[variant];
await requireDirectory(source, `Skill source is missing: ${source}`);

let targetRoot;
if (variant === "openclaw" && options.workspace) {
  targetRoot = path.resolve(options.workspace, "skills");
} else if (options.target) {
  targetRoot = path.resolve(options.target);
} else {
  fail(
    variant === "openclaw"
      ? "OpenClaw installation requires --workspace <OpenClaw workspace> or --target <skills root>."
      : "Installation requires --target <skills root>.",
  );
}

const destination = path.join(targetRoot, "bossai-radar");
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });

process.stdout.write(`${JSON.stringify({
  ok: true,
  variant,
  source,
  destination,
  note: "Only skill files were copied. No services were started and no system configuration was changed.",
}, null, 2)}\n`);

function parseOptions(tokens) {
  const result = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token?.startsWith("--")) fail(`Unexpected argument: ${token || ""}`);
    const key = token.slice(2);
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) fail(`--${key} requires a value`);
    result[key] = value;
    index += 1;
  }
  return result;
}

async function requireDirectory(value, message) {
  try {
    const info = await stat(value);
    if (!info.isDirectory()) fail(message);
  } catch {
    fail(message);
  }
}

function fail(message) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  process.exit(1);
}
