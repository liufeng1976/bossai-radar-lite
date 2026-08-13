import assert from "node:assert/strict";
import test from "node:test";
import { assertSafePublicBinding, isLoopbackHost } from "../src/security.js";

test("allows local-only bindings without forcing a configured administrator key", () => {
  for (const host of ["127.0.0.1", "localhost", "::1", "[::1]"]) {
    assert.equal(isLoopbackHost(host), true);
    assert.doesNotThrow(() => assertSafePublicBinding(host, "change-this-before-public-deployment"));
  }
});

test("rejects weak administrator keys on non-loopback bindings", () => {
  for (const key of ["", "short-key", "change-this-before-public-deployment"]) {
    assert.throws(
      () => assertSafePublicBinding("0.0.0.0", key),
      /Refusing to bind BossAI Radar Lite/,
    );
  }
  assert.doesNotThrow(() => assertSafePublicBinding("0.0.0.0", "integration-admin-key-1234567890"));
});
