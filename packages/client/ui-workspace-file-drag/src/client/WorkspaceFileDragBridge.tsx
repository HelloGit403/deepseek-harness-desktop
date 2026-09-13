/** DOM bridge from the workspace file tree to the public Conversation input face. */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar'
import type {
  InputState, ReferenceInsert, TokenSpan,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceFileDragKey } from './locales.ts'
import css from './WorkspaceFileDragBridge.module.css'

/** Product-specific transfer type; unrelated browser drags cannot enter this path. */
export const WORKSPACE_FILE_DRAG_TYPE = 'application/vnd.deepseek-harness.workspace-file'

const FILE_BUTTON_SELECTOR = '[data-files-entry="file"][data-files-path] > button'
const TREE_SELECTOR = '[data-files-state="tree"][data-files-root]'
const EDITOR_SELECTOR = '[data-composer-input]'

interface WorkspaceFileDragPayload {
  readonly sessionId: string
  readonly path: string
}

/** Business actions injected from the current Session's public input facade. */
export interface WorkspaceFileDragActions {
  /** Read the current draft revision and projection. */
  getInputState: () => Pick<InputState, 'draft' | 'draftRev' | 'occurrences'>
  /** Insert one structured reference through the input machine's revision guard. */
  insertReference: (reference: ReferenceInsert, span: TokenSpan) => boolean
}

type BridgeProps = WorkspaceFileDragActions
  & PropsRuntime<'conversation.input.overlay'>
  & PropsLocale<'workspace.fileDrag'>

/**
 * Convert an absolute file-tree path to a workspace-relative slash path.
 * @param root - Workspace tree root.
 * @param path - File row path.
 * @returns relative path, or undefined when the row is outside the root.
 */
export function workspaceRelativePath(root: string, path: string): string | undefined {
  if (root === '') return undefined
  const slash = (value: string): string => value.replace(/\\/gu, '/').replace(/\/+$/u, '')
  const normalizedRoot = slash(root)
  const normalizedPath = slash(path)
  const windows = /^[A-Za-z]:\//u.test(normalizedRoot) || normalizedRoot.startsWith('//')
  const comparableRoot = windows ? normalizedRoot.toLowerCase() : normalizedRoot
  const comparablePath = windows ? normalizedPath.toLowerCase() : normalizedPath
  const prefix = comparableRoot === '' ? '/' : `${comparableRoot}/`
  if (!comparablePath.startsWith(prefix)) return undefined
  const relative = normalizedPath.slice(prefix.length)
  if (relative.split('/').some(part => part === '' || part === '.' || part === '..')) {
    return undefined
  }
  return relative
}

/**
 * Convert one validated relative workspace path to the standard file reference.
 * @param path - Workspace-relative path.
 * @returns composer reference, or undefined when the mention grammar rejects it.
 */
export function workspaceFileReference(path: string): ReferenceInsert | undefined {
  if (path.startsWith('/') || /^[A-Za-z]:[/\\]/u.test(path) || path.startsWith('\\\\')) return undefined
  if (path.split('/').some(part => part === '' || part === '.' || part === '..')) return undefined
  const mention = formatFileMention({ kind: 'file', path }, false)
  const label = path.slice(path.lastIndexOf('/') + 1)
  if (mention === undefined) return undefined
  return { source: 'reference', ref: mention, label, appearance: 'file', clipboardText: mention }
}

/**
 * Compute a DOM selection point in the composer's detect-coordinate projection.
 * Text counts by UTF-16 length, reference chips and line breaks count as one,
 * and top-level editor blocks are separated by one newline.
 * @param root - Composer contenteditable root.
 * @param target - Selection point node.
 * @param targetOffset - DOM selection offset in the target.
 * @returns detect offset, or undefined when the point is outside the editor.
 */
export function composerPointOffset(root: HTMLElement, target: Node, targetOffset: number): number | undefined {
  if (target !== root && !root.contains(target)) return undefined

  const lengthOf = (node: Node): number => {
    if (node.nodeType === Node.TEXT_NODE) return (node as Text).data.length
    if (!(node instanceof HTMLElement)) return 0
    if (node.matches('[data-composer-chip]') || node.tagName === 'BR') return 1
    return Array.from(node.childNodes).reduce((sum, child) => sum + lengthOf(child), 0)
  }

  const visit = (node: Node): number | undefined => {
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) {
        /* v8 ignore next -- a DOM Text node always exposes string textContent. */
        return Math.min(Math.max(targetOffset, 0), node.textContent?.length ?? 0)
      }
      const children = Array.from(node.childNodes)
      const limit = Math.min(Math.max(targetOffset, 0), children.length)
      let total = 0
      for (const [index, child] of children.slice(0, limit).entries()) {
        if (node === root && index > 0) total += 1
        total += lengthOf(child)
      }
      return total
    }
    if (!(node instanceof HTMLElement) || node.matches('[data-composer-chip]')) return undefined
    const children = Array.from(node.childNodes)
    let total = 0
    for (const [index, child] of children.entries()) {
      if (node === root && index > 0) total += 1
      const nested = visit(child)
      if (nested !== undefined) return total + nested
      total += lengthOf(child)
    }
    return undefined
  }

  return visit(root)
}

/**
 * Convert the browser selection to a normalized composer span.
 * @param root - Composer contenteditable root.
 * @param selection - Browser selection.
 * @returns ordered detect-coordinate span, or undefined outside the editor.
 */
export function composerSelection(root: HTMLElement, selection: Selection | null): Omit<TokenSpan, 'draftRev'> | undefined {
  if (selection?.anchorNode == null || selection.focusNode == null) return undefined
  const anchor = composerPointOffset(root, selection.anchorNode, selection.anchorOffset)
  const focus = composerPointOffset(root, selection.focusNode, selection.focusOffset)
  if (anchor === undefined || focus === undefined) return undefined
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) }
}

/** Return the draft's length in the editor's detect-coordinate projection. */
export function detectLength(state: Pick<InputState, 'draft' | 'occurrences'>): number {
  return state.occurrences.reduce((length, occurrence) => length - occurrence.length + 1, state.draft.length)
}

/**
 * Install and return the complete DOM bridge lifecycle.
 * @param doc - Browser document.
 * @param win - Browser window.
 * @param sessionId - Current Session identity.
 * @param actions - Public input actions for that Session.
 * @param setActive - Overlay visibility sink.
 * @returns disposer that removes listeners and the observer.
 */
export function installWorkspaceFileDragBridge(
  doc: Document,
  win: Window,
  sessionId: SessionId,
  actions: WorkspaceFileDragActions,
  setActive: (active: boolean) => void,
): () => void {
  let depth = 0
  let selection: Omit<TokenSpan, 'draftRev'> | undefined

  const markRows = (): void => {
    for (const button of doc.querySelectorAll<HTMLButtonElement>(FILE_BUTTON_SELECTOR)) button.draggable = true
  }
  markRows()
  const observer = new MutationObserver(markRows)
  observer.observe(doc.body, { childList: true, subtree: true })

  const reset = (): void => {
    depth = 0
    setActive(false)
  }
  const hasPayload = (transfer: DataTransfer | null): boolean =>
    transfer !== null && Array.from(transfer.types).includes(WORKSPACE_FILE_DRAG_TYPE)

  const onSelectionChange = (): void => {
    const current = doc.getSelection()
    const anchor = current?.anchorNode
    const editor = anchor instanceof Node
      ? (anchor instanceof HTMLElement ? anchor : anchor.parentElement)?.closest<HTMLElement>(EDITOR_SELECTOR)
      : null
    if (editor !== null && editor !== undefined) selection = composerSelection(editor, current)
  }

  const onDragStart = (event: DragEvent): void => {
    const element = event.target instanceof Element ? event.target : null
    if (element === null || event.dataTransfer === null) return
    const button = element.closest<HTMLButtonElement>(FILE_BUTTON_SELECTOR)
    if (button === null) return
    const row = button.parentElement
    const tree = row?.closest<HTMLElement>(TREE_SELECTOR)
    if (row === null || tree === null || tree === undefined) return
    const relative = workspaceRelativePath(
      tree.dataset.filesRoot as string,
      row.dataset.filesPath as string,
    )
    if (relative === undefined) return
    const payload: WorkspaceFileDragPayload = { sessionId: String(sessionId), path: relative }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(WORKSPACE_FILE_DRAG_TYPE, JSON.stringify(payload))
  }

  const canDrop = (event: DragEvent): boolean => {
    if (!hasPayload(event.dataTransfer)) return false
    const editor = doc.querySelector<HTMLElement>(`${EDITOR_SELECTOR}[contenteditable="true"]`)
    return editor !== null && editor.getAttribute('aria-disabled') !== 'true'
  }

  const onDragEnter = (event: DragEvent): void => {
    if (!canDrop(event)) return
    event.preventDefault()
    depth += 1
    setActive(true)
  }
  const onDragOver = (event: DragEvent): void => {
    if (!canDrop(event)) return
    event.preventDefault()
    /* v8 ignore next -- canDrop already rejects a null dataTransfer. */
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = (event: DragEvent): void => {
    if (!hasPayload(event.dataTransfer)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) setActive(false)
  }
  const onDrop = (event: DragEvent): void => {
    if (!canDrop(event) || event.dataTransfer === null) return
    event.preventDefault()
    const raw = event.dataTransfer.getData(WORKSPACE_FILE_DRAG_TYPE)
    reset()
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return
    const payload = parsed as Partial<WorkspaceFileDragPayload>
    if (payload.sessionId !== String(sessionId) || typeof payload.path !== 'string') return
    const reference = workspaceFileReference(payload.path)
    if (reference === undefined) return
    const state = actions.getInputState()
    const fallback = detectLength(state)
    const span = selection ?? { start: fallback, end: fallback }
    const start = Math.min(span.start, fallback)
    const end = Math.min(Math.max(span.end, start), fallback)
    actions.insertReference(reference, { start, end, draftRev: state.draftRev })
  }

  doc.addEventListener('selectionchange', onSelectionChange)
  doc.addEventListener('dragstart', onDragStart)
  doc.addEventListener('dragenter', onDragEnter)
  doc.addEventListener('dragover', onDragOver)
  doc.addEventListener('dragleave', onDragLeave)
  doc.addEventListener('drop', onDrop)
  win.addEventListener('dragend', reset)
  win.addEventListener('blur', reset)

  return () => {
    observer.disconnect()
    doc.removeEventListener('selectionchange', onSelectionChange)
    doc.removeEventListener('dragstart', onDragStart)
    doc.removeEventListener('dragenter', onDragEnter)
    doc.removeEventListener('dragover', onDragOver)
    doc.removeEventListener('dragleave', onDragLeave)
    doc.removeEventListener('drop', onDrop)
    win.removeEventListener('dragend', reset)
    win.removeEventListener('blur', reset)
  }
}

/** Composer overlay entry that owns the document bridge for one live Session. */
export function WorkspaceFileDragBridge({
  sessionId, getInputState, insertReference, t,
}: BridgeProps) {
  const [active, setActive] = useState(false)
  useEffect(
    () => installWorkspaceFileDragBridge(
      document,
      window,
      sessionId,
      { getInputState, insertReference },
      setActive,
    ),
    [getInputState, insertReference, sessionId],
  )
  if (!active) return null
  return createPortal(
    <div className={css.mask} role="status" data-workspace-file-drop-overlay>
      <div className={css.card}>
        <svg className={css.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M4 3h6l2 2h8v16H4V3Zm8 5v4H9l3 3 3-3h-3V8Z" />
        </svg>
        <div className={css.title}>{t('drop.title')}</div>
        <div className={css.description}>{t('drop.description')}</div>
      </div>
    </div>,
    document.body,
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy shown while dragging a workspace file toward the composer. */
    'workspace.fileDrag': WorkspaceFileDragKey
  }
}
