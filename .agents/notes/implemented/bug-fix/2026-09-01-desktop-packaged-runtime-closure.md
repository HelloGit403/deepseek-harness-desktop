# Agent Note: Desktop packaging preserves the complete Web runtime

Status: implemented

English | [中文](2026-09-01-desktop-packaged-runtime-closure.zh.md)

## Problem

The desktop deploy manifest listed only the Electron shell's direct imports. Harness Web profiles also load workspace plugins by bare package name, and those plugins consume required peers that are not ordinary transitive dependencies. Legacy pnpm deploy omitted several workspace roots, while electron-builder later pruned additional peer-only packages. The workflow verified that installer files existed but never started the packaged server, so an apparently successful release could fail during its first plugin-tree load.

The main process also allowed the child exit handler and the startup timeout path to navigate the same BrowserWindow concurrently. Electron reported the losing local-page navigation as `ERR_ABORTED`, which hid the package-resolution failure recorded in the server log. After authentication became mandatory, polling the unauthenticated root could also time out even though the server had announced its ready URL.

## Decision

The desktop build computes the target-compatible workspace dependency graph rooted at `@deepseek-ai/dsh` and the shell's workspace dependencies. The traversal follows dependencies, optional dependencies, and non-optional peer dependencies. The resulting packages become explicit temporary deploy roots; required external peers retain their declared versions. The source manifest is restored after deploy even when pnpm fails.

Legacy deploy omissions are copied from their built workspace directories, every staged package link is replaced with its target files, and the build rejects a missing workspace package before electron-builder starts. An after-pack hook compares the staged and packaged top-level dependency trees and restores packages that electron-builder pruned as peer-only. Existing packaged dependency directories are not overwritten.

Every Windows installer build starts the unpacked packaged executable with `ELECTRON_RUN_AS_NODE`, an isolated temporary Harness home, and port `0`. It observes the server's actual bound URL, follows the token-to-cookie authentication redirect, and requires the assembled UI marker. Readiness has one explicit deadline, process exit fails immediately, and cleanup terminates the child and removes its temporary directory. The release workflow invokes this build, so a packaged startup failure blocks publication.

The Electron startup path accumulates child stdout until it receives a complete `dsh web` announcement, accepts only an authenticated URL on the configured loopback origin, and loads that URL so the Web server can establish its cookie. The announcement races child exit and a single timeout. Only that coordinating path renders the initial failure page, and a timeout terminates the owned child so it cannot occupy the port on the next launch. After the Harness page has loaded, a later child exit may render the stopped-service page, so two startup navigations cannot compete and obscure the diagnostic.

## Alternatives considered

**Keep adding missing packages to the desktop manifest after each failure.** This duplicates a changing Web profile graph and misses new required peers until another installed build fails.

**Trust electron-builder's production dependency traversal.** Its traversal intentionally follows package-manager dependency metadata, but Harness composition also treats non-optional peers and bare profile entries as installed runtime requirements. The packaged process is the authoritative verification surface.

**Check only that expected installer files exist.** Asset presence verifies update-channel completeness but says nothing about module resolution or plugin initialization inside the artifact.

## Consequences

Desktop installers are larger and take longer to build because they carry and verify the complete Harness Web runtime. A release cannot publish merely because NSIS completed: the packaged application must start and serve its authenticated assembled UI. Runtime profiles, Agent behavior, sessions, and settings are unchanged; this decision changes only desktop assembly, release evidence, and startup error coordination.
