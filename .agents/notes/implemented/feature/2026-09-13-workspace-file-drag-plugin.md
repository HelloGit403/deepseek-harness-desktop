# Agent Note: Workspace file drag is a client plugin

Status: implemented

English | [中文](2026-09-13-workspace-file-drag-plugin.zh.md)

## Problem

The desktop release needs to let a user drag a file from the workspace tree into the conversation composer. The first implementation patched the official file-tree, attachment, and composer packages at release time. That made every official edit near those hunks a potential patch conflict even though the behavior uses concepts already exposed by the client plugin system.

The replacement must preserve Session isolation, structured file-reference serialization, the user's editor selection, localization, and clean hot-unload behavior without depending on private composer implementations.

## Decision

Package the behavior as the private Web client plugin `@deepseek-ai/dsh-client-ui-workspace-file-drag`. The browser half contributes one Session-scoped entry to the official `conversation.input.overlay` Slot. Its injection resolves the current Session through `ctx.sessions.scope(sessionId)` and uses only the public `ctx.conversation.input.for(actx)` facade to read the current revision and insert a structured reference.

The file tree does not expose a drag-source Slot, so the plugin discovers its published `data-files-state`, `data-files-root`, `data-files-entry`, and `data-files-path` attributes. A `MutationObserver` marks current and future file buttons draggable. The transfer uses `application/vnd.deepseek-harness.workspace-file` and contains the source Session id plus a workspace-relative path. The receiver accepts only the current Session, an editable composer, a relative descendant path, and a path accepted by `formatFileMention`.

The plugin records the last browser selection inside `data-composer-input`. DOM text counts by UTF-16 length, a reference chip and a line break count as one detect unit, and top-level blocks have one newline between them. Drop uses that span with the current `draftRev`; when no selection survives, it derives the detect-coordinate draft end from the public draft and occurrence projection.

The desktop release copies this package into the pinned official workspace, adds it to the Web bundle dependencies and client TypeScript aggregate, and appends one Loader row to the Web patch. It no longer applies a source patch for this feature. Official changes to unrelated source positions therefore cannot create a hunk conflict. A removed public service, Slot, package dependency, or required DOM attribute still fails the build or focused integration test before publishing.

## Alternatives considered

**Keep the release-time source patch.** Rejected because the feature then conflicts with any upstream edit to several component files and must track their private props and methods.

**Copy a file as an attachment.** Rejected because the source already belongs to the Session workspace; uploading a duplicate hides later workspace edits and bypasses the standard file-reference serializer.

**Use plain text drag data.** Rejected because unrelated browser and operating-system drags commonly expose it. A product-specific MIME type makes the internal gesture explicit.

**Insert through DOM editing APIs.** Rejected because it would bypass the input machine's revision guard, reference identity, clipboard projection, and serializer.

## Verification

Package tests cover POSIX and Windows descendant checks, safe mention conversion, DOM selection projection, chip-aware fallback length, transfer production, current-Session drop insertion, malformed and foreign payload rejection, localized overlay visibility, dynamically mounted rows, and complete listener and observer disposal. Desktop release-script tests verify package copying and idempotent registration into official Web configuration.

## Consequences

- Official source updates no longer need the file-tree drag patch to apply at matching line positions.
- The inserted chip and model-visible path remain identical to the existing `@` reference flow.
- The plugin can unload without retaining document listeners or observing later DOM mutations.
- The remaining compatibility dependency is explicit: public Conversation/Slot interfaces plus documented test attributes. Release validation stops publication when those assumptions no longer hold.
