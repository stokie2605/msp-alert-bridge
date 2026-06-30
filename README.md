# MSP Alert Bridge

[![CI](https://github.com/stokie2605/msp-alert-bridge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/stokie2605/msp-alert-bridge/actions/workflows/ci.yml)

Built by Dean Wilshaw.

MSP Alert Bridge is a lightweight TypeScript service that receives infrastructure alert payloads, normalizes them into a consistent operational format, and forwards them to a configured webhook destination.

It is designed for Managed Service Provider-style environments where alert sources can be noisy, inconsistent, or fragmented across different monitoring systems.

### API Validation & Logs

Health check response:

```json
{
  "status": "ok",
  "service": "msp-alert-bridge",
  "dryRun": true
}
```

Dry-run normalized alert log:

```json
{
  "source": "uptime-monitor",
  "severity": "high",
  "title": "Primary router unreachable",
  "message": "Gateway failed three consecutive health checks.",
  "host": "edge-router-01",
  "service": "network",
  "receivedAt": "2026-06-24T08:18:07.720Z",
  "originalTimestamp": "2026-06-24T08:59:50.000Z",
  "metadata": {
    "site": "client-a",
    "checkCount": 3,
    "ticketPriority": "P1"
  }
}
```

## The Business Problem

MSPs and internal IT teams often receive alerts from multiple systems: uptime monitors, endpoint tools, backup platforms, firewalls, ticketing systems, and cloud services. Each platform tends to format payloads differently, which creates friction when teams need to route alerts into a central workflow.

Common operational issues include:

- Alert payloads arriving in inconsistent formats.
- Technicians losing time interpreting raw webhook data.
- Missing context such as host, service, severity, or source platform.
- No simple bridge between monitoring tools and downstream systems.
- Poor separation between alert intake, normalization, and forwarding.
- Difficulty testing alert routing safely without contacting production endpoints.

## The Solution & Architecture

MSP Alert Bridge provides a small Node.js service with two routes:

- `GET /health` for service checks.
- `POST /alerts` for alert intake.

Incoming alerts are validated, normalized, optionally authenticated with a shared header token, and then forwarded to a configured webhook endpoint. If no target webhook is configured, the bridge automatically operates in dry-run mode and prints the normalized payload to the console.

### Architecture Flow

```text
Monitoring Tool / Alert Source
            |
            v
      POST /alerts
            |
            v
Payload Validation + Optional Shared Secret Check
            |
            v
Alert Normalization
            |
            v
Dry-Run Console Output OR Target Webhook Forwarding
```

### Normalized Alert Shape

```json
{
  "source": "uptime-monitor",
  "severity": "high",
  "title": "Primary router unreachable",
  "message": "Gateway failed three consecutive health checks.",
  "host": "edge-router-01",
  "service": "network",
  "receivedAt": "2026-06-22T18:00:00.000Z",
  "originalTimestamp": "2026-06-22T17:59:50.000Z",
  "metadata": {
    "site": "client-a",
    "ticketPriority": "P1"
  }
}
```

## Technical Toolkit

- Node.js
- TypeScript
- Native Node HTTP server
- Built-in `fetch` for webhook forwarding
- Environment-variable configuration
- No runtime npm dependencies

## ✅ Automated Testing

The project includes unit tests to verify alert ingestion logic:
- **Payload Normalization:** Asserts that input parameters map to the correct properties and fields.
- **Default Fields:** Confirms that fallback values are set when non-required properties are omitted.
- **Severity Mapping:** Validates that incoming severity labels are correctly parsed and mapped to standard severities.
- **Shared Secret Verification:** Asserts that webhook token header validations prevent unauthorized alerts.

To run the test suite locally:
```bash
npm run test
```

The GitHub Actions CI pipeline runs these tests automatically on every push.

## Local Execution Setup

### Install Dependencies

```bash
npm install
```

### Build TypeScript

```bash
npm run build
```

### Start the Bridge

```bash
npm start
```

By default, the service listens on:

```text
http://localhost:8787
```

### Health Check

```bash
curl http://localhost:8787/health
```

### Send a Test Alert

PowerShell:

```powershell
$payload = @{
  source = "uptime-monitor"
  severity = "high"
  title = "Primary router unreachable"
  message = "Gateway failed three consecutive health checks."
  host = "edge-router-01"
  service = "network"
  timestamp = (Get-Date).ToString("o")
  metadata = @{
    site = "client-a"
    ticketPriority = "P1"
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "http://localhost:8787/alerts" `
  -Method Post `
  -ContentType "application/json" `
  -Body $payload
```

## Configuration

Set these environment variables before starting the service:

| Variable | Purpose | Default |
| --- | --- | --- |
| `BRIDGE_PORT` | Local HTTP port | `8787` |
| `TARGET_WEBHOOK_URL` | Destination webhook for normalized alerts | dry-run mode if unset |
| `BRIDGE_SHARED_SECRET` | Optional required value for `x-bridge-token` header | disabled if unset |
| `DRY_RUN` | Force console-only forwarding when set to `true` | `false` |

Example:

```powershell
$env:BRIDGE_PORT = "8787"
$env:TARGET_WEBHOOK_URL = "https://example.com/webhook"
$env:BRIDGE_SHARED_SECRET = "change-me"
npm start
```

Send an authenticated alert:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:8787/alerts" `
  -Method Post `
  -Headers @{ "x-bridge-token" = "change-me" } `
  -ContentType "application/json" `
  -Body $payload
```

## Project Files

```text
bridge.ts          # Alert intake, normalization, and forwarding service
package.json       # Node scripts and TypeScript dependencies
tsconfig.json      # TypeScript compiler configuration
README.md          # Project documentation
```

## Production Readiness Notes

- Place the service behind HTTPS before accepting real alerts.
- Store secrets in a proper secret manager or deployment environment.
- Add structured logging for SIEM or ticketing integration.
- Add retry/backoff handling for failed downstream webhooks.
- Add schema validation if connecting to multiple production monitoring tools.
- Add tests for payload normalization, shared-secret checks, and forwarding errors.
