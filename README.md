# Agent Action Attestation

> Cryptographic, tamper-evident logging of AI agent actions for financial compliance.

[![Compliance](https://img.shields.io/badge/compliance-SEC%2017a--4%20%7C%20SOC%202%20%7C%20PCI--DSS--aligned-blue)]()
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## What This Is

A lightweight, drop-in attestation layer for AI agents that execute real-world actions (trades, emails, transfers). Every action is:

- **Cryptographically signed** by the agent (non-repudiation)
- **Hash-chained** to previous actions (tamper-evident sequence)
- **Prompt-attributed** (auditable "why" for every "what")
- **Stored in WAL format** (append-only by design, no UPDATE/DELETE possible)
- **Replicated** to redundant storage (disaster recovery)
- **Exportable** to SQLite, CSV, and human-readable formats

## Why WAL Instead of SQLite?

SQLite allows `UPDATE` and `DELETE`. Our WAL (Write-Ahead Log) format is **physically append-only** — no API exists to modify or delete records. Each record embeds its own integrity proof. Auditors can verify with just `hexdump` and `openssl`.

[Read the threat model →](docs/THREAT_MODEL.md)  
[Read the limitations →](docs/LIMITATIONS.md)

## Quick Start

```bash
npm install
npm run demo
```

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   AI Agent      │────▶│  attestedTool │────▶│  Effector       │
│  (LLM output)   │     │  (wrapper)    │     │  (real action)  │
└─────────────────┘     └──────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │   WAL Ledger │
                        │  - Sign      │
                        │  - Hash      │
                        │  - Chain     │
                        └──────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │  Primary │    │   WORM   │    │  Backup  │
        │  (*.wal) │    │  (S3)    │    │  (*.wal) │
        └──────────┘    └──────────┘    └──────────┘
```

## Compliance Mapping

| Framework | Requirement | How This Satisfies It |
|-----------|-------------|----------------------|
| **SEC 17a-4** | Audit-trail alternative to WORM | Chained hashes + signatures = tamper-evident trail |
| **SOC 2 CC8** | Change management with audit trail | Every action signed, sequenced, and exportable |
| **PCI-DSS 10.3.4** | File integrity monitoring on logs | `verifyChain()` detects any modification |

## API

### `attestedTool(config)`

Wrap any async function with cryptographic attestation.

```javascript
const executeTrade = attestedTool({
  agentId: 'bot-7',
  modelVersion: 'claude-sonnet-5',
  privateKeyPem,      // From generateSessionKeypair()
  ledger,             // WALLedger instance
  actionType: 'execute_trade',
  fn: realExecuteTrade,  // Your actual function
});

// Call it like normal — attestation happens automatically
await executeTrade(
  { side: 'BUY', qty: 100, symbol: 'ACME' },
  { promptText: 'User asked: buy 100 shares of ACME.' }
);
```

### `verifyChain(records, publicKeyPem)`

Independent verification — run this during audits.

```javascript
const report = verifyChain(ledger.all(), publicKeyPem);
console.log(report.valid);  // true or false
```

### Ledger Backends

```javascript
const ledger = new WALLedger('./ledger.wal', {
  wormBackend: new S3ObjectLockBackend('bucket', 'prefix'),
  redundancyBackend: new WALLedger('./backup.wal'),  // Another WAL instance
  alertWebhook: 'https://hooks.slack.com/services/...',
});
```

## Security Model

| Threat | Defense |
|--------|---------|
| Log tampering (after write) | Hash chain + signature verification |
| Agent repudiation | Ed25519 signatures on every record |
| Sequence manipulation | Monotonic sequence numbers in chain |
| Storage compromise | WORM backends + cross-region redundancy |
| Clock skew | NTP sync check at startup |
| Key theft | Ephemeral session keys (rotate per run) |

## Production Checklist

- [ ] Replace backup with S3 Object Lock or Azure Immutable Blob
- [ ] Configure `alertWebhook` to your SIEM
- [ ] Run `requireNTPSync()` before agent startup
- [ ] Store private keys in HSM or AWS KMS
- [ ] Set up automated `verifyChain()` runs (e.g., hourly cron + alert on failure)
- [ ] Retain exports for required duration (SEC: 3-6 years, PCI: 12 months)
- [ ] Document the verification procedure for your SOC 2 auditor

## License

Apache 2.0
