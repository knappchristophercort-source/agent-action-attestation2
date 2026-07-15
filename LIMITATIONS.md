# Limitations

> This document describes what Agent Action Attestation **cannot** do.  
> Read this before deploying to production. No surprises.

---

## 1. It Does Not Verify Intent

The system logs **what the agent claims** the user asked for (`promptText`). It does **not** verify:

- That the user actually sent that prompt
- That the prompt was not injected by a third party
- That the agent interpreted the prompt correctly
- That the agent's action aligned with the prompt's intent

**Example:** A compromised agent can execute `transfer_funds({ amount: 1000000 })` while logging `promptText: "User asked: check account balance."` The signature will be valid. The hash chain will be intact. The log will be cryptographically perfect — and factually false about the intent.

**What to do about it:** Log prompts at the ingress layer (before they reach the agent). Compare ingress logs with attestation logs. Any mismatch is an incident.

---

## 2. It Does Not Prevent Bad Actions

This is an **audit trail**, not a **guardrail**. It records actions after they happen. It does **not**:

- Block unauthorized trades
- Reject out-of-policy transfers
- Pause the agent when anomalies are detected

**What to do about it:** Implement policy enforcement *before* `attestedTool()`. Example:

```javascript
// Guardrail FIRST
if (!policyAllows(payload)) throw new Error('Policy violation');

// Attestation SECOND
const result = await attestedTool({ ... })(payload, meta);
```

---

## 3. Key Theft = Game Over (For That Session)

The private key is in memory during the agent session. If an attacker steals it:

- They can create valid signatures on any action.
- They can append forged records to the ledger.
- Verification will pass because the signatures are mathematically correct.

**Mitigations:**
- Use HSM or cloud KMS (key never leaves secure hardware).
- Rotate keys every N hours or every N actions.
- Run agents in isolated environments (containers, VMs, enclaves).

**What this system does well:** Even with a stolen key, the attacker cannot modify *past* records without breaking the hash chain. They can only append new forgeries.

---

## 4. It Trusts the Effector Function

If an attacker bypasses `attestedTool()` and calls `realExecuteTrade()` directly:

- The trade happens.
- No log is created.
- The auditor sees nothing.

**What to do about it:**
- Never expose `realExecuteTrade` outside the module.
- Network policies: effector APIs should only accept connections from the agent host.
- Separate audit streams: the exchange/bank should also log the trade independently.

---

## 5. It Does Not Protect Against Deletion

An attacker with OS-level access can:

- Delete the WAL file entirely.
- Delete the backup ledger.
- Delete the index file.

**Detection:**
- Missing files are obvious (verification script fails with "file not found").
- Backup comparison reveals discrepancy.

**What to do about it:**
- WORM storage (S3 Object Lock, Azure Immutable Blob).
- Air-gapped backups.
- Multiple independent audit streams (exchange logs, email logs, etc.).

---

## 6. Clock Manipulation Is Possible (With Root Access)

If an attacker controls the OS clock:

- They can backdate records (make them appear to have happened earlier).
- They can postdate records (delay detection).

**Mitigations:**
- NTP with authentication (NTS — Network Time Security).
- Independent timestamp services (e.g., Roughtime).
- Cross-reference with external systems (exchange timestamps, email headers).

---

## 7. Quantum Computing Threat

Ed25519 (elliptic curve cryptography) may be broken by sufficiently large quantum computers using Shor's algorithm. This is not an immediate concern (estimates: 10–30 years), but:

- Ledger files retained for 6 years (SEC requirement) may outlive the cryptographic safety of their signatures.
- Post-quantum signatures (e.g., CRYSTALS-Dilithium) should be evaluated for future versions.

---

## 8. It Is Not a Complete Compliance Solution

This tool addresses **one** requirement in a larger compliance program:

| Framework | Requirement | This Tool | What's Still Needed |
|-----------|-------------|-----------|---------------------|
| SEC 17a-4 | Tamper-evident audit trail | ✅ | 3-6 year retention, immediate retrieval, human-readable format |
| SOC 2 | Change management | ✅ | Access controls, background checks, vendor management |
| PCI-DSS | Log integrity | ✅ | Network segmentation, encryption, vulnerability scanning |
| GDPR | Data subject rights | ❌ | Consent management, right to deletion, data mapping |

---

## 9. Performance Limits

| Metric | Current | Limit |
|--------|---------|-------|
| Records per second | ~1,000 (single-threaded) | Disk I/O bound |
| Ledger file size | Tested to 100MB | Memory for index rebuild |
| Verification speed | ~10,000 records/second | CPU bound (Ed25519 verify) |
| Export to SQLite | O(n) | Memory for SQL generation |

For high-frequency trading (millions of actions/second), this system would need:
- Batch appends (sign once per batch).
- Streaming verification (don't load entire ledger).
- Sharded ledgers (one per time window).

---

## 10. No Warranty

This software is provided as-is, without warranty of any kind. Compliance is your responsibility. Consult with:

- Your legal team
- Your compliance officer
- A qualified security assessor (QSA for PCI-DSS)
- Your auditor

before deploying in a regulated environment.

---

*If you discover a limitation not listed here, please open an issue.*