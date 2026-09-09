import assert from "node:assert/strict";
import test from "node:test";
import { loadRadarAgentApiManifest, loadRadarAgentApiOpenApi, radarAgentCapabilities } from "../src/agent-api.js";

test("Radar Agent API manifest preserves BossAI OS authority and read-only connector operations", () => {
  const manifest = loadRadarAgentApiManifest();
  assert.equal(manifest.schema, "bossai.agent-api.v1");
  assert.equal(manifest.id, "bossai-radar-lite");
  assert.equal(manifest.authority.runtime, "bossai-os");
  assert.equal(manifest.authority.ownsRuntime, false);
  assert.equal(manifest.bossaiConnector.automaticExternalActions, false);
  assert.deepEqual(manifest.bossaiConnector.writeOperations, []);
  assert.ok(manifest.bossaiConnector.readOperations.includes("opportunities"));
  assert.ok(manifest.operations.some((item: { id: string; requiresHumanApproval: boolean }) => item.id === "scan" && item.requiresHumanApproval === true));
});

test("Radar Agent API OpenAPI and capability projections match the public contract", () => {
  const manifest = loadRadarAgentApiManifest();
  const openapi = loadRadarAgentApiOpenApi();
  const capabilities = radarAgentCapabilities();
  assert.equal(openapi.openapi, "3.1.0");
  assert.equal(openapi.info.version, manifest.version);
  assert.ok(openapi.paths["/api/opportunities"]);
  assert.ok(openapi.paths["/api/admin/opportunities/{id}/delegate"]);
  assert.equal(capabilities.schema, "bossai.agent-api-capabilities.v1");
  assert.equal(capabilities.id, manifest.id);
  assert.equal(capabilities.automaticExternalActions, false);
});
