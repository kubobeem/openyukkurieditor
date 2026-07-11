/** ============================================================
 *  Plugin API — Core Interfaces
 *  ============================================================ */

/** プラグインの種類 */
export type PluginType =
  | 'video-effect'
  | 'audio-effect'
  | 'voice'
  | 'tool'
  | 'io'
  | 'transition'
  | 'shape'
  | 'script'

/** プラグインメタデータ */
export interface PluginMeta {
  id: string
  name: string
  version: string
  author: string
  description: string
  type: PluginType
  icon?: string
  license?: string
  minApiVersion?: string
}

/** プラグインの権限レベル */
export type PermissionLevel = 'isolated' | 'restricted' | 'full'

/** プラグイン権限 */
export interface PluginPermissions {
  level: PermissionLevel
  allowNetwork?: string[]
  allowFileSystem?: boolean
}

/** パラメータ定義 */
export interface ParamDef {
  id: string
  name: string
  type: 'number' | 'boolean' | 'color' | 'select' | 'slider' | 'position' | 'text'
  default: any
  min?: number
  max?: number
  step?: number
  options?: { label: string; value: any }[]
}

/** プラグインコンテキスト */
export interface PluginContext {
  logger: {
    info: (msg: string) => void
    warn: (msg: string) => void
    error: (msg: string) => void
  }
  settings: {
    get: (key: string) => any
    set: (key: string, value: any) => void
  }
}

/** プラグイン基底クラス */
export abstract class Plugin {
  abstract meta: PluginMeta
  abstract init(ctx: PluginContext): void | Promise<void>
  abstract destroy(): void
}
