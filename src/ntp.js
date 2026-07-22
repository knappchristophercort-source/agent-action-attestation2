/**
 * NTP Clock Synchronization Check
 * 
 * Compliance frameworks (PCI-DSS, SOC 2) require synchronized clocks
 * across all systems generating audit logs. This module verifies
 * the system clock is within acceptable drift of NTP servers.
 */

const { execSync } = require('child_process');

function checkNTPSync() {
  try {
    // Check if ntpd or chronyd is running
    const ntpStatus = execSync('timedatectl status 2>/dev/null || echo "NTP status unknown"', { encoding: 'utf8' });
    const ntpSync = ntpStatus.includes('NTP synchronized: yes') || ntpStatus.includes('System clock synchronized: yes');

    if (!ntpSync) {
      console.warn('[NTP] WARNING: System clock is not NTP-synchronized');
      console.warn('[NTP] This may cause log correlation issues during audits');
      return false;
    }

    console.log('[NTP] System clock is synchronized');
    return true;
  } catch (err) {
    console.warn('[NTP] Could not check NTP status:', err.message);
    return false;
  }
}

function requireNTPSync() {
  const synced = checkNTPSync();
  if (!synced) {
    throw new Error('NTP synchronization required for compliance. Run: sudo timedatectl set-ntp true');
  }
}

module.exports = { checkNTPSync, requireNTPSync };
