import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const skillFiles = [
  "skills/bossai-radar/SKILL.md",
  "skills/openclaw/bossai-radar/SKILL.md",
  "skills/hermes/bossai-radar/SKILL.md",
];

test("ships portable, OpenClaw, and Hermes skills with safe frontmatter", () => {
  for (const file of skillFiles) {
    const content = readFileSync(file, "utf8");
    assert.match(content, /^---\n[\s\S]*?\n---\n/);
    assert.match(content, /\nname: bossai-radar\n/);
    assert.match(content, /\ndescription:/);
    assert.match(content, /human-reviewed|人工|approval|审核/i);
    assert.doesNotMatch(content, /curl\s+[^\n]+\|\s*(?:bash|sh)/i);
    assert.doesNotMatch(content, /powershell[^\n]+-enc(?:odedcommand)?/i);
    assert.doesNotMatch(content, /rm\s+-rf|del\s+\/s|format\s+[a-z]:/i);
  }

  const openClaw = readFileSync("skills/openclaw/bossai-radar/SKILL.md", "utf8");
  assert.match(openClaw, /metadata:\n\s+openclaw:/);
  assert.match(openClaw, /requires:\n\s+bins:\n\s+- node/);
  assert.match(openClaw, /RADAR_MCP_ALLOW_SCAN/);
  assert.match(openClaw, /Never delete leads/i);
});

test("installs the OpenClaw skill into a workspace without changing configuration", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-openclaw-workspace-"));
  try {
    const result = spawnSync(process.execPath, [
      "scripts/install-agent-skill.mjs",
      "openclaw",
      "--workspace",
      directory,
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as { ok: boolean; destination: string; note: string };
    assert.equal(payload.ok, true);
    assert.equal(payload.destination, path.join(directory, "skills", "bossai-radar"));
    assert.match(payload.note, /Only skill files were copied/);

    const installed = readFileSync(path.join(directory, "skills", "bossai-radar", "SKILL.md"), "utf8");
    assert.match(installed, /BossAI Radar for OpenClaw/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
