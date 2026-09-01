# Agent Note: Desktop-owned title bar and window opacity

Status: implemented

English | [中文](2026-08-22-desktop-window-appearance.zh.md)

## Problem

The Windows native title bar can follow the light operating-system palette while the Harness client renders a dark theme, leaving a bright strip above the application. Browser CSS also cannot adjust the opacity of native window chrome, and a renderer-only preference would not reliably survive replacement of the installed application.

## Decision

The Electron main process selects the dark native theme before creating a window, so Windows owns the standard caption buttons while their title bar matches the desktop client's dark shell. The application retains the native title bar rather than implementing custom drag, resize, and caption-button regions.

The main process also owns whole-window opacity. A context-isolated preload exposes only `getOpacity()` and `setOpacity(value)` under `deepSeekDesktopWindow`; the IPC handler accepts calls only from the main Harness window. Values are finite numbers rounded to two decimal places and clamped to `0.6` through `1`, which keeps the window visible enough to recover its controls.

The selected value is stored as `window-appearance.json` in Electron's user-data directory and applied whenever a BrowserWindow is created. The Web Client registers the Window opacity row in General settings only when the complete preload API exists, so an ordinary browser neither displays the control nor receives access to the desktop IPC surface.

## Alternatives considered

**Apply CSS opacity to the Web Client root.** CSS would fade only browser content, leave the native title bar unchanged, and compose the page against its own opaque window background rather than the desktop behind the application.

**Replace the native title bar with a transparent frameless window.** A custom frame would require owned drag regions, resize behavior, caption buttons, keyboard access, maximized-window geometry, and display-scale testing. Native Windows chrome already provides those behaviors and only needs the matching dark palette.

**Store the preference in Harness user settings.** The Harness Web Host runs as a child of the Electron shell and does not own BrowserWindow state. Keeping this shell-only preference in Electron user data makes it available before the child server and renderer start while retaining it across in-place application updates.

## Consequences

The installed Windows application opens with a dark native title bar and offers a persistent 60%–100% opacity control for the entire window, including native chrome. Lower opacity intentionally reduces text contrast, but the enforced floor and one-click 100% reset keep recovery available. Preference read failures fall back to a fully opaque window, invalid renderer values are rejected, and save failures remain visible in the settings row. Browser deployments and Agent behavior are unchanged.
