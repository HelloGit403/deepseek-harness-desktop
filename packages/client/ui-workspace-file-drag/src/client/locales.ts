/** Dictionary namespace owned by the workspace-file drag plugin. */
export const NS = 'workspace.fileDrag'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'drop.title': '松开以引用工作区文件',
  'drop.description': '文件会作为引用插入，不会重复上传',
} as const

/** Workspace-file drag dictionary key union. */
export type WorkspaceFileDragKey = keyof typeof zh

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<WorkspaceFileDragKey, string> = {
  'drop.title': 'Drop to reference the workspace file',
  'drop.description': 'The file is inserted as a reference, not uploaded again',
}
