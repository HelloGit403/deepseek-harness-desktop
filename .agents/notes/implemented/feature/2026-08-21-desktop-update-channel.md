# Agent Note: Desktop release channel and in-app updater

Status: implemented

English | [中文](2026-08-21-desktop-update-channel.zh.md)

## Problem

The desktop package embeds the Harness server and Web Client, so an upstream source release cannot replace the installed application safely. The desktop adaptations and Web Client customization must be rebuilt and tested together, while session data must survive an application-file replacement.

## Decision

The Electron main process owns desktop updates through `electron-updater` and exposes only four parameterless operations plus an observable state snapshot through a context-isolated CommonJS preload that remains compatible with the sandboxed renderer. The Web Client registers a desktop-only Software Update section when that preload API exists; ordinary browsers do not receive the section. Each manual check resolves to a result dialog for an available release, the current version, an unpublished channel, or a failure.

Release packaging records the public `HelloGit403/deepseek-harness-desktop` GitHub Releases provider in the staged application. `DSH_DESKTOP_UPDATE_URL` remains an explicit packaging-time override for deployments that own another generic HTTPS release address. A configured build checks after startup, while all download and installation actions remain explicit user gestures. Electron Builder's release metadata supplies the installer checksum, and the updater does not publish the downloaded state until verification completes. Development and unpackaged builds stay usable and present an unconfigured state instead of guessing a source.

The repository's Windows release workflow checks out the exact official DeepSeek Harness revision recorded in `.github/desktop-upstream.json` into an isolated source directory, then copies the owned desktop shell and desktop-only Settings integration onto that coherent official tree. It installs that assembled workspace, builds the official Host and Web artifacts, and publishes the NSIS installer, its blockmap, and `latest.yml` as one GitHub Release. The workflow derives a `v<version>` tag from the desktop package version because `electron-updater` requires the release-feed tag to parse as SemVer, and rejects a mismatched pushed tag, a repository build failure, or an incomplete asset set.

Electron's user-data directory owns the Harness home and updater cache. NSIS replaces the installation directory, so profiles, sessions, archived-session membership, settings, and credentials remain outside the replaced files.

## Alternatives considered

**Install directly from DeepSeek Harness source releases.** The upstream release assets describe the Harness source and do not contain this adapted desktop installer. Installing them cannot preserve the desktop shell and customized Web Client.

**Load the latest public website into the desktop window.** Remote content would separate the visible client from the bundled local server version and would turn a website deployment into an unreviewed desktop update.

**Maintain a custom installer downloader.** Electron Updater already coordinates NSIS metadata, checksum validation, cached downloads, progress, and restart installation. A second implementation would duplicate security- and lifecycle-sensitive behavior.

## Consequences

Every installable update must publish `latest.yml`, the NSIS installer, and its blockmap in one release after the desktop adaptations pass their checks. The application can detect and install those releases without moving user data. The public channel requires repository release availability; development and unpackaged builds perform no update network requests.
