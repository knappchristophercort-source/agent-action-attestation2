const crypto = require('crypto');
const { verifySignature } = require('./signer');

/**
 * verifyChain - Independent verification of ledger integrity.
 * 
 * Checks:
 * 1. Hash chain integrity (each record links to previous)
 * 2. Signature validity (each record signed by agent)
 * 3. No gaps, no reordering, no modifications
 */
function verifyChain(records, publicKeyPem, options = {}) {
  const report = {
    valid: true,
    totalRecords: records.length,
    checks: [],
    firstTimestamp: records[0]?.timestamp || null,
    lastTimestamp: records[records.length - 1]?.timestamp || null,
  };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const check = {
      sequence: record.sequence,
      timestamp: record.timestamp,
      actionType: record.actionType,
      hashValid: false,
      signatureValid: false,
      chainValid: false,
      errors: [],
    };

    // Check 1: Sequence continuity
    if (record.sequence !== i) {
      check.errors.push(`Sequence mismatch: expected ${i}, got ${record.sequence}`);
      report.valid = false;
    }

    // Check 2: Hash integrity (recompute hash from record fields)
    const canonical = JSON.stringify({
      payload: record.payload,
      previousHash: record.previousHash,
      timestamp: record.timestamp,
      sequence: record.sequence,
      agentId: record.agentId,
      modelVersion: record.modelVersion,
      actionType: record.actionType,
    });
    const expectedHash = crypto.createHash('sha256').update(canonical).digest('hex');

    if (record.hash !== expectedHash) {
      check.errors.push(`Hash mismatch: stored=${record.hash}, expected=${expectedHash}`);
      report.valid = false;
    } else {
      check.hashValid = true;
    }

    // Check 3: Chain linking
    if (i === 0) {
      if (record.previousHash !== 'genesis') {
        check.errors.push('Genesis record must have previousHash="genesis"');
        report.valid = false;
      } else {
        check.chainValid = true;
      }
    } else {
      const prevRecord = records[i - 1];
      const prevCanonical = JSON.stringify({
        payload: prevRecord.payload,
        previousHash: prevRecord.previousHash,
        timestamp: prevRecord.timestamp,
        sequence: prevRecord.sequence,
        agentId: prevRecord.agentId,
        modelVersion: prevRecord.modelVersion,
        actionType: prevRecord.actionType,
      });
      const expectedPrevHash = crypto.createHash('sha256').update(prevCanonical).digest('hex');

      if (record.previousHash !== expectedPrevHash) {
        check.errors.push(`Chain break at ${i}: previousHash=${record.previousHash}, expected=${expectedPrevHash}`);
        report.valid = false;
      } else {
        check.chainValid = true;
      }
    }

    // Check 4: Signature validity
    // Reconstruct the EXACT payload that was signed
    const attestationPayload = {
      agentId: record.agentId,
      modelVersion: record.modelVersion,
      actionType: record.actionType,
      payload: record.payload,
      promptText: record.promptText,
      result: record.result || { status: 'unknown' },
      timestamp: record.timestamp,
    };

    try {
      const sigValid = verifySignature(publicKeyPem, attestationPayload, record.signature);
      if (sigValid) {
        check.signatureValid = true;
      } else {
        check.errors.push('Signature verification failed');
        report.valid = false;
      }
    } catch (err) {
      check.errors.push(`Signature verification error: ${err.message}`);
      report.valid = false;
    }

    report.checks.push(check);
  }

  // Summary
  report.hashValidCount = report.checks.filter(c => c.hashValid).length;
  report.signatureValidCount = report.checks.filter(c => c.signatureValid).length;
  report.chainValidCount = report.checks.filter(c => c.chainValid).length;

  return report;
}

module.exports = { verifyChain };
