# Threat Model: Agent Action Attestation

> Document version: 1.0  
> Last updated: 2026-07-10  
> Scope: agent-action-attestation v2.0.0 (WAL ledger)

---

## 1. What This System Does

Agent Action Attestation creates a **cryptographically signed, hash-chained, append-only log** of every action an AI agent takes in the real world (sending emails, executing trades, transferring funds). It answers the question:

> **"If an auditor shows up tomorrow, how do you prove the AI didn't do something it shouldn't have?"**

The system does **not** answer:
- "Was the AI's decision correct?"
- "Was the AI's decision ethical?"
- "Did the AI hallucinate the user's intent?"

---

## 2. Threat Actors

| Actor | Motivation | Capability |
|-------|-----------|------------|
| **External attacker** | Forge audit trail to cover unauthorized trades | Network access, may steal signing keys |
| **Malicious insider** | Hide evidence of rule-breaking or embezzlement | File system access, may have admin rights |
| **Compromised AI agent** | Execute harmful actions autonomously | Valid signing key (if stolen), API access |
| **Auditor / regulator** | Verify compliance, detect fraud | Read-only access to ledger and public key |
| **System administrator** | Maintain infrastructure | Root access to servers, backup systems |

---

## 3. Assets & Protections

### 3.1 The Ledger File (`*.wal`)

**What it is:** Binary append-only log containing all attested actions.

**Threats:**

| Threat | Protection | Residual Risk |
|--------|-----------|---------------|
| Modification after write | Hash chain: each record links to previous record's hash. Changing any record breaks the chain. | Attacker with file access can replace entire file with forged copy (detected by signature verification if keys uncompromised) |
| Deletion of records | Append-only format: no API for deletion. File truncation detected by integrity scan. | Attacker with OS-level access can delete or replace entire file |
| Insertion of fake records | Signature verification: every record signed with Ed25519 private key. | If private key is stolen, attacker can create valid-looking records |
| Reordering of records | Monotonic sequence numbers + previousHash chain. | Same as modification — breaks chain |

**What the auditor sees:**
```
Record N: hash = SHA256(payload + previousHash + timestamp + sequence + ...)
Record N+1: previousHash = hash of Record N
```

If Record N is modified, its hash changes. Record N+1's `previousHash` no longer matches. The chain breaks.

### 3.2 The Signature

**What it is:** Ed25519 signature over the canonical JSON of `{ agentId, modelVersion, actionType, payload, promptText, result, timestamp }`.

**Threats:**

| Threat | Protection | Residual Risk |
|--------|-----------|---------------|
| Signature forgery | Ed25519 is cryptographically secure against forgery without private key. | Quantum computing (future), implementation bugs |
| Key theft | Session keys are ephemeral (one per run). HSM/KMS recommended for production. | If key is exfiltrated during session, attacker can sign valid records |
| Weak randomness | Node.js crypto uses OS entropy pool (/dev/urandom). | Compromised OS entropy source |

### 3.3 The Prompt Text

**What it is:** The claimed user instruction that triggered the action.

**Threats:**

| Threat | Protection | Residual Risk |
|--------|-----------|---------------|
| Agent lies about prompt | **None.** The prompt is self-reported by the agent. | A compromised or misaligned agent can attribute a malicious action to an innocent prompt. This is a **fundamental limitation** of the system. |

> **Critical honesty:** This system attests *that an action happened* and *what prompt was claimed*. It does **not** verify that the prompt actually caused the action or that the prompt itself was legitimate.

### 3.4 The Backup / Redundancy

**What it is:** Secondary WAL file written to separate storage.

**Threats:**

| Threat | Protection | Residual Risk |
|--------|-----------|---------------|
| Primary ledger destroyed | Backup ledger contains identical records. | If attacker compromises both primary and backup simultaneously, both can be destroyed |
| Backup tampered | Same protections as primary (hash chain + signatures). | Backup written in real-time; if primary is compromised before backup write, backup may contain bad data |

---

## 4. Attack Scenarios

### Scenario 1: Attacker Modifies a Record After the Fact

**Steps:**
1. Attacker gains file system access.
2. Attacker edits `payload.qty` in Record 2 from `50` to `99999`.
3. Attacker saves the file.

**Detection:**
- `verifyFileIntegrity()` scans the WAL. Record 2's recomputed hash doesn't match stored hash.
- `verifyChain()` detects hash mismatch on Record 2 and chain break on Record 3.
- Alert fires to configured webhook.

**What the auditor sees:**
```
Record 2: Hash mismatch: stored=abc..., expected=def...
Record 3: Chain break: previousHash=abc..., expected=def...
Result: INVALID
```

### Scenario 2: Attacker Forges a New Record

**Steps:**
1. Attacker steals the agent's private key.
2. Attacker creates a fake record: `{ actionType: 'transfer_funds', payload: { amount: 1000000, destination: 'attacker_account' } }`.
3. Attacker signs it with stolen key.
4. Attacker appends it to the WAL.

**Detection:**
- Signature is valid (key was stolen).
- Hash chain is valid (record correctly links to previous).
- **No detection by this system alone.**

**Mitigations (outside this system):**
- Key stored in HSM/KMS (theft requires physical breach).
- Key rotation every N hours.
- Anomaly detection on action patterns ("why is the agent transferring $1M at 3 AM?").
- Dual-authorization for high-value actions.

### Scenario 3: Compromised Agent Signs Malicious Actions

**Steps:**
1. Attacker compromises the AI agent itself (prompt injection, model theft, etc.).
2. Agent autonomously executes harmful trades.
3. Each action is correctly signed and logged.

**Detection:**
- **None by this system.** The log accurately reflects what the agent did.
- Detection requires separate systems: anomaly detection, human oversight, policy enforcement.

**What this system provides:**
- A complete, tamper-proof record of exactly what the compromised agent did.
- Evidence for incident response and regulatory reporting.
- Attribution: "Agent X, running Model Y, executed these specific actions at these times."

### Scenario 4: Attacker Replaces Entire Ledger File

**Steps:**
1. Attacker deletes `compliance-ledger.wal`.
2. Attacker replaces it with a fabricated WAL containing fake history.

**Detection:**
- Magic number mismatch (if attacker uses wrong format).
- Signature verification fails (if attacker doesn't have private key).
- Backup ledger comparison reveals discrepancy.
- **If attacker has private key and creates valid signatures:** No detection by this system alone.

### Scenario 5: Clock Manipulation

**Steps:**
1. Attacker manipulates system clock to backdate or postdate records.

**Detection:**
- NTP sync check at startup (`checkNTPSync()`).
- In production: `requireNTPSync()` hard-fails if clock is unsynchronized.
- Cross-reference with independent NTP logs.

**Residual risk:** Attacker with root access can manipulate NTP daemon.

---

## 5. What This System Does NOT Protect Against

| Limitation | Why | Mitigation (External) |
|------------|-----|----------------------|
| **Agent lies about prompt** | Prompt is self-reported | Human-in-the-loop review, prompt logging at ingress, separate user action log |
| **Key theft during session** | Ephemeral key exists in memory | HSM/KMS, key rotation, memory encryption |
| **Real-time action interception** | Attacker modifies action before signing | Network segmentation, API authentication, rate limiting |
| **Denial of service** | Attacker floods ledger with noise | Rate limiting, resource quotas, log rotation |
| **Logical errors in agent** | Agent makes wrong but well-intentioned decisions | Testing, guardrails, human oversight |
| **Backup compromise** | Attacker controls both primary and backup | Air-gapped backups, write-once media, geographic separation |
| **Quantum computing** | Ed25519 may be broken by Shor's algorithm | Post-quantum signatures (future roadmap) |

---

## 6. Trust Assumptions

1. **The operating system is not compromised at boot time.** If the kernel is rootkitted, all bets are off.
2. **Node.js crypto module is correct.** We delegate to OpenSSL/LibreSSL via Node.js.
3. **The private key is not exfiltrated during the session.** Ephemeral keys reduce window but don't eliminate risk.
4. **NTP is trustworthy.** If NTP servers are compromised, timestamps are unreliable.
5. **The effector function (the real action) is not bypassed.** If an attacker calls `realExecuteTrade` directly without `attestedTool`, no log is created.

---

## 7. Verification Procedures

### For Auditors

**What you need:**
- The WAL ledger file (`*.wal`)
- The index file (`*.wal.idx`) — optional, for performance
- The agent's public key (shared at session start)
- The verification script (`src/verify.js`)

**What you do:**
```bash
node -e "
const { WALLedger } = require('./src/ledger');
const { verifyChain } = require('./src/verify');
const fs = require('fs');

const ledger = new WALLedger('path/to/ledger.wal');
const publicKey = fs.readFileSync('path/to/public-key.pem', 'utf8');

// Check file integrity (corruption, truncation)
const integrity = ledger.verifyFileIntegrity();
console.log('File integrity:', integrity.valid ? 'PASS' : 'FAIL');

// Verify cryptographic chain
const report = verifyChain(ledger.all(), publicKey);
console.log('Chain valid:', report.valid ? 'PASS' : 'FAIL');
console.log('Hash valid:', report.hashValidCount, '/', report.totalRecords);
console.log('Signature valid:', report.signatureValidCount, '/', report.totalRecords);
"
```

**What a passing result means:**
- The file has not been corrupted or truncated.
- Every record's hash matches its content.
- Every record's signature is valid.
- The hash chain is unbroken (no records modified, inserted, or reordered).

**What a passing result does NOT mean:**
- The actions were ethical or correct.
- The prompts were genuine.
- The agent was not compromised when it signed the records.

---

## 8. Security Checklist (Pre-Deployment)

- [ ] Private keys stored in HSM or cloud KMS (AWS KMS, Azure Key Vault, GCP Cloud HSM)
- [ ] `requireNTPSync()` enforced at agent startup
- [ ] Backup ledger written to geographically separate storage
- [ ] Alert webhook configured and tested (PagerDuty, Splunk, Datadog)
- [ ] Ledger files have restrictive permissions (`chmod 600`)
- [ ] Log rotation policy defined (SEC: 3-6 years retention)
- [ ] Regular automated verification runs (hourly/daily cron)
- [ ] Incident response playbook for tamper detection alerts
- [ ] Separate roles: key custodian ≠ storage admin ≠ auditor

---

## 9. Glossary

| Term | Definition |
|------|-----------|
| **Attestation** | A cryptographic statement that an action occurred, signed by the agent's identity |
| **Effector** | The real-world function that performs an action (e.g., `executeTrade`) |
| **Hash chain** | Each record contains the hash of the previous record, creating a linked sequence |
| **WAL** | Write-Ahead Log — append-only storage format that cannot be modified |
| **WORM** | Write Once, Read Many — storage that prevents modification after writing |

---

*This threat model is a living document. If you identify a threat not covered here, please open a security issue (see SECURITY.md).*