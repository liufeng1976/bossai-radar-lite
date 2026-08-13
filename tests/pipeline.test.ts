import assert from "node:assert/strict";
import test from "node:test";
import { scanStatusForOutcomes } from "../src/pipeline.js";
import type { SourceName, SourceOutcome } from "../src/types.js";

function outcome(source: SourceName, status: SourceOutcome["status"]): SourceOutcome {
  return {
    source,
    status,
    items: [],
    durationMs: 1,
  };
}

test("ignores optional skipped sources when determining scan success", () => {
  const sources = [
    outcome("reddit", "success"),
    outcome("hackernews", "success"),
    outcome("github", "success"),
    outcome("arxiv", "success"),
    outcome("rss", "skipped"),
  ];
  assert.equal(scanStatusForOutcomes(sources, 12), "success");
});

test("keeps real source failures visible after excluding skipped sources", () => {
  assert.equal(scanStatusForOutcomes([
    outcome("reddit", "success"),
    outcome("hackernews", "failed"),
    outcome("rss", "skipped"),
  ], 3), "partial");
  assert.equal(scanStatusForOutcomes([
    outcome("reddit", "failed"),
    outcome("hackernews", "failed"),
    outcome("rss", "skipped"),
  ], 0), "failed");
});
