/** ============================================================
 *  Gaussian Blur Effect — ガウスぼかし
 *  ============================================================ */

import { type PluginMeta, type ParamDef, type PluginContext } from '../../../plugin/api/core'
import { VideoEffectPlugin } from '../../../plugin/api/effect'

export class GaussianBlurEffect extends VideoEffectPlugin {
  meta: PluginMeta & { type: 'video-effect' } = {
    id: 'open-yukkuri/effect/gaussian-blur',
    name: 'ガウスぼかし',
    version: '1.0.0',
    author: 'Open Yukkuri',
    description: 'ガウスぼかしを適用します',
    type: 'video-effect',
  }

  params: ParamDef[] = [
    { id: 'radius', name: '半径', type: 'slider', default: 5, min: 0, max: 50, step: 1 },
  ]

  async init(_ctx: PluginContext): Promise<void> {}
  destroy(): void {}

  process(input: ImageData, params: Record<string, any>, _time: number): ImageData {
    const radius = Math.max(1, params.radius ?? 5)
    const { width, height, data } = input
    const temp = new Uint8ClampedArray(data)

    this.blurH(data, temp, width, height, radius)
    this.blurV(temp, data, width, height, radius)

    return input
  }

  private blurH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number): void {
    const kernel = this.makeKernel(r)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rr = 0, gg = 0, bb = 0, aa = 0, total = 0
        for (let kx = -r; kx <= r; kx++) {
          const px = Math.max(0, Math.min(w - 1, x + kx))
          const i = (y * w + px) * 4
          const kw = kernel[kx + r]
          rr += src[i]     * kw
          gg += src[i + 1] * kw
          bb += src[i + 2] * kw
          aa += src[i + 3] * kw
          total += kw
        }
        const i = (y * w + x) * 4
        dst[i]     = rr / total
        dst[i + 1] = gg / total
        dst[i + 2] = bb / total
        dst[i + 3] = aa / total
      }
    }
  }

  private blurV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number): void {
    const kernel = this.makeKernel(r)
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let rr = 0, gg = 0, bb = 0, aa = 0, total = 0
        for (let ky = -r; ky <= r; ky++) {
          const py = Math.max(0, Math.min(h - 1, y + ky))
          const i = (py * w + x) * 4
          const kw = kernel[ky + r]
          rr += src[i]     * kw
          gg += src[i + 1] * kw
          bb += src[i + 2] * kw
          aa += src[i + 3] * kw
          total += kw
        }
        const i = (y * w + x) * 4
        dst[i]     = rr / total
        dst[i + 1] = gg / total
        dst[i + 2] = bb / total
        dst[i + 3] = aa / total
      }
    }
  }

  private makeKernel(r: number): number[] {
    const size = r * 2 + 1
    const kernel = new Array(size)
    const sigma = r / 2
    let sum = 0
    for (let i = 0; i < size; i++) {
      const x = i - r
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
      sum += kernel[i]
    }
    for (let i = 0; i < size; i++) kernel[i] /= sum
    return kernel
  }
}
