/** ============================================================
 *  Effect Pipeline — エフェクトチェーンの処理
 *  ============================================================ */

import { pluginManager } from '../../plugin/manager'
import type { VideoEffectPlugin } from '../../plugin/api/effect'

export interface EffectFrame {
  imageData: ImageData
  frameNumber: number
  time: number
  width: number
  height: number
}

export interface EffectBinding {
  pluginId: string
  enabled: boolean
  params: Record<string, any>
}

export class EffectPipeline {
  private bindings: EffectBinding[] = []

  /** エフェクトをチェーンに追加 */
  add(binding: EffectBinding): void {
    this.bindings.push(binding)
  }

  /** エフェクトを削除 */
  remove(index: number): void {
    this.bindings.splice(index, 1)
  }

  /** 全エフェクトをクリア */
  clear(): void {
    this.bindings = []
  }

  /** 全てのエフェクトを適用 */
  async process(frame: EffectFrame): Promise<EffectFrame> {
    let current = frame

    for (const binding of this.bindings) {
      if (!binding.enabled) continue

      const effect = pluginManager.get<VideoEffectPlugin>(binding.pluginId)
      if (!effect) continue

      const params = this.resolveParams(binding, frame.time)
      current = {
        ...current,
        imageData: await effect.process(current.imageData, params, frame.time),
      }
    }

    return current
  }

  /** パラメータ解決（将来: キーフレーム補間対応） */
  private resolveParams(binding: EffectBinding, _time: number): Record<string, any> {
    return { ...binding.params }
  }

  /** バインディング一覧 */
  getBindings(): EffectBinding[] {
    return [...this.bindings]
  }
}
