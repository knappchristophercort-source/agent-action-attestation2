/**
 * Storage backends for compliance-grade persistence.
 */

class S3ObjectLockBackend {
  constructor(bucket, prefix, credentials) {
    this.bucket = bucket;
    this.prefix = prefix;
  }

  async append(record) {
    console.log(`[WORM] Would write to S3: ${this.bucket}/${this.prefix}/record-${record.sequence}.json`);
  }
}

class AzureImmutableBackend {
  constructor(container, credentials) {
    this.container = container;
  }

  async append(record) {
    console.log(`[WORM] Would write to Azure: ${this.container}/record-${record.sequence}.json`);
  }
}

class WebhookAlertBackend {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }

  async alert(tamperDetails) {
    console.log(`[ALERT] Would send to webhook: ${this.webhookUrl}`);
    console.log(`[ALERT] Details:`, tamperDetails);
  }
}

module.exports = {
  S3ObjectLockBackend,
  AzureImmutableBackend,
  WebhookAlertBackend,
};
