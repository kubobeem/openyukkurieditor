/** ============================================================
 *  Brightness/Contrast Effect — 明るさ・コントラスト
 *  ============================================================ */

import { type PluginMeta, type ParamDef, type PluginContext } from '../../../plugin/api/core'
import { VideoEffectPlugin } from '../../../plugin/api/effect'

export class BrightnessContrastEffect extends VideoEffectPlugin {
  meta: PluginMeta & { type: 'video-effect' } = {
    id: 'open-yukkuri/effect/brightness-contrast',
    name: '明るさ・コントラスト',
    version: '1.0.0',
    author: 'Open Yukkuri',
    description: '画像の明るさとコントラストを調整します',
    type: 'video-effect',
  }

  params: ParamDef[] = [
    { id: 'brightness', name: '明るさ', type: 'slider', default: 0, min: -100, max: 100, step: 1 },
    { id: 'contrast', name: 'コントラスト', type: 'slider', default: 0, min: -100, max: 100, step: 1 },
  ]

  async init(_ctx: PluginContext): Promise<void> {}

  destroy(): void {}

  process(input: ImageData, params: Record<string, any>, _time: number): ImageData {
    const brightness = (params.brightness ?? 0) / 100
    const contrast = (params.contrast ?? 0) / 100
    const factor = (259 * (contrast * 127 + 255)) / (255 * (259 - contrast * 127))
    const data = input.data

    for (let i = 0; i < data.length; i += 4) {
      // コントラスト
      data[i]     = this.clamp(factor * (data[i]     - 128) + 128 + brightness * 128)
      data[i + 1] = this.clamp(factor * (data[i + 1] - 128) + 128 + brightness * 128)
      data[i + 2] = this.clamp(factor * (data[i + 2] - 128) + 128 + brightness * 128)
    }

    return input
  }

  private clamp(v: number): number {
    return Math.max(0, Math.min(255, Math.round(v)))
  }
}
