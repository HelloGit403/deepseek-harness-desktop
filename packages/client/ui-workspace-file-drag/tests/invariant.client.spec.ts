import { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject, name } from '../src/invariant.ts'

describe('workspace-file drag invariant companion', () => {
  it('reserves package ownership and returns the disposer', async () => {
    const disposer = vi.fn()
    const register = vi.fn((_packageName: string, _installer: InvariantInstaller) => disposer)
    const ctx = new Context()
    ctx.provide('invariants', { register })
    expect(name).toBe('client-ui-workspace-file-drag-invariant')
    expect(inject).toEqual(['invariants'])
    await expect(apply(ctx)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith(
      '@deepseek-ai/dsh-client-ui-workspace-file-drag',
      expect.any(Function),
    )
    const installer = register.mock.calls[0]?.[1]
    expect(installer).toBeTypeOf('function')
    const fail: InvariantFailure = () => {
      throw new Error('the no-op installer never reports failures')
    }
    expect(installer?.(ctx, fail)).toBeUndefined()
  })
})
