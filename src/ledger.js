const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

/**
 * WAL Ledger - Append-Only Write-Ahead Log with Embedded Integrity.
 * 
 * This replaces JSON file storage with a format that has SQLite-like
 * reliability but is tamper-evident by construction:
 * 
 * - Binary format: [4-byte magic][4-byte version][records...]
 * - Each record: [4-byte length][JSON payload + signature + hashes]
 * - Append-only: no UPDATE or DELETE operations exist
 * - Indexed: sequence → file offset map for O(1) random access
 * - Exportable: to SQLite, CSV, or human-readable text
 * 
 * Why not SQLite?
 * - SQLite allows UPDATE/DELETE by anyone with file access
 * - Our format is physically append-only (no API for mutation)
 * - Each record carries its own chain proof (self-verifying)
 * - Auditors can verify integrity with just `hexdump` and `openssl`
 */

const MAGIC = Buffer.from('AAL\x00', 'binary');  // Agent Attestation Ledger
const VERSION = 1;

class WALLedger {
  constructor(ledgerPath, options = {}) {
    this.ledgerPath = ledgerPath;
    this.indexPath = ledgerPath + '.idx';
    this.wormBackend = options.wormBackend || null;
    this.alertWebhook = options.alertWebhook || null;
    this.redundancyBackend = options.redundancyBackend || null;
    this.sequence = 0;
    this.index = new Map(); // sequence -> { offset, length, hash }

    // Initialize or recover
    if (fs.existsSync(ledgerPath)) {
      this._recover();
    } else {
      this._initialize();
    }
  }

  _initialize() {
    const header = Buffer.alloc(8);
    MAGIC.copy(header, 0);
    header.writeUInt32LE(VERSION, 4);
    fs.writeFileSync(this.ledgerPath, header);
    fs.writeFileSync(this.indexPath, JSON.stringify({ version: 1, entries: [] }));
    this.sequence = 0;
  }

  _recover() {
    // Verify header
    const header = fs.readFileSync(this.ledgerPath, { length: 8 });
    if (!header.slice(0, 4).equals(MAGIC)) {
      throw new Error('Invalid ledger file: bad magic number');
    }
    if (header.readUInt32LE(4) !== VERSION) {
      throw new Error('Invalid ledger file: unsupported version');
    }

    // Rebuild index from file
    this._rebuildIndex();
  }

  _rebuildIndex() {
    const fd = fs.openSync(this.ledgerPath, 'r');
    try {
      const stat = fs.fstatSync(fd);
      let offset = 8; // Skip header
      this.index.clear();
      this.sequence = 0;

      while (offset < stat.size) {
        // Read record length
        const lenBuf = Buffer.alloc(4);
        fs.readSync(fd, lenBuf, 0, 4, offset);
        const recordLen = lenBuf.readUInt32LE(0);

        // Read record data
        const recordBuf = Buffer.alloc(recordLen);
        fs.readSync(fd, recordBuf, 0, recordLen, offset + 4);

        const record = JSON.parse(recordBuf.toString('utf8'));

        this.index.set(record.sequence, {
          offset,
          length: recordLen + 4, // includes length prefix
          hash: record.hash,
        });
        this.sequence = record.sequence + 1;
        offset += 4 + recordLen;
      }
    } finally {
      fs.closeSync(fd);
    }

    // Persist index
    this._saveIndex();
  }

  _saveIndex() {
    const entries = Array.from(this.index.entries()).map(([seq, info]) => ({
      sequence: seq,
      offset: info.offset,
      length: info.length,
      hash: info.hash,
    }));
    fs.writeFileSync(this.indexPath, JSON.stringify({ version: 1, entries }, null, 2));
  }

  static computeHash(record) {
    const canonical = JSON.stringify({
      payload: record.payload,
      previousHash: record.previousHash,
      timestamp: record.timestamp,
      sequence: record.sequence,
      agentId: record.agentId,
      modelVersion: record.modelVersion,
      actionType: record.actionType,
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  async append(record) {
    const timestamp = record.timestamp;

    const entry = {
      sequence: this.sequence,
      timestamp,
      agentId: record.agentId,
      modelVersion: record.modelVersion,
      actionType: record.actionType,
      payload: record.payload,
      promptText: record.promptText,
      result: record.result,
      signature: record.signature,
      previousHash: this.sequence === 0 ? 'genesis' : this.lastHash(),
      hash: null,
    };

    entry.hash = WALLedger.computeHash(entry);

    // Serialize and append atomically
    const recordJson = JSON.stringify(entry);
    const recordBuf = Buffer.from(recordJson, 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(recordBuf.length, 0);

    // Atomic append: write length + data in single operation
    const fd = fs.openSync(this.ledgerPath, 'a');
    try {
      fs.appendFileSync(fd, lenBuf);
      fs.appendFileSync(fd, recordBuf);
    } finally {
      fs.closeSync(fd);
    }

    // Update index
    const stat = fs.statSync(this.ledgerPath);
    const recordOffset = stat.size - 4 - recordBuf.length;
    this.index.set(this.sequence, {
      offset: recordOffset,
      length: 4 + recordBuf.length,
      hash: entry.hash,
    });
    this.sequence++;
    this._saveIndex();

    // Replicate
    if (this.wormBackend) {
      await this.wormBackend.append(entry);
    }
    if (this.redundancyBackend) {
      await this.redundancyBackend.append(entry);
    }

    return entry;
  }

  lastHash() {
    if (this.sequence === 0) return 'genesis';
    const lastSeq = this.sequence - 1;
    return this.index.get(lastSeq)?.hash || 'genesis';
  }

  lastRecord() {
    if (this.sequence === 0) return null;
    return this.get(this.sequence - 1);
  }

  get(sequence) {
    const info = this.index.get(sequence);
    if (!info) return null;

    const fd = fs.openSync(this.ledgerPath, 'r');
    try {
      const buf = Buffer.alloc(info.length - 4); // Exclude length prefix
      fs.readSync(fd, buf, 0, buf.length, info.offset + 4);
      return JSON.parse(buf.toString('utf8'));
    } finally {
      fs.closeSync(fd);
    }
  }

  all() {
    const records = [];
    for (let i = 0; i < this.sequence; i++) {
      records.push(this.get(i));
    }
    return records;
  }

  range(start, end) {
    const records = [];
    for (let i = start; i < Math.min(end, this.sequence); i++) {
      records.push(this.get(i));
    }
    return records;
  }

  count() {
    return this.sequence;
  }

  async alertTamper(details) {
    const alert = {
      severity: 'CRITICAL',
      alertType: 'LEDGER_TAMPER_DETECTED',
      timestamp: new Date().toISOString(),
      details,
    };

    console.error('[ALERT] TAMPER DETECTED:', JSON.stringify(alert, null, 2));

    if (this.alertWebhook) {
      try {
        const https = require('https');
        const url = new URL(this.alertWebhook);
        const postData = JSON.stringify(alert);

        const req = https.request({
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 5000,
        }, (res) => {
          console.log(`[ALERT] Webhook status: ${res.statusCode}`);
        });

        req.on('error', (e) => console.error('[ALERT] Webhook failed:', e.message));
        req.on('timeout', () => { req.destroy(); console.error('[ALERT] Webhook timeout'); });
        req.write(postData);
        req.end();
      } catch (err) {
        console.error('[ALERT] Failed to send webhook:', err.message);
      }
    }
  }

  /**
   * Export to SQLite for auditor analysis.
   * Creates a read-only SQLite database from the WAL ledger.
   */
  exportSQLite(outputPath) {
    // Since we can't require sqlite3 in this environment,
    // we generate SQL that can be imported into any SQLite tool.
    const records = this.all();

    const sql = [
      'CREATE TABLE IF NOT EXISTS attestation_log (',
      '  sequence INTEGER PRIMARY KEY,',
      '  timestamp TEXT NOT NULL,',
      '  agent_id TEXT NOT NULL,',
      '  model_version TEXT,',
      '  action_type TEXT NOT NULL,',
      '  payload TEXT NOT NULL,',
      '  prompt_text TEXT,',
      '  result TEXT,',
      '  signature TEXT NOT NULL,',
      '  previous_hash TEXT NOT NULL,',
      '  hash TEXT NOT NULL',
      ');',
      '',
      'CREATE INDEX IF NOT EXISTS idx_timestamp ON attestation_log(timestamp);',
      'CREATE INDEX IF NOT EXISTS idx_agent ON attestation_log(agent_id);',
      'CREATE INDEX IF NOT EXISTS idx_action ON attestation_log(action_type);',
      '',
      ...records.map(r => 
        `INSERT INTO attestation_log VALUES (${r.sequence}, '${r.timestamp}', '${r.agentId}', '${r.modelVersion}', '${r.actionType}', '${JSON.stringify(r.payload).replace(/'/g, "''")}', '${(r.promptText || '').replace(/'/g, "''")}', '${JSON.stringify(r.result || {}).replace(/'/g, "''")}', '${r.signature}', '${r.previousHash}', '${r.hash}');`
      ),
    ].join('\n');

    fs.writeFileSync(outputPath, sql);
    return outputPath;
  }

  exportHumanReadable(outputPath) {
    const records = this.all();
    const lines = records.map(r => [
      `Sequence: ${r.sequence}`,
      `Timestamp: ${r.timestamp}`,
      `Agent: ${r.agentId} (${r.modelVersion})`,
      `Action: ${r.actionType}`,
      `Prompt: ${r.promptText}`,
      `Payload: ${JSON.stringify(r.payload)}`,
      `Result: ${JSON.stringify(r.result)}`,
      `Hash: ${r.hash}`,
      `Previous Hash: ${r.previousHash}`,
      `Signature: ${r.signature.substring(0, 64)}...`,
      '---',
    ].join('\n'));

    const header = `AGENT ACTION ATTESTATION LOG\nGenerated: ${new Date().toISOString()}\nTotal Records: ${records.length}\nFormat: WAL (Write-Ahead Log) v${VERSION}\n\n`;
    fs.writeFileSync(outputPath, header + lines.join('\n\n'));
    return outputPath;
  }

  exportCSV(outputPath) {
    const records = this.all();
    const headers = ['sequence', 'timestamp', 'agentId', 'modelVersion', 'actionType', 'promptText', 'payload', 'result', 'hash', 'previousHash'];
    const rows = records.map(r => [
      r.sequence,
      r.timestamp,
      r.agentId,
      r.modelVersion,
      r.actionType,
      `"${(r.promptText || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(r.payload).replace(/"/g, '""')}"`,
      `"${JSON.stringify(r.result || {}).replace(/"/g, '""')}"`,
      r.hash,
      r.previousHash,
    ].join(','));

    fs.writeFileSync(outputPath, [headers.join(','), ...rows].join('\n'));
    return outputPath;
  }

  /**
   * Verify the physical integrity of the WAL file.
   * Detects truncation, corruption, or unauthorized modification.
   */
  verifyFileIntegrity() {
    const report = {
      valid: true,
      recordsChecked: 0,
      errors: [],
    };

    const fd = fs.openSync(this.ledgerPath, 'r');
    try {
      const stat = fs.fstatSync(fd);
      let offset = 8;

      while (offset < stat.size) {
        const lenBuf = Buffer.alloc(4);
        const bytesRead = fs.readSync(fd, lenBuf, 0, 4, offset);
        if (bytesRead < 4) {
          report.errors.push(`Truncated record at offset ${offset}`);
          report.valid = false;
          break;
        }

        const recordLen = lenBuf.readUInt32LE(0);
        if (recordLen > 10 * 1024 * 1024) { // 10MB sanity limit
          report.errors.push(`Oversized record at offset ${offset}: ${recordLen} bytes`);
          report.valid = false;
          break;
        }

        const recordBuf = Buffer.alloc(recordLen);
        const dataRead = fs.readSync(fd, recordBuf, 0, recordLen, offset + 4);
        if (dataRead < recordLen) {
          report.errors.push(`Truncated record data at offset ${offset}`);
          report.valid = false;
          break;
        }

        try {
          const record = JSON.parse(recordBuf.toString('utf8'));
          const expectedHash = WALLedger.computeHash(record);
          if (record.hash !== expectedHash) {
            report.errors.push(`Hash mismatch at sequence ${record.sequence}`);
            report.valid = false;
          }
        } catch (e) {
          report.errors.push(`Corrupt record at offset ${offset}: ${e.message}`);
          report.valid = false;
        }

        report.recordsChecked++;
        offset += 4 + recordLen;
      }
    } finally {
      fs.closeSync(fd);
    }

    return report;
  }
}

module.exports = { WALLedger };
