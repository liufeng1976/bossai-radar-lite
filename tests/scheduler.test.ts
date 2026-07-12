import assert from "node:assert/strict";
import test from "node:test";
import { calculateNextDailyRun } from "../src/scheduler.js";

test("uses the same day when the configured time is still ahead", () => {
  const reference = new Date(2026, 6, 12, 7, 30, 0);
  const next = calculateNextDailyRun(reference, 8, 0);
  assert.equal(next.getDate(), 12);
  assert.equal(next.getHours(), 8);
  assert.equal(next.getMinutes(), 0);
});

test("moves to tomorrow after the configured time", () => {
  const reference = new Date(2026, 6, 12, 9, 0, 0);
  const next = calculateNextDailyRun(reference, 8, 0);
  assert.equal(next.getDate(), 13);
  assert.equal(next.getHours(), 8);
});

test("clamps invalid hour and minute values", () => {
  const reference = new Date(2026, 6, 12, 10, 0, 0);
  const next = calculateNextDailyRun(reference, 99, -8);
  assert.equal(next.getHours(), 23);
  assert.equal(next.getMinutes(), 0);
});
