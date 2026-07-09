# Security Policy

## Supported Versions

n0va is under active development on the `master` branch. Only the latest commit
on `master` is supported. Pin to a tagged release for production use.

## Reporting a Vulnerability

If you find a security vulnerability in n0va itself (not in a target you scan),
**do not open a public issue.** Report it privately:

- Use GitHub's private vulnerability reporting: open the **Security** tab →
  **Report a vulnerability**, or
- Email the maintainer via a GitHub security advisory draft.

Include:
- What the issue is and where (file/component)
- Steps to reproduce
- Impact and any suggested fix

You'll get a response within a few days. If accepted, we'll coordinate a fix
and credit you (unless you prefer to stay anonymous).

## Scope — what is and isn't a vulnerability here

**In scope:** flaws in n0va that leak the operator's data, bypass the sandbox
isolation, expose the local API to the network, or mishandle secrets before
redaction.

**Out of scope:** findings produced *by* the scanners against a target you
point n0va at. That's the tool doing its job. Scanning targets you don't own
without authorization may be illegal — that responsibility is the operator's,
documented in the README's operator-safety note.

## Local-first, no cloud

n0va runs entirely on your machine. It makes no outbound calls except to the
scan targets you specify and to clone tool repos you request. There is no
telemetry and no required account. If you see unexpected network egress from
n0va, that's a bug worth reporting.
