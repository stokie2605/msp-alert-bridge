const test = require("node:test");
const assert = require("node:assert/strict");
const { forwardAlert } = require("../dist/bridge.js");

const sampleAlert = {
  source: "monitor",
  severity: "high",
  title: "Switch down",
  message: "Switch did not respond",
  host: "sw-1",
  service: "ping",
  receivedAt: "2026-06-30T10:01:00.000Z",
  originalTimestamp: null,
  metadata: {},
};

test("forwardAlert sends outbound webhook requests with an abort signal", async () => {
  const originalFetch = global.fetch;
  let capturedOptions;
  global.fetch = async (_url, options) => {
    capturedOptions = options;
    return { ok: true, status: 204 };
  };

  try {
    const status = await forwardAlert(sampleAlert, {
      dryRun: false,
      targetWebhookUrl: "https://hooks.example.test/alerts",
      sharedSecret: null,
      port: 8787,
      maxPayloadBytes: 1024,
    });

    assert.equal(status, 204);
    assert.equal(capturedOptions.method, "POST");
    assert.equal(capturedOptions.headers["content-type"], "application/json");
    assert.ok(capturedOptions.signal instanceof AbortSignal);
    assert.equal(capturedOptions.signal.aborted, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("forwardAlert converts aborted upstream requests into a timeout error", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    throw error;
  };

  try {
    await assert.rejects(
      () => forwardAlert(sampleAlert, {
        dryRun: false,
        targetWebhookUrl: "https://hooks.example.test/alerts",
        sharedSecret: null,
        port: 8787,
        maxPayloadBytes: 1024,
      }),
      /Target webhook timed out after 5000ms\./,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
