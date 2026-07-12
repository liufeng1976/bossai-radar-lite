import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RadarDatabase } from "../src/database.js";
import { seedDemoData } from "../src/demo.js";
import { scoreEvidence } from "../src/scoring.js";

test("demo seed is clearly marked and excluded from live evidence queries", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-lite-demo-"));
  const db = new RadarDatabase(directory);
  try {
    const result = seedDemoData(db);
    const stats = db.stats();

    assert.equal(result.run.trigger, "demo");
    assert.equal(result.run.status, "success");
    assert.equal(result.opportunities.length, 3);
    assert.deepEqual(
      result.opportunities.map((item) => item.decision).sort(),
      ["BUILD", "SELL_SERVICE", "WATCH"],
    );
    assert.ok(result.opportunities.every((item) => item.isDemo));
    assert.ok(db.listEvidence(100).every((item) => item.isDemo));
    assert.equal(db.listEvidence(100, undefined, false).length, 0);
    assert.equal(stats.demoEvidence, 9);
    assert.equal(stats.demoOpportunities, result.opportunities.length);
    assert.match(db.latestReport()?.executiveSummary || "", /^【演示数据】/);

    db.saveEvidence(scoreEvidence({
      source: "github",
      externalId: "real-1",
      title: "Real seller needs a customer support tool and has budget",
      body: "The current manual workflow is urgent and costs $99 per month.",
      url: "https://github.com/example/real-issue",
      author: "real-user",
      publishedAt: new Date().toISOString(),
      engagement: 12,
      query: "customer support AI",
    }));

    const liveOnly = db.listEvidence(100, undefined, false);
    assert.equal(liveOnly.length, 1);
    assert.equal(liveOnly[0]?.isDemo, false);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
