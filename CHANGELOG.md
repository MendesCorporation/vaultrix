# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-01-27

### Added
- Initial release of Vaultrix
- Complete infrastructure and credential management platform
- End-to-end encryption with AES-256-GCM
- Multi-factor authentication (MFA) support
- Role-based access control (RBAC)
- Machine inventory management
- SSH integration for remote access
- Real-time monitoring with Go-based agent
- System metrics collection (CPU, Memory, Disk, Load)
- Docker container monitoring
- Custom alert system with configurable thresholds
- Credential vault with platform integration
- Support for 40+ platforms (AWS, Azure, GCP, GitHub, etc.)
- One-click stack deployment system
- 18 pre-configured application stacks
- Automated backup and restore functionality
- Scheduled backup with retention policies
- User and team management
- Group-based permissions
- Invitation system for new users
- Complete audit logging
- Multi-language support (English, Portuguese)
- Dark/Light theme support
- Responsive mobile-friendly UI
- Docker Hub image distribution
- Comprehensive documentation

### Security
- Argon2id password hashing
- Per-user data encryption keys (DEK)
- Master key derivation from user password
- Secure session management
- Rate limiting on sensitive endpoints
- IP-based access logging
- Audit trail for all operations

### Infrastructure
- Next.js 15 with App Router
- React 19
- PostgreSQL 16
- Prisma ORM
- NextAuth.js authentication
- TailwindCSS styling
- Docker containerization
- Go monitoring agent

### Documentation
- Comprehensive README with screenshots
- Docker deployment guide
- Development setup instructions
- Contributing guidelines
- MIT License
- API documentation structure

## [Unreleased]

### Planned Features
- OpenAPI/Swagger documentation
- Webhook support for alerts
- Slack/Discord/Teams integrations
- Advanced reporting and analytics
- Custom dashboard widgets
- API key management
- SSO/SAML support
- Kubernetes integration
- Terraform provider
- Mobile app (iOS/Android)
- Browser extension
- CLI tool
- Backup to S3/Azure/GCS
- Multi-tenancy support
- Advanced RBAC with custom roles
- Workflow automation
- Integration marketplace

---

[0.0.1]: https://github.com/yourusername/vaultrix/releases/tag/v0.0.1
