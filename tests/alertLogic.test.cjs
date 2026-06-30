const test = require("node:test");
const assert = require("node:assert/strict");
const { isAuthorizedBridgeToken, normalizeAlert, normalizeMetadata, normalizeSeverity } = require("../dist/alertLogic.js");

test("normalizes alert payloads for downstream webhook delivery", () => {
  const alert = normalizeAlert({
    source: "  PRTG  ",
    severity: "CRITICAL",
    title: "  Switch down ",
    message: " Warehouse switch unavailable ",
    host: " sw-warehouse-01 ",
    service: " ping ",
    timestamp: "2026-06-30T10:00:00.000Z",
    metadata: { site: "warehouse" },
  }, "2026-06-30T10:01:00.000Z");

  assert.deepEqual(alert, {
    source: "PRTG",
    severity: "critical",
    title: "Switch down",
    message: "Warehouse switch unavailable",
    host: "sw-warehouse-01",
    service: "ping",
    receivedAt: "2026-06-30T10:01:00.000Z",
    originalTimestamp: "2026-06-30T10:00:00.000Z",
    metadata: { site: "warehouse" },
  });
});

test("applies safe defaults for sparse or invalid alert fields", () => {
  const alert = normalizeAlert({ severity: "unknown", metadata: ["bad"] }, "2026-06-30T10:01:00.000Z");

  assert.equal(alert.source, "unknown-monitor");
  assert.equal(alert.severity, "info");
  assert.equal(alert.title, "Untitled infrastructure alert");
  assert.equal(alert.message, "No alert message supplied.");
  assert.equal(alert.host, "unknown-host");
  assert.equal(alert.service, "unknown-service");
  assert.equal(alert.originalTimestamp, null);
  assert.deepEqual(alert.metadata, {});
});

test("normalizes severity values case-insensitively", () => {
  assert.equal(normalizeSeverity(" High "), "high");
  assert.equal(normalizeSeverity("medium"), "medium");
  assert.equal(normalizeSeverity(null), "info");
});

test("accepts only object metadata", () => {
  assert.deepEqual(normalizeMetadata({ ticket: 123 }), { ticket: 123 });
  assert.deepEqual(normalizeMetadata(null), {});
  assert.deepEqual(normalizeMetadata(["array"]), {});
});

test("validates shared-secret headers only when a secret is configured", () => {
  assert.equal(isAuthorizedBridgeToken(undefined, null), true);
  assert.equal(isAuthorizedBridgeToken("expected-token", "expected-token"), true);
  assert.equal(isAuthorizedBridgeToken("wrong-token", "expected-token"), false);
  assert.equal(isAuthorizedBridgeToken(["expected-token"], "expected-token"), false);
});