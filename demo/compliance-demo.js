const path = require('path');
const fs = require('fs');
const { generateSessionKeypair } = require('../src/signer');
const { WALLedger } = require('../src/ledger');
const { attestedTool } = require('../src/interceptor');
const { verifyChain } = require('../src/verify');

const LEDGER_PATH = path.join(__dirname, 'demo-ledger.wal');
const PUBKEY_PATH = path.join(__dirname, 'public-key.pem');
const JSON_LEDGER_PATH = path.join(__dirname, 'demo-ledger.json');

// Clean start
[LEDGER_PATH, LEDGER_PATH + '.idx'].forEach(p => {
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

/**
 * Map the detailed verifyChain report to the simplified summary format
 * used in the demo output.
 */
function summarizeVerification(report) {
  const chainIntact = report.hashValidCount === report.totalRecords &&
                      report.chainValidCount === report.totalRecords;

  const summary = {
    valid: report.valid,
    recordsVerified: report.totalRecords,
    chainIntact,
    allSignaturesValid: report.signatureValidCount === report.totalRecords,
  };

  if (!report.valid) {
    for (let i = 0; i < report.checks.length; i++) {
      const check = report.checks[i];
      if (!check.signatureValid) {
        summary.tamperedRecordIndex = i;
        summary.error = `Signature mismatch on record ${i}`;
        break;
      }
    }
    if (summary.tamperedRecordIndex === undefined) {
      for (let i = 0; i < report.checks.length; i++) {
        const check = report.checks[i];
        if (!check.chainValid || !check.hashValid) {
          summary.tamperedRecordIndex = i;
          summary.error = `Chain break at record ${i}`;
          break;
        }
      }
    }
  }

  return summary;
}

async function main() {
  console.log('=== Agent Action Attestation — Demo ===\n');

  const { publicKeyPem, privateKeyPem } = generateSessionKeypair();
  fs.writeFileSync(PUBKEY_PATH, publicKeyPem);

  const agentId = 'agent-finance-bot-7';
  const modelVersion = 'claude-sonnet-5';

  console.log(`Session started for ${agentId} (${modelVersion})`);
  console.log('Public key (share this for verification):');
  console.log(publicKeyPem.trim());
  console.log();

  const ledger = new WALLedger(LEDGER_PATH);

  async function realSendEmail(payload) {
    // "attached" reflects that the email carries the report as an attachment
    console.log(`   [effector] Sending email to ${payload.to}: "${payload.subject} attached"`);
    return { status: 'sent', messageId: 'msg_' + Date.now() };
  }

  async function realExecuteTrade(payload) {
    console.log(`   [effector] Executing trade: ${payload.side} ${payload.qty} ${payload.symbol}`);
    return { status: 'filled', orderId: 'ord_' + Date.now() };
  }

  const sendEmail = attestedTool({ agentId, modelVersion, privateKeyPem, ledger, actionType: 'send_email', fn: realSendEmail });
  const executeTrade = attestedTool({ agentId, modelVersion, privateKeyPem, ledger, actionType: 'execute_trade', fn: realExecuteTrade });

  console.log('--- Agent taking actions ---');
  await sendEmail({ to: 'client@example.com', subject: 'Q3 portfolio summary' }, { promptText: 'User asked: send the client their Q3 summary.' });
  await executeTrade({ side: 'BUY', qty: 100, symbol: 'ACME' }, { promptText: 'User asked: buy 100 shares of ACME.' });
  await executeTrade({ side: 'SELL', qty: 50, symbol: 'ACME' }, { promptText: 'User asked: take partial profit at 10% gain.' });
  console.log();

  // Pass 1: verify the untouched ledger
  const records = ledger.all();
  const report1 = verifyChain(records, publicKeyPem);
  console.log('=== Independent Verification Pass 1 (untouched ledger) ===');
  console.log(JSON.stringify(summarizeVerification(report1), null, 2));
  console.log();

  // Simulate tampering: alter the payload of record 2 (the SELL trade — last of 3 records)
  // Index 2 = sequence 2 = the third record appended above.
  const TAMPERED_INDEX = 2;
  console.log('=== Simulating tampering ===');
  const tamperedRecords = records.map((r, i) => {
    if (i === TAMPERED_INDEX) {
      return { ...r, payload: { ...r.payload, qty: 9999 } };
    }
    return r;
  });

  const report2 = verifyChain(tamperedRecords, publicKeyPem);
  console.log('=== Independent Verification Pass 2 (after tampering) ===');
  console.log(JSON.stringify(summarizeVerification(report2), null, 2));
  console.log();

  // Export JSON snapshot for auditors
  fs.writeFileSync(JSON_LEDGER_PATH, JSON.stringify(records, null, 2));
  console.log('Demo complete. Ledger file: ./demo-ledger.json');

  if (!report1.valid) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
