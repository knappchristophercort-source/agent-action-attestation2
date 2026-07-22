const { signPayload } = require('./signer');

/**
 * attestedTool - Wraps an effector function with cryptographic attestation.
 * 
 * Every invocation produces a signed, chained record in the ledger.
 */
function attestedTool({ agentId, modelVersion, privateKeyPem, ledger, actionType, fn }) {
  return async function attestedWrapper(payload, meta = {}) {
    const { promptText = '[no prompt provided]' } = meta;

    // Execute the real effector FIRST (failures are also logged)
    let result;
    let error = null;
    try {
      result = await fn(payload);
    } catch (err) {
      error = err;
      result = { status: 'error', message: err.message };
    }

    // Use a single timestamp for both signing and ledger
    const timestamp = new Date().toISOString();

    // Build the attestation payload (what gets signed)
    const attestationPayload = {
      agentId,
      modelVersion,
      actionType,
      payload,
      promptText,
      result,
      timestamp,
    };

    // Cryptographically sign the action
    const signature = signPayload(privateKeyPem, attestationPayload);

    // Append to ledger (immutable, chained, tamper-evident)
    // Pass the SAME timestamp and result so verification can reconstruct exactly
    await ledger.append({
      agentId,
      modelVersion,
      actionType,
      payload,
      promptText,
      result,
      timestamp,  // Same timestamp used in signature
      signature,
    });

    // Re-throw if the original effector failed
    if (error) throw error;
    return result;
  };
}

module.exports = { attestedTool };
