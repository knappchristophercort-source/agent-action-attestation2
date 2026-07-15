# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | ✅ Yes |
| 1.x     | ❌ No |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Instead, email security@your-domain.com with:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We will respond within 48 hours and coordinate disclosure.

## Security Checklist for Deployers

- [ ] Private keys in HSM/KMS
- [ ] NTP synchronization enforced
- [ ] Backup to WORM storage
- [ ] Alert webhooks tested
- [ ] File permissions restricted (600)
- [ ] Regular automated verification
- [ ] Incident response playbook ready
