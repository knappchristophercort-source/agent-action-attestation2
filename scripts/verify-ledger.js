const { WALLedger } = require('../src/ledger');
const { verifyChain } = require('../src/verify');
const fs = require('fs');

const ledgerPath = process.argv[2] || 'demo/compliance-ledger.wal';
const pubkeyPath = process.argv[3] || 'demo/public-key.pem';

if (!fs.existsSync(ledgerPath)) {
  console.error('Ledger not found:', ledgerPath);
  process.exit(1);
}

if (!fs.existsSync(pubkeyPath)) {
  console.error('Public key not found:', pubkeyPath);
  process.exit(1);
}

const ledger = new WALLedger(ledgerPath);
const publicKey = fs.readFileSync(pubkeyPath, 'utf8');

// File integrity check
const integrity = ledger.verifyFileIntegrity();
console.log('File integrity:', integrity.valid ? 'PASS ✓' : 'FAIL ✗');
if (!integrity.valid) {
  integrity.errors.forEach(e => console.log('  Error:', e));
}

// Chain verification
const report = verifyChain(ledger.all(), publicKey);
console.log('\nChain verification:', report.valid ? 'PASS ✓' : 'FAIL ✗');
console.log('  Records:', report.totalRecords);
console.log('  Hash valid:', report.hashValidCount + '/' + report.totalRecords);
console.log('  Signature valid:', report.signatureValidCount + '/' + report.totalRecords);
console.log('  Chain valid:', report.chainValidCount + '/' + report.totalRecords);

if (!report.valid) {
  console.log('\nFailed records:');
  report.checks.forEach((check, i) => {
    if (check.errors.length > 0) {
      console.log('  Record', i + ':', check.errors.join('; '));
    }
  });
  process.exit(1);
}

console.log('\n✓ All checks passed');
