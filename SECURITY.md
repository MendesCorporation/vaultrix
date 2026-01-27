# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.0.1   | :white_check_mark: |

## Reporting a Vulnerability

The Vaultrix team takes security bugs seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report a Security Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **contato@apptrix.app**

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the following information in your report:

* Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
* Full paths of source file(s) related to the manifestation of the issue
* The location of the affected source code (tag/branch/commit or direct URL)
* Any special configuration required to reproduce the issue
* Step-by-step instructions to reproduce the issue
* Proof-of-concept or exploit code (if possible)
* Impact of the issue, including how an attacker might exploit it

This information will help us triage your report more quickly.

### What to Expect

* **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
* **Communication**: We will keep you informed about our progress throughout the process
* **Timeline**: We aim to patch critical vulnerabilities within 7 days
* **Credit**: We will credit you in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices

### For Administrators

1. **Strong Passwords**
   - Use strong, unique passwords for all accounts
   - Enable MFA for all users, especially administrators
   - Rotate passwords regularly

2. **Environment Variables**
   - Never commit `.env` files to version control
   - Use strong, randomly generated values for `AUTH_SECRET` and `ENCRYPTION_PEPPER`
   - Rotate secrets periodically

3. **Network Security**
   - Use HTTPS in production (configure reverse proxy)
   - Restrict database access to application only
   - Use firewall rules to limit access
   - Consider using a VPN for administrative access

4. **Updates**
   - Keep Vaultrix updated to the latest version
   - Monitor security advisories
   - Apply security patches promptly

5. **Backups**
   - Enable automated backups
   - Store backups securely and encrypted
   - Test restore procedures regularly
   - Keep backups in a separate location

6. **Monitoring**
   - Review audit logs regularly
   - Set up alerts for suspicious activities
   - Monitor failed login attempts
   - Track privilege escalations

### For Developers

1. **Code Security**
   - Follow secure coding practices
   - Validate and sanitize all inputs
   - Use parameterized queries (Prisma handles this)
   - Avoid storing sensitive data in logs

2. **Dependencies**
   - Keep dependencies updated
   - Run `npm audit` regularly
   - Review dependency changes before updating
   - Use lock files (`package-lock.json`)

3. **Authentication**
   - Never store passwords in plain text
   - Use Argon2id for password hashing
   - Implement rate limiting on auth endpoints
   - Use secure session management

4. **Encryption**
   - Use AES-256-GCM for data encryption
   - Never hardcode encryption keys
   - Use per-user encryption keys
   - Implement proper key rotation

5. **API Security**
   - Validate all API inputs
   - Implement proper authorization checks
   - Use CSRF protection
   - Rate limit API endpoints

## Security Features

### Implemented Security Measures

1. **Encryption**
   - AES-256-GCM encryption for sensitive data
   - Argon2id password hashing
   - Per-user Data Encryption Keys (DEK)
   - Master key derivation from user password

2. **Authentication**
   - Session-based authentication
   - Multi-factor authentication (TOTP)
   - Secure password reset flow
   - Session timeout and rotation

3. **Authorization**
   - Role-based access control (RBAC)
   - Resource-level permissions
   - Group-based access control
   - Principle of least privilege

4. **Audit & Monitoring**
   - Complete audit trail
   - IP address logging
   - User agent tracking
   - Failed login attempt tracking

5. **Data Protection**
   - Input validation and sanitization
   - SQL injection prevention (Prisma ORM)
   - XSS protection
   - CSRF protection

6. **Network Security**
   - Rate limiting on sensitive endpoints
   - Secure headers configuration
   - HTTPS enforcement (in production)

## Known Security Considerations

### Database Access
- The application requires direct database access
- Ensure PostgreSQL is not exposed to the internet
- Use strong database passwords
- Consider using connection pooling with authentication

### SSH Credentials
- SSH credentials are encrypted at rest
- Credentials are decrypted only when needed
- Consider using SSH keys instead of passwords
- Rotate SSH credentials regularly

### Monitoring Agent
- Agent uses token-based authentication
- Tokens are hashed before storage
- Consider using HTTPS for agent communication
- Rotate agent tokens periodically

## Compliance

Vaultrix is designed with security and compliance in mind:

- **Data Encryption**: All sensitive data encrypted at rest
- **Audit Logging**: Complete audit trail for compliance
- **Access Control**: Granular RBAC system
- **Data Retention**: Configurable backup retention
- **Export Capabilities**: Audit log export for compliance reporting

## Security Updates

Security updates will be released as soon as possible after a vulnerability is confirmed. Updates will be announced via:

- GitHub Security Advisories
- Release notes
- Email notifications (for critical vulnerabilities)

## Questions?

If you have questions about security that are not covered in this document, please email: **security@vaultrix.io**

---

**Last Updated**: January 27, 2026
