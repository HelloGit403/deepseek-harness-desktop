import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject, name } from '../src/invariant.ts'

describe('workspace-file drag invariant companion', () => {
  it('reserves package ownership and returns the disposer', async () => {
    const disposer = vi.fn()
    const register = vi.fn(() => disposer)
    const ctx = new Context()
    ctx.provide('invariants', { register })
    expect(name).toBe('client-ui-workspace-file-drag-invariant')
    expect(inject).toEqual(['invariants'])
    await expect(apply(ctx)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith(
      '@deepseek-ai/dsh-client-ui-workspace-file-drag',
      expect.any(Function),
    )
    expect(register.mock.calls[0]?.[1](ctx)).toBeUndefined()
  })
})
