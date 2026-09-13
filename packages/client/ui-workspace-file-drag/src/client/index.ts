/** Browser entry for workspace-file tree drag references. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  WorkspaceFileDragBridge, type WorkspaceFileDragActions,
} from './WorkspaceFileDragBridge.tsx'
import { en, NS, zh } from './locales.ts'

/** Services required for locale, Session scope, input access, and slot registration. */
export const inject = ['slots', 'sessions', 'conversation', 'locale']

/** Register the localized Session-scoped composer bridge. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace-file-drag: dictionaries')
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'workspace-file-drag',
    order: 20,
    locale: NS,
    inject: (sessionId: SessionId): WorkspaceFileDragActions => {
      const actx = ctx.sessions.scope(sessionId)
      if (actx === undefined) {
        throw new Error(`ui-workspace-file-drag: session "${String(sessionId)}" resolved no scope`)
      }
      const input = ctx.conversation.input.for(actx)
      return {
        getInputState: () => input.state.getSnapshot(),
        insertReference: (reference, span) => input.insertReference(reference, span),
      }
    },
  }, WorkspaceFileDragBridge))
}
