---
description: "Desktop Web plugin for dragging workspace file-tree rows into the current composer as structured file references."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workspace-file-drag

English | [中文](README.zh.md)

## Summary

This private client plugin lets a user drag a file from the right Sidebar's workspace tree into the current Session composer. The gesture inserts the same structured `@file` reference produced by the reference picker; it does not upload another copy of a file that already belongs to the Session workspace. The desktop release installs the package into the pinned official workspace and registers it through the official Web plugin roster.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Register `@deepseek-ai/dsh-client-ui-workspace-file-drag` as a Web client row after making the package available to the bundle. File rows become draggable when their tree is mounted. Dropping one over an editable composer replaces the retained selection; if the browser cannot retain a selection during the drag, insertion occurs at the current draft end.

The transfer carries a product-specific MIME value with the current Session id and a workspace-relative path. The receiver rejects another Session, paths outside the tree root, absolute paths, malformed data, and paths the standard file-reference grammar cannot represent.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin contributes `workspace-file-drag` to `conversation.input.overlay`. Its Session injection resolves the public `ctx.conversation.input` facade; no private composer class or component callback crosses the package boundary. A scoped React entry installs document listeners and a `MutationObserver`, marks current and future file-row buttons draggable, translates DOM selection positions to the composer's detect-coordinate system, and disposes every listener and observer when the entry unmounts.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Locale registration, Session input resolution, and overlay contribution |
| [`src/client/WorkspaceFileDragBridge.tsx`](src/client/WorkspaceFileDragBridge.tsx) | File-row discovery, transfer validation, selection projection, insertion, and overlay |
| [`src/client/locales.ts`](src/client/locales.ts) | English and Chinese drag copy |
| [`src/index.ts`](src/index.ts) | Empty Host apply that keeps the browser plugin addressable by Loader |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion; lifecycle behavior is verified by package tests |

The [workspace-file drag plugin Agent Note](../../../.agents/notes/implemented/feature/2026-09-13-workspace-file-drag-plugin.md) owns the decision to use the official plugin seams instead of an upstream source patch.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Conversation UI](../ui-conversation/README.md) — owns the public Session input facade and composer overlay slot.
- [File references](../../context/file-reference/README.md) — owns the safe `@file` mention grammar.
- [Client package map](../README.md) — lists adjacent browser plugins.
- [Desktop shell](../../../apps/desktop/README.md) — describes release-time installation into the official source workspace.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the existing `reference` source, which owns serialization of the standard file-reference chip inserted by this user's drag gesture.

#### KV Cache effect

The plugin adds no stable prompt prefix. A dropped reference changes only that user message, as the equivalent typed or menu-selected file mention would.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **DOM discovery** — the plugin relies on the official `data-files-*` and `data-composer-*` attributes because the file-tree package does not publish a drag-source slot. Release tests must detect an upstream attribute change before publishing.
- **Files only** — directories remain click-only and external operating-system file drops continue through the attachment plugin.
- **Selection retention** — browsers may clear a contenteditable selection while dragging; the safe fallback inserts at the draft end.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep integration at the public Slot and Session input interfaces. If the file tree later publishes a drag-source capability, replace DOM discovery inside this package without changing the desktop release installer or conversation package.

</details>
