import assert from "node:assert/strict";
import test from "node:test";
import { createLatestRequestGate } from "../public/latest-request.js";

test("latest-request gate accepts only the newest request sequence", () => {
  const gate = createLatestRequestGate();
  const first = gate.next();
  assert.equal(gate.isCurrent(first), true);

  const second = gate.next();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
});

test("latest-request gate invalidates an in-flight request without starting a replacement", () => {
  const gate = createLatestRequestGate();
  const pending = gate.next();
  gate.invalidate();

  assert.equal(gate.isCurrent(pending), false);
  const next = gate.next();
  assert.equal(gate.isCurrent(next), true);
});
