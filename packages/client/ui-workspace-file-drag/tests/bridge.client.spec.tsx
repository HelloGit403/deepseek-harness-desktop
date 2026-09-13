// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  composerPointOffset,
  composerSelection,
  detectLength,
  installWorkspaceFileDragBridge,
  WORKSPACE_FILE_DRAG_TYPE,
  WorkspaceFileDragBridge,
  workspaceFileReference,
  workspaceRelativePath,
} from '../src/client/WorkspaceFileDragBridge.tsx'

const SID = 'session-a' as SessionId

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

function transfer(): DataTransfer {
  const values = new Map<string, string>()
  return {
    dropEffect: 'none',
    effectAllowed: 'uninitialized',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn(),
    getData: (type: string) => values.get(type) ?? '',
    setData(type: string, value: string) {
      values.set(type, value)
      ;(this.types as string[]).splice(0, this.types.length, ...values.keys())
    },
    setDragImage: vi.fn(),
  }
}

function drag(target: EventTarget, type: string, dataTransfer: DataTransfer): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  target.dispatchEvent(event)
  return event
}

function fixture(): { button: HTMLButtonElement; editor: HTMLElement; text: Text } {
  document.body.innerHTML = [
    '<div data-files-state="tree" data-files-root="C:\\work\\repo">',
    '  <li data-files-entry="file" data-files-path="C:\\work\\repo\\docs\\plan one.md"><button>plan one.md</button></li>',
    '</div>',
    '<div data-composer-card><div data-composer-input contenteditable="true"><p>Hello </p></div></div>',
  ].join('')
  const button = document.querySelector('button')!
  const editor = document.querySelector<HTMLElement>('[data-composer-input]')!
  const text = editor.querySelector('p')!.firstChild as Text
  return { button, editor, text }
}

describe('workspace path and reference conversion', () => {
  it('keeps only descendants and emits standard quoted file mentions', () => {
    expect(workspaceRelativePath('/work/repo/', '/work/repo/docs/a.md')).toBe('docs/a.md')
    expect(workspaceRelativePath('C:\\Work\\Repo', 'c:\\work\\repo\\docs\\a.md')).toBe('docs/a.md')
    expect(workspaceRelativePath('\\\\SERVER\\Share', '\\\\server\\share\\docs\\a.md')).toBe('docs/a.md')
    expect(workspaceRelativePath('/', '/docs/a.md')).toBe('docs/a.md')
    expect(workspaceRelativePath('/work/repo', '/work/repository/a.md')).toBeUndefined()
    expect(workspaceRelativePath('', '/a.md')).toBeUndefined()
    expect(workspaceRelativePath('/work/repo', '/work/repo/../a.md')).toBeUndefined()
    expect(workspaceRelativePath('/work/repo', '/work/repo/docs//a.md')).toBeUndefined()
    expect(workspaceRelativePath('/work/repo', '/work/repo/./a.md')).toBeUndefined()
    expect(workspaceFileReference('docs/plan one.md')).toEqual({
      source: 'reference',
      ref: '@"docs/plan one.md"',
      label: 'plan one.md',
      appearance: 'file',
      clipboardText: '@"docs/plan one.md"',
    })
    expect(workspaceFileReference('/outside.md')).toBeUndefined()
    expect(workspaceFileReference('C:\\outside.md')).toBeUndefined()
    expect(workspaceFileReference('\\\\server\\outside.md')).toBeUndefined()
    expect(workspaceFileReference('../outside.md')).toBeUndefined()
    expect(workspaceFileReference('docs//outside.md')).toBeUndefined()
    expect(workspaceFileReference('docs/./outside.md')).toBeUndefined()
    expect(workspaceFileReference('bad\nname.md')).toBeUndefined()
  })
})

describe('composer projection', () => {
  it('counts text, chips, line breaks, and top-level block separators', () => {
    document.body.innerHTML = '<div><p>ab<span data-composer-chip>x</span><br>c</p><p>de</p></div>'
    const root = document.body.firstElementChild as HTMLElement
    const secondText = root.lastElementChild!.firstChild as Text
    expect(composerPointOffset(root, secondText, 1)).toBe(7)
    expect(composerPointOffset(root, root, 0)).toBe(0)
    expect(composerPointOffset(root, root, 1)).toBe(5)
    expect(composerPointOffset(root, root, 2)).toBe(8)
    expect(composerPointOffset(root, root, 99)).toBe(8)
    expect(composerPointOffset(root, root, -1)).toBe(0)
    expect(composerPointOffset(root, root.firstElementChild!, 0)).toBe(0)
    expect(composerPointOffset(root, root.firstElementChild!.firstChild!, -1)).toBe(0)
    expect(composerPointOffset(root, root.firstElementChild!.firstChild!, 99)).toBe(2)
    root.firstElementChild!.insertBefore(
      document.createComment('ignored'),
      root.firstElementChild!.querySelector('br'),
    )
    expect(composerPointOffset(root, secondText, 1)).toBe(7)
    expect(composerPointOffset(root, document.createComment('ignored'), 0)).toBeUndefined()
    expect(composerPointOffset(root, document.body, 0)).toBeUndefined()

    const range = document.createRange()
    range.setStart(root.firstElementChild!.firstChild!, 1)
    range.setEnd(secondText, 2)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    expect(composerSelection(root, selection)).toEqual({ start: 1, end: 8 })
    expect(composerSelection(root, null)).toBeUndefined()
    expect(composerSelection(root, {
      anchorNode: root.firstChild,
      anchorOffset: 0,
      focusNode: null,
      focusOffset: 0,
    } as unknown as Selection)).toBeUndefined()
    expect(composerSelection(root, {
      anchorNode: root.firstChild,
      anchorOffset: 0,
      focusNode: document.body,
      focusOffset: 0,
    } as unknown as Selection)).toBeUndefined()
    expect(detectLength({
      draft: 'ab@file.md cd',
      occurrences: [{ offset: 2, length: 8 }] as never,
    })).toBe(6)
  })
})

describe('DOM bridge', () => {
  it('marks file rows, retains the editor selection, inserts on drop, and disposes cleanly', async () => {
    const { button, editor, text } = fixture()
    const insertReference = vi.fn(() => true)
    const active: boolean[] = []
    const dispose = installWorkspaceFileDragBridge(
      document,
      window,
      SID,
      {
        getInputState: () => ({ draft: 'Hello ', draftRev: 4, occurrences: [] }),
        insertReference,
      },
      value => active.push(value),
    )
    expect(button.draggable).toBe(true)

    const range = document.createRange()
    range.setStart(text, 6)
    range.collapse(true)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))

    const dataTransfer = transfer()
    drag(button, 'dragstart', dataTransfer)
    expect(dataTransfer.effectAllowed).toBe('copy')
    expect(JSON.parse(dataTransfer.getData(WORKSPACE_FILE_DRAG_TYPE))).toEqual({
      sessionId: SID,
      path: 'docs/plan one.md',
    })
    expect(drag(editor, 'dragenter', dataTransfer).defaultPrevented).toBe(true)
    expect(drag(editor, 'dragenter', dataTransfer).defaultPrevented).toBe(true)
    expect(drag(editor, 'dragover', dataTransfer).defaultPrevented).toBe(true)
    expect(dataTransfer.dropEffect).toBe('copy')
    drag(editor, 'dragleave', dataTransfer)
    expect(active.at(-1)).toBe(true)
    drag(editor, 'dragleave', dataTransfer)
    expect(active.at(-1)).toBe(false)
    drag(editor, 'dragenter', dataTransfer)
    expect(drag(editor, 'drop', dataTransfer).defaultPrevented).toBe(true)
    expect(insertReference).toHaveBeenCalledWith(
      expect.objectContaining({ ref: '@"docs/plan one.md"', label: 'plan one.md' }),
      { start: 6, end: 6, draftRev: 4 },
    )
    expect(active).toEqual([true, true, false, true, false])

    dispose()
    const afterDispose = transfer()
    drag(button, 'dragstart', afterDispose)
    expect(afterDispose.types).toEqual([])

    const dynamic = document.createElement('li')
    dynamic.dataset.filesEntry = 'file'
    dynamic.dataset.filesPath = 'C:\\work\\repo\\new.md'
    dynamic.innerHTML = '<button>new.md</button>'
    document.querySelector('[data-files-root]')!.append(dynamic)
    await Promise.resolve()
    expect(dynamic.querySelector('button')!.draggable).toBe(false)
  })

  it('falls back to the current draft end and rejects foreign or malformed payloads', () => {
    const { button, editor } = fixture()
    const insertReference = vi.fn(() => true)
    const dispose = installWorkspaceFileDragBridge(
      document,
      window,
      SID,
      {
        getInputState: () => ({
          draft: 'See @file.md',
          draftRev: 8,
          occurrences: [{ offset: 4, length: 8 }] as never,
        }),
        insertReference,
      },
      vi.fn(),
    )
    const own = transfer()
    drag(button, 'dragstart', own)
    drag(editor, 'drop', own)
    expect(insertReference).toHaveBeenLastCalledWith(expect.anything(), { start: 5, end: 5, draftRev: 8 })

    for (const raw of [
      '{',
      'null',
      JSON.stringify({ sessionId: 'other', path: 'docs/a.md' }),
      JSON.stringify({ sessionId: SID, path: 3 }),
      JSON.stringify({ sessionId: SID, path: '../outside.md' }),
    ]) {
      const invalid = transfer()
      invalid.setData(WORKSPACE_FILE_DRAG_TYPE, raw)
      drag(editor, 'drop', invalid)
    }
    expect(insertReference).toHaveBeenCalledTimes(1)

    const external = transfer()
    expect(drag(editor, 'dragenter', external).defaultPrevented).toBe(false)
    expect(drag(editor, 'dragover', external).defaultPrevented).toBe(false)
    expect(drag(editor, 'drop', external).defaultPrevented).toBe(false)
    drag(editor, 'dragleave', external)

    editor.setAttribute('aria-disabled', 'true')
    expect(drag(editor, 'dragenter', own).defaultPrevented).toBe(false)
    editor.removeAttribute('aria-disabled')
    editor.removeAttribute('contenteditable')
    expect(drag(editor, 'dragenter', own).defaultPrevented).toBe(false)
    dispose()
  })

  it('ignores selections and drag sources outside the supported host markers', () => {
    const { button, editor } = fixture()
    const insertReference = vi.fn(() => true)
    const dispose = installWorkspaceFileDragBridge(
      document,
      window,
      SID,
      {
        getInputState: () => ({ draft: '', draftRev: 0, occurrences: [] }),
        insertReference,
      },
      vi.fn(),
    )

    const selection = document.getSelection()!
    selection.removeAllRanges()
    document.dispatchEvent(new Event('selectionchange'))
    const elementRange = document.createRange()
    elementRange.selectNodeContents(editor)
    selection.addRange(elementRange)
    document.dispatchEvent(new Event('selectionchange'))

    const unsupported = transfer()
    drag(document, 'dragstart', unsupported)
    drag(editor, 'dragstart', unsupported)

    const detachedRow = document.createElement('li')
    detachedRow.dataset.filesEntry = 'file'
    detachedRow.dataset.filesPath = 'C:\\work\\repo\\detached.md'
    detachedRow.innerHTML = '<button>detached.md</button>'
    document.body.append(detachedRow)
    drag(detachedRow.firstElementChild!, 'dragstart', unsupported)

    const outsideRow = document.createElement('li')
    outsideRow.dataset.filesEntry = 'file'
    outsideRow.dataset.filesPath = 'C:\\outside.md'
    outsideRow.innerHTML = '<button>outside.md</button>'
    document.querySelector('[data-files-root]')!.append(outsideRow)
    drag(outsideRow.firstElementChild!, 'dragstart', unsupported)

    const withoutTransfer = new Event('dragstart', { bubbles: true })
    Object.defineProperty(withoutTransfer, 'dataTransfer', { value: null })
    button.dispatchEvent(withoutTransfer)
    expect(unsupported.types).toEqual([])
    dispose()
  })

  it('renders localized overlay copy only during an accepted drag', () => {
    const { button, editor } = fixture()
    const props = {
      sessionId: SID,
      getInputState: () => ({ draft: '', draftRev: 0, occurrences: [] }),
      insertReference: vi.fn(() => true),
      t: (key: string) => key === 'drop.title' ? '松开以引用工作区文件' : '不会重复上传',
    } as ComponentProps<typeof WorkspaceFileDragBridge>
    render(<WorkspaceFileDragBridge {...props} />)
    const dataTransfer = transfer()
    act(() => {
      drag(button, 'dragstart', dataTransfer)
      drag(editor, 'dragenter', dataTransfer)
    })
    expect(document.querySelector('[data-workspace-file-drop-overlay]')?.textContent)
      .toContain('松开以引用工作区文件')
    act(() => { window.dispatchEvent(new Event('dragend')) })
    expect(document.querySelector('[data-workspace-file-drop-overlay]')).toBeNull()
  })
})
