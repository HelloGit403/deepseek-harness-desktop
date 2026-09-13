import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

describe('workspace-file drag plugin', () => {
  it('registers locale and a Session-scoped composer overlay', () => {
    const disposeLocale = vi.fn()
    const registerLocale = vi.fn(() => disposeLocale)
    let options: { inject: (sessionId: SessionId) => unknown } | undefined
    const input = {
      state: { getSnapshot: vi.fn(() => ({ draft: '', draftRev: 2, occurrences: [] })) },
      insertReference: vi.fn(() => true),
    }
    const scoped = {} as Context
    const ctx = {
      effect: (setup: () => () => void) => setup(),
      locale: { register: registerLocale },
      sessions: { scope: vi.fn(() => scoped) },
      conversation: { input: { for: vi.fn(() => input) } },
      slots: {
        inject: vi.fn((_name: string, setup: () => unknown) => setup()),
        register: vi.fn((candidate: { inject: (sessionId: SessionId) => unknown }) => {
          options = candidate
          return vi.fn()
        }),
      },
    } as unknown as Context

    expect(inject).toEqual(['slots', 'sessions', 'conversation', 'locale'])
    apply(ctx)
    const actions = options!.inject('session-a' as SessionId) as {
      getInputState: () => unknown
      insertReference: (...args: never[]) => boolean
    }
    expect(actions.getInputState()).toEqual({ draft: '', draftRev: 2, occurrences: [] })
    expect(actions.insertReference({} as never, {} as never)).toBe(true)
    expect(input.insertReference).toHaveBeenCalledOnce()
    expect(registerLocale).toHaveBeenCalledOnce()
    expect(ctx.slots.register).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'workspace-file-drag', order: 20, locale: 'workspace.fileDrag' }),
      expect.any(Function),
    )
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('fails loudly when a rendered Session has no scope', () => {
    let injectEntry: ((sessionId: SessionId) => unknown) | undefined
    const ctx = {
      effect: (setup: () => () => void) => setup(),
      locale: { register: () => vi.fn() },
      sessions: { scope: () => undefined },
      conversation: { input: { for: vi.fn() } },
      slots: {
        inject: (_name: string, setup: () => unknown) => setup(),
        register: (options: { inject: (sessionId: SessionId) => unknown }) => {
          injectEntry = options.inject
          return vi.fn()
        },
      },
    } as unknown as Context
    apply(ctx)
    expect(() => injectEntry?.('missing' as SessionId)).toThrow(/resolved no scope/u)
  })
})
