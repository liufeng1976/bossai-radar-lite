import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolveProjectFile(relativePath: string) {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), relativePath),
    path.resolve(moduleDir, "..", relativePath),
    path.resolve(moduleDir, "..", "..", relativePath),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) throw new Error(`RADAR_AGENT_API_FILE_MISSING:${relativePath}`);
  return match;
}

export function loadRadarAgentApiManifest() {
  const manifest = JSON.parse(readFileSync(resolveProjectFile("agent-api.json"), "utf8"));
  if (manifest?.schema !== "bossai.agent-api.v1" || manifest?.id !== "bossai-radar-lite") {
    throw new Error("RADAR_AGENT_API_MANIFEST_INVALID");
  }
  return manifest;
}

export function loadRadarAgentApiOpenApi() {
  const document = JSON.parse(readFileSync(resolveProjectFile("openapi/agent-api.json"), "utf8"));
  if (document?.openapi !== "3.1.0" || document?.info?.title !== "BossAI Radar Lite Agent API") {
    throw new Error("RADAR_AGENT_API_OPENAPI_INVALID");
  }
  return document;
}

export function radarAgentCapabilities() {
  const manifest = loadRadarAgentApiManifest();
  return {
    schema: "bossai.agent-api-capabilities.v1",
    id: manifest.id,
    version: manifest.version,
    operations: manifest.operations,
    transports: manifest.transports,
    bossaiConnector: manifest.bossaiConnector,
    mcpToolMapping: manifest.mcpToolMapping,
    safety: manifest.safety,
    authority: manifest.authority,
    automaticExternalActions: false,
  };
}
