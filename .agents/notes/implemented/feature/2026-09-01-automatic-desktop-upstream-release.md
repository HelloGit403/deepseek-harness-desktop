# Agent Note: Official Harness changes automatically enter the desktop release channel

Status: implemented

English | [中文](2026-09-01-automatic-desktop-upstream-release.zh.md)

## Problem

The desktop application can install releases from its GitHub channel, but publishing that channel still required a maintainer to notice an official DeepSeek Harness commit, update the pinned revision and desktop version, and start the release workflow. An application updater cannot consume the official source repository directly because a source commit is not a signed, tested Windows installer with electron-updater metadata.

## Decision

A scheduled GitHub workflow checks the configured official branch head and desktop package version every five minutes. A changed head advances `.github/desktop-upstream.json`, aligns the desktop release version's major, minor, and patch components with the official desktop package, and pushes both changes to `main` before explicitly dispatching the existing Desktop Release workflow. Further official commits with the same three components increase the desktop `rc` number monotonically. Pushes made by `GITHUB_TOKEN` are not relied on to trigger another workflow.

The sync also queries the release matching the current desktop version. If that release is missing after a build failure, interruption, or dispatch failure, a later run dispatches the same version again instead of incrementing it. This makes the repository record the desired official revision while GitHub Releases records whether a tested desktop artifact actually exists.

Desktop Release remains the publication authority. It checks out the recorded official commit, applies only the desktop adaptation, runs desktop tests and the official build, packages the installer, starts the packaged Harness Web runtime, and publishes the installer, blockmap, and `latest.yml` only after all checks pass. A breaking upstream change therefore stops the channel at the last working release rather than delivering a broken update.

## Alternatives considered

**Download official repository files directly inside the installed application.** Source files cannot replace Electron application resources safely, lack installer metadata, and have not passed the desktop adaptation build.

**Publish every observed official commit without build gates.** This would automate detection while removing the evidence that makes an update safe.

**Require a maintainer to push a release tag after each official change.** This preserves the existing manual gap and does not satisfy unattended updates.

## Consequences

When the official branch remains compatible with the desktop adaptation, a new tested desktop release appears without user or maintainer action, and the application discovers it through its existing startup or manual check. Breaking official changes remain visible as failed GitHub workflow runs and are retried at the same desktop version until the adaptation is fixed; the installed application continues offering the last successful release.
