# Agent Note: Official Harness changes automatically enter the desktop release channel

Status: implemented

English | [中文](2026-09-01-automatic-desktop-upstream-release.zh.md)

## Problem

The desktop application can install releases from its GitHub channel, but publishing that channel still required a maintainer to notice an official DeepSeek Harness commit, update the pinned revision and desktop version, and start the release workflow. An application updater cannot consume the official source repository directly because a source commit is not a signed, tested Windows installer with electron-updater metadata.

## Decision

A scheduled GitHub workflow checks the configured official branch head and desktop package version every five minutes. A changed head advances `.github/desktop-upstream.json`, aligns the desktop release version's major, minor, and patch components with the official desktop package, and pushes both changes to `main` before explicitly dispatching the existing Desktop Release workflow. Further official commits with the same three components increase the desktop `rc` number monotonically. Pushes made by `GITHUB_TOKEN` are not relied on to trigger another workflow.

The sync also queries the release matching the current desktop version. If that release is missing after a build failure, interruption, or dispatch failure, a later run dispatches the same version again instead of incrementing it. This makes the repository record the desired official revision while GitHub Releases records whether a tested desktop artifact actually exists.

Desktop Release remains the publication authority. It checks out the recorded official commit, replaces the official desktop package with the desktop adaptation, and carries forward only the official `primary-runtime-lock.json` input needed to pin the embedded Node runtime. The adaptation's scripts stay paired with its source instead of being combined with build scripts that target the official desktop implementation. The workflow then runs desktop tests and the official build, packages the installer, starts the packaged Harness Web runtime, and publishes the installer, blockmap, and `latest.yml` only after all checks pass. A breaking upstream change therefore stops the channel at the last working release rather than delivering a broken update.

The Web Client adaptation preserves the official settings shell and typed dictionaries. A release preparation script adds the desktop-only update-center and opacity registrations to the official entry and merges only adaptation-owned locale keys that the official dictionaries do not already define. Missing or ambiguous insertion points stop the release, while unrelated official settings fields and copy continue into the desktop build automatically.

## Alternatives considered

**Download official repository files directly inside the installed application.** Source files cannot replace Electron application resources safely, lack installer metadata, and have not passed the desktop adaptation build.

**Publish every observed official commit without build gates.** This would automate detection while removing the evidence that makes an update safe.

**Require a maintainer to push a release tag after each official change.** This preserves the existing manual gap and does not satisfy unattended updates.

**Combine every official desktop script with the adapted desktop source.** Official scripts may import files or dependencies owned by the official desktop implementation and fail against the replacement package. Preserving only the runtime lock keeps the official runtime selection without mixing two desktop implementations.

**Replace the official settings entry and dictionaries as complete files.** Whole-file replacement discards new official hooks, locale keys, and UI integrations even when the desktop additions do not conflict with them. The preparation script retains official ownership and rejects only an incompatible extension point.

## Consequences

When the official branch remains compatible with the desktop adaptation, a new tested desktop release appears without user or maintainer action, and the application discovers it through its existing startup or manual check. An official runtime-lock change enters the adapted package automatically, while other official desktop-script changes require an explicit adaptation change when they are relevant. Breaking official changes remain visible as failed GitHub workflow runs and are retried at the same desktop version until the adaptation is fixed; the installed application continues offering the last successful release.
