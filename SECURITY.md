# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in this package, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email **security@rephelper.ai** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You will receive a response within 48 hours

## Security Design

- **No secrets stored in code** — API tokens are provided via environment variables
- **HTTPS only** — All API communication uses HTTPS
- **Minimal dependencies** — Only `@modelcontextprotocol/sdk` and `zod`
- **File upload validation** — Strict allowlist for file types and 10MB size limit
- **No logging of tokens** — Bearer tokens are never written to stdout or stderr
