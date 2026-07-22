const crypto = require('crypto');

/**
 * Generate an ephemeral Ed25519 keypair for this agent session.
 */
function generateSessionKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/**
 * Sign a payload with the agent's private key using Ed25519.
 * Node.js crypto.sign supports Ed25519 natively.
 */
function signPayload(privateKeyPem, payload) {
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.sign(null, data, privateKeyPem);
  return signature.toString('base64');
}

/**
 * Verify a signature against a payload and public key using Ed25519.
 */
function verifySignature(publicKeyPem, payload, signature) {
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const sigBuffer = Buffer.from(signature, 'base64');
  return crypto.verify(null, data, publicKeyPem, sigBuffer);
}

module.exports = { generateSessionKeypair, signPayload, verifySignature };
