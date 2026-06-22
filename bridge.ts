import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type AlertSeverity = "critical" | "high" | "medium" | "low" | "info";

interface RawAlertPayload {
  source?: unknown;
  severity?: unknown;
  title?: unknown;
  message?: unknown;
  host?: unknown;
  service?: unknown;
  timestamp?: unknown;
  metadata?: unknown;
}

interface ForwardedAlertPayload {
  source: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  host: string;
  service: string;
  receivedAt: string;
  originalTimestamp: string | null;
  metadata: Record<string, unknown>;
}

interface BridgeConfig {
  port: number;
  targetWebhookUrl: string | null;
  sharedSecret: string | null;
  dryRun: boolean;
  maxPayloadBytes: number;
}

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 256;
const VALID_SEVERITIES: AlertSeverity[] = ["critical", "high", "medium", "low", "info"];

function readConfig(): BridgeConfig {
  const port = Number.parseInt(process.env.BRIDGE_PORT ?? "", 10);
  const dryRun = (process.env.DRY_RUN ?? "").toLowerCase() === "true";

  return {
    port: Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT,
    targetWebhookUrl: process.env.TARGET_WEBHOOK_URL?.trim() || null,
    sharedSecret: process.env.BRIDGE_SHARED_SECRET?.trim() || null,
    dryRun,
    maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
  };
}

function readRequestBody(request: IncomingMessage, maxPayloadBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let receivedBytes = 0;

    request.setEncoding("utf8");

    request.on("data", (chunk: string) => {
      receivedBytes += Buffer.byteLength(chunk, "utf8");

      if (receivedBytes > maxPayloadBytes) {
        request.destroy();
        reject(new Error("Payload exceeded maximum allowed size."));
        return;
      }

      body += chunk;
    });

    request.on("end", () => resolve(body));
    request.on("error", (error) => reject(error));
  });
}

function parseJsonBody(body: string): RawAlertPayload {
  if (!body.trim()) {
    throw new Error("Request body is empty.");
  }

  const parsed = JSON.parse(body) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }

  return parsed as RawAlertPayload;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeSeverity(value: unknown): AlertSeverity {
  if (typeof value !== "string") {
    return "info";
  }

  const normalized = value.trim().toLowerCase();
  return VALID_SEVERITIES.includes(normalized as AlertSeverity)
    ? (normalized as AlertSeverity)
    : "info";
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeAlert(payload: RawAlertPayload): ForwardedAlertPayload {
  return {
    source: stringValue(payload.source, "unknown-monitor"),
    severity: normalizeSeverity(payload.severity),
    title: stringValue(payload.title, "Untitled infrastructure alert"),
    message: stringValue(payload.message, "No alert message supplied."),
    host: stringValue(payload.host, "unknown-host"),
    service: stringValue(payload.service, "unknown-service"),
    receivedAt: new Date().toISOString(),
    originalTimestamp: typeof payload.timestamp === "string" ? payload.timestamp : null,
    metadata: normalizeMetadata(payload.metadata),
  };
}

function assertAuthorized(request: IncomingMessage, sharedSecret: string | null): void {
  if (!sharedSecret) {
    return;
  }

  const suppliedSecret = request.headers["x-bridge-token"];

  if (suppliedSecret !== sharedSecret) {
    throw new Error("Unauthorized alert submission.");
  }
}

async function forwardAlert(alert: ForwardedAlertPayload, config: BridgeConfig): Promise<number> {
  if (config.dryRun || !config.targetWebhookUrl) {
    console.log("[DRY RUN] Normalized alert payload:");
    console.log(JSON.stringify(alert, null, 2));
    return 202;
  }

  const response = await fetch(config.targetWebhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "msp-alert-bridge/1.0",
    },
    body: JSON.stringify(alert),
  });

  if (!response.ok) {
    throw new Error(`Target webhook returned HTTP ${response.status}.`);
  }

  return response.status;
}

function sendJson(response: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload, null, 2));
}

async function handleAlertRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: BridgeConfig,
): Promise<void> {
  try {
    assertAuthorized(request, config.sharedSecret);
    const body = await readRequestBody(request, config.maxPayloadBytes);
    const rawPayload = parseJsonBody(body);
    const normalizedAlert = normalizeAlert(rawPayload);
    const forwardStatus = await forwardAlert(normalizedAlert, config);

    sendJson(response, 202, {
      status: "accepted",
      forwardStatus,
      alert: normalizedAlert,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bridge error.";
    const statusCode = message.includes("Unauthorized") ? 401 : 400;
    sendJson(response, statusCode, { status: "rejected", error: message });
  }
}

function startServer(config: BridgeConfig): void {
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "msp-alert-bridge",
        dryRun: config.dryRun || !config.targetWebhookUrl,
      });
      return;
    }

    if (request.method === "POST" && request.url === "/alerts") {
      void handleAlertRequest(request, response, config);
      return;
    }

    sendJson(response, 404, {
      status: "not_found",
      routes: ["GET /health", "POST /alerts"],
    });
  });

  server.listen(config.port, () => {
    console.log(`MSP Alert Bridge listening on http://localhost:${config.port}`);
    console.log(`Mode: ${config.dryRun || !config.targetWebhookUrl ? "dry-run" : "forwarding"}`);
  });
}

startServer(readConfig());
