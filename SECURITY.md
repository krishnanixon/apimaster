# Security Policy

Shurikly is maintained by Wansify Ventures. The Wansify Ventures team triages
and fixes security reports.

## Supported versions

Security fixes go into the latest release. Please upgrade before reporting.

| Version | Supported |
|---|---|
| 1.x (latest) | Yes |
| Older | No |

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately through GitHub:
[Security → Report a vulnerability](https://github.com/shurikly/shurikly/security/advisories/new).

Include:

- What the issue is and what an attacker could do with it
- Steps to reproduce, or a proof of concept
- Affected version and operating system

We aim to acknowledge reports within 3 working days and to share a fix timeline
within 10. We'll credit you in the release notes unless you'd rather stay anonymous.

## Scope

Things we especially want to hear about:

- Ways for a web page, API response, imported collection, or script to run code
  outside the script sandbox or reach Node/Electron APIs
- Leaks of stored secrets (API keys, tokens, environment values) to disk in plain text,
  to logs, or to a third party
- The local MCP server or mock server being reachable from other machines, or accepting
  requests without the expected checks
- Problems in the IPC boundary between renderer and main process

Out of scope: requests you send yourself to third-party APIs, and issues that need an
attacker who already controls your user account.
