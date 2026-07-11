/** ============================================================
 *  PluginManager — プラグインのスキャン・読み込み・管理
 *  ============================================================ */

import { type PluginType, type PluginMeta, type PluginContext, Plugin } from './api/core'
import type { VideoEffectPlugin } from './api/effect'
import type { VoicePlugin } from './api/voice'

interface PluginEntry {
  meta: PluginMeta
  instance: Plugin
  enabled: boolean
  loadedAt: Date
}

type PluginConstructor = new () => Plugin

export class PluginManager {
  private registry = new Map<string, PluginEntry>()
  private constructors = new Map<string, PluginConstructor>()

  /** プラグインを登録 */
  register(id: string, ctor: PluginConstructor): void {
    this.constructors.set(id, ctor)
  }

  /** 全ての登録済みプラグインを初期化 */
  async loadAll(): Promise<void> {
    const ctx: PluginContext = {
      logger: {
        info: (msg) => console.log(`[Plugin] ${msg}`),
        warn: (msg) => console.warn(`[Plugin] ${msg}`),
        error: (msg) => console.error(`[Plugin] ${msg}`),
      },
      settings: {
        get: (key) => localStorage.getItem(`plugin:${key}`),
        set: (key, val) => localStorage.setItem(`plugin:${key}`, val),
      },
    }

    for (const [id, ctor] of this.constructors) {
      try {
        const instance = new ctor()
        await instance.init(ctx)
        this.registry.set(id, {
          meta: instance.meta,
          instance,
          enabled: true,
          loadedAt: new Date(),
        })
        console.log(`[PluginManager] Loaded: ${instance.meta.name} v${instance.meta.version}`)
      } catch (e) {
        console.error(`[PluginManager] Failed to load plugin ${id}:`, e)
      }
    }
  }

  /** 型安全なプラグイン取得 */
  get<T extends Plugin>(id: string): T | undefined {
    return this.registry.get(id)?.instance as T | undefined
  }

  /** 特定タイプのプラグイン一覧 */
  getAllByType(type: PluginType): PluginEntry[] {
    return Array.from(this.registry.values()).filter(e => e.meta.type === type)
  }

  /** 全てのVideoEffectPluginを取得 */
  getVideoEffects(): VideoEffectPlugin[] {
    return this.getAllByType('video-effect')
      .map(e => e.instance) as VideoEffectPlugin[]
  }

  /** 全てのVoicePluginを取得 */
  getVoicePlugins(): VoicePlugin[] {
    return this.getAllByType('voice')
      .map(e => e.instance) as VoicePlugin[]
  }

  /** プラグインの有効/無効 */
  setEnabled(id: string, enabled: boolean): void {
    const entry = this.registry.get(id)
    if (entry) entry.enabled = enabled
  }

  /** 全プラグイン破棄 */
  destroyAll(): void {
    for (const [, entry] of this.registry) {
      try { entry.instance.destroy() } catch { /* ignore */ }
    }
    this.registry.clear()
  }
}

/** グローバルシングルトン */
export const pluginManager = new PluginManager()
