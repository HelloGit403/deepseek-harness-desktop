# Agent Note: The session header launches a mode into a new session

Status: implemented

English | [中文](2026-08-17-session-header-preset-launcher.zh.md)

## Problem

The session header named the current agent preset as static text. A person who learned that Standard, Code, Minimal, and Creator modes exist still had to leave the conversation or begin an unconfigured new-session flow before seeing what the modes do. Making that label a direct in-place switch is unsafe: a running session's history was produced under its original tools and prompt, and the Host rejects replacement after the first turn.

## Decision

The header label is a menu launcher over the shared agent-preset roster. Every row carries the localized name, one-sentence purpose, and an explicit badge saying whether it belongs to the current session or a new session. The trigger continues to name the preset recorded by the visible session, so opening the menu never changes what the current conversation claims to run.

Choosing a different row stages that preset on `AgentPresetSeatController` and calls the existing Workspace `startSession()` flow. A Workspace-backed conversation therefore opens or reuses its blank session and applies the stage through the existing session-list subscriber; without an available Workspace, the shell enters its New Session view with the staged choice intact. Choosing the current row only closes the menu.

The launcher and shared menu primitives use short transform, opacity, glow, and filter transitions for hover, open, and press feedback. `prefers-reduced-motion: reduce` removes spatial entrance and press motion while preserving color and state changes.

This decision changes only the entry point described by the [per-session preset architecture](../architecture/2026-08-03-per-session-agent-presets.md). It keeps the architecture's rule that a started session never adopts a different composition.

## Alternatives considered

**Switch the visible session in place.** Rejected because the Host correctly refuses a different preset after a turn: logged tool calls, prompt contributions, and available capabilities must remain reconstructable under the composition that produced them.

**Open Settings instead of showing the roster.** Rejected because the General setting changes a deployment default rather than expressing the user's immediate intent to begin one conversation in a chosen mode, and it hides the mode explanations behind unrelated navigation.

**Build a second header-only roster controller.** Rejected because the new-session seat already owns staging and application across Workspace creation and blank-session reuse. A parallel controller would duplicate the lifecycle rule and could diverge on when a staged choice is spent.

## Consequences

Mode discovery is available at the point where a user sees the current mode, and every non-current choice has an immediate, safe result. The current conversation remains visible in the session list and retains its preset. A mode selection can navigate away because starting a new session is the declared effect, and the menu copy makes that effect explicit before the click.

Component coverage pins descriptions, current/new badges, no-op selection of the current row, and dispatch of another row. Plugin coverage pins the shared roster, staged preset, introduce cue, and one Workspace start.
