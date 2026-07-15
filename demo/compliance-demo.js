const path = require('path');
const fs = require('fs');
const { generateSessionKeypair } = require('../src/signer');
const { WALLedger } = require('../src/ledger');
const { attestedTool } = require('../src/interceptor');
const { verifyChain } = require('../src/verify');
const { checkNTPSync } = require('../src/ntp');

const LEDGER_PATH = path.join(__dirname, 'compliance-ledger.wal');
const BACKUP_PATH = path.join(__dirname, 'compliance-ledger-backup.wal');
const PUBKEY_PATH = path.join(__dirname, 'public-key.pem');

// Clean start
[LEDGER_PATH, LEDGER_PATH + '.idx', BACKUP_PATH, BACKUP_PATH + '.idx'].forEach(p => {
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

async function main() {
  checkNTPSync();

  const { publicKeyPem, privateKeyPem } = generateSessionKeypair();
  fs.writeFileSync(PUBKEY_PATH, publicKeyPem);

  const agentId = 'agent-finance-bot-7';
  const modelVersion = 'claude-sonnet-5';
  const ledger = new WALLedger(LEDGER_PATH);
  const backupLedger = new WALLedger(BACKUP_PATH);

  async function realSendEmail(payload) {
    return { status: 'sent', messageId: 'msg_' + Date.now() };
  }

  async function realExecuteTrade(payload) {
    return { status: 'filled', orderId: 'ord_' + Date.now() };
  }

  async function realTransferFunds(payload) {
    return { status: 'completed', transferId: 'txn_' + Date.now() };
  }

  const sendEmail = attestedTool({ agentId, modelVersion, privateKeyPem, ledger, actionType: 'send_email', fn: realSendEmail });
  const executeTrade = attestedTool({ agentId, modelVersion, privateKeyPem, ledger, actionType: 'execute_trade', fn: realExecuteTrade });
  const transferFunds = attestedTool({ agentId, modelVersion, privateKeyPem, ledger, actionType: 'transfer_funds', fn: realTransferFunds });

  await sendEmail({ to: 'client@example.com', subject: 'Q3 portfolio summary' }, { promptText: 'User asked: send the client their Q3 summary.' });
  await executeTrade({ side: 'BUY', qty: 100, symbol: 'ACME' }, { promptText: 'User asked: buy 100 shares of ACME.' });
  await executeTrade({ side: 'SELL', qty: 50, symbol: 'ACME' }, { promptText: 'User asked: take partial profit at 10% gain.' });
  await transferFunds({ amount: 5000, destination: 'acct_12345', currency: 'USD' }, { promptText: 'User asked: transfer $5,000 to operating account.' });

  // Replicate to backup
  const records = ledger.all();
  for (const record of records) {
    await backupLedger.append({
      agentId: record.agentId,
      modelVersion: record.modelVersion,
      actionType: record.actionType,
      payload: record.payload,
      promptText: record.promptText,
      result: record.result,
      timestamp: record.timestamp,
      signature: record.signature,
    });
  }

  // Verify
  const report = verifyChain(ledger.all(), publicKeyPem);
  console.log('\n=== Verification ===');
  console.log('Result:', report.valid ? 'VALID ✓' : 'INVALID ✗');
  console.log('Records:', report.totalRecords);
  console.log('Hash:', report.hashValidCount + '/' + report.totalRecords);
  console.log('Signature:', report.signatureValidCount + '/' + report.totalRecords);
  console.log('Chain:', report.chainValidCount + '/' + report.totalRecords);

  if (!report.valid) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
