export type AlertSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface RawAlertPayload {
  source?: unknown;
  severity?: unknown;
  title?: unknown;
  message?: unknown;
  host?: unknown;
  service?: unknown;
  timestamp?: unknown;
  metadata?: unknown;
}

export interface ForwardedAlertPayload {
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

const VALID_SEVERITIES: AlertSeverity[] = ["critical", "high", "medium", "low", "info"];

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizeSeverity(value: unknown): AlertSeverity {
  if (typeof value !== "string") {
    return "info";
  }

  const normalized = value.trim().toLowerCase();
  return VALID_SEVERITIES.includes(normalized as AlertSeverity)
    ? (normalized as AlertSeverity)
    : "info";
}

export function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function normalizeAlert(payload: RawAlertPayload, receivedAt = new Date().toISOString()): ForwardedAlertPayload {
  return {
    source: stringValue(payload.source, "unknown-monitor"),
    severity: normalizeSeverity(payload.severity),
    title: stringValue(payload.title, "Untitled infrastructure alert"),
    message: stringValue(payload.message, "No alert message supplied."),
    host: stringValue(payload.host, "unknown-host"),
    service: stringValue(payload.service, "unknown-service"),
    receivedAt,
    originalTimestamp: typeof payload.timestamp === "string" ? payload.timestamp : null,
    metadata: normalizeMetadata(payload.metadata),
  };
}

export function isAuthorizedBridgeToken(suppliedSecret: string | string[] | undefined, sharedSecret: string | null): boolean {
  if (!sharedSecret) {
    return true;
  }

  return suppliedSecret === sharedSecret;
}