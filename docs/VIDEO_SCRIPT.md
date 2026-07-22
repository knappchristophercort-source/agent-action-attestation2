# 60-Second Demo Video Script
# 
# Recording setup:
# - Terminal: 100x30, font: 14pt monospace (Fira Code or JetBrains Mono)
# - Theme: dark background, green/white text
# - No music. No transitions. Just terminal + voice.
# - Tool: asciinema (recommended) or screen recording
#
# To record with asciinema:
#   asciinema rec demo.cast --command "bash -c 'node demo/compliance-demo.js'"
#   asciinema play demo.cast
#   asciinema upload demo.cast  # Gives you a shareable URL

---

## NARRATION (read calmly, no hype)

[0:00-0:05]
"I work in fintech. Our compliance officer asked: how do we prove our AI agents didn't do something they shouldn't have?"

[0:05-0:12]
"This is agent-action-attestation. It wraps any AI agent action with cryptographic proof."

[0:12-0:20]
"Watch. We spin up an agent identity, wrap three effector functions — send email, execute trade, transfer funds — and the agent takes actions."

[SCREEN: run `node demo/compliance-demo.js` up to "All actions attested"]

[0:20-0:28]
"Every action is signed with Ed25519, hash-chained to the previous one, and stored in an append-only WAL file."

[SCREEN: show the WAL file with hexdump -C]

[0:28-0:35]
"Now the auditor runs verification. Untouched ledger: all four records pass. Hash valid. Signature valid. Chain valid."

[SCREEN: show "Result: VALID ✓"]

[0:35-0:45]
"But what if someone tampers with a record after the fact? We simulate an attacker changing a trade quantity from fifty to ninety-nine thousand."

[SCREEN: show tampering code, then re-run verification]

[0:45-0:55]
"Verification fails. Hash mismatch on record two. Chain break on record three. The backup ledger, written in real-time, remains valid."

[SCREEN: show "Result: INVALID ✗" and "Backup ledger valid: YES ✓"]

[0:55-1:00]
"Open source. Apache two. One-line integration. Links in the description."

[SCREEN: show GitHub repo URL, freeze for 3 seconds]

---

## SCREEN COMMANDS (copy-paste these exactly)

# Setup (do this before recording)
cd /path/to/agent-attestation
clear

# Command 1: Run the demo
node demo/compliance-demo.js

# Command 2: Show WAL file structure
hexdump -C demo/compliance-ledger.wal | head -10

# Command 3: Show the exports
ls -la demo/audit-export.*

# Command 4: Show SQLite export
head -20 demo/audit-export.sql

---

## POST-PRODUCTION (if editing)

- Trim silence between commands
- Speed up the demo run 1.5x if it feels slow
- Add captions for key phrases: "VALID ✓", "INVALID ✗", "Hash mismatch"
- End card: GitHub repo URL + "npm install agent-action-attestation"
- Total runtime target: 55-65 seconds
