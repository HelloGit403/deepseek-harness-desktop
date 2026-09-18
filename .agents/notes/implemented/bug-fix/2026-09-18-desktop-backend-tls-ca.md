# Agent Note: Desktop backend owns its TLS trust defaults

Status: implemented

English | [中文](2026-09-18-desktop-backend-tls-ca.zh.md)

## Problem

The Electron main process started the packaged Harness backend with an unfiltered copy of its environment. Host-level Node.js and OpenSSL settings could therefore select a different CA store or disable certificate verification. A host that injected `--use-openssl-ca` could make valid DeepSeek HTTPS requests fail with `SELF_SIGNED_CERT_IN_CHAIN`, while appending `--use-bundled-ca` without removing the conflicting option caused Node.js to reject the process before startup.

## Decision

The desktop launcher constructs an environment owned by the embedded Harness server. It removes every case variant of `NODE_OPTIONS`, `NODE_USE_SYSTEM_CA`, and `NODE_TLS_REJECT_UNAUTHORIZED`, preserves unrelated inherited Node.js options, removes inherited CA-selection options, and writes one canonical `--use-bundled-ca` option. It also writes one canonical `DSH_HOME` value.

`NODE_EXTRA_CA_CERTS` remains available and is canonicalized so organizations can add a managed CA bundle without replacing Node.js's bundled roots or disabling certificate verification. Other environment variables remain available to the Harness process.

The environment transformation is a pure function covered for Windows-style case-insensitive keys, conflicting CA options, an insecure TLS bypass, an additional CA bundle, immutability, and idempotent bundled-CA selection.

## Alternatives considered

**Disable certificate verification.** `NODE_TLS_REJECT_UNAUTHORIZED=0` would hide both local interception and genuine certificate failures, exposing API credentials and responses to unauthenticated endpoints.

**Append the bundled-CA option to the inherited value.** Node.js rejects a process that receives both `--use-openssl-ca` and `--use-bundled-ca`, so the launcher must remove conflicting CA-selection options before adding its owned default.

**Discard the complete parent environment.** The Harness backend still needs ordinary process settings and deployment-specific variables. The launcher removes only TLS trust selectors it owns and canonicalizes the two values that require deterministic behavior.

**Use the operating system CA store by default.** Host trust stores vary across machines and were the source of this failure mode. Deployments that require a private root can add it explicitly through `NODE_EXTRA_CA_CERTS` without changing the public-root default.

## Consequences

Packaged desktop API requests use a deterministic public-root store and retain certificate verification. A machine-wide Node.js setting cannot silently disable verification or switch the backend to OpenSSL roots. Organizations that intercept HTTPS must provide their root certificate through `NODE_EXTRA_CA_CERTS`; the desktop launcher preserves that opt-in. Child Node.js processes launched from the Harness environment also inherit the bundled-CA default unless their own launcher replaces it.
