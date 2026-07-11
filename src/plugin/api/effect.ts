/** ============================================================
 *  Plugin API — Effect Plugin Interfaces
 *  ============================================================ */

import { Plugin, type PluginMeta, type ParamDef, type PluginContext } from './core'

/** 映像エフェクトプラグイン */
export abstract class VideoEffectPlugin extends Plugin {
  declare meta: PluginMeta & { type: 'video-effect' }
  abstract params: ParamDef[]

  /** フレーム単位のエフェクト処理 */
  abstract process(
    input: ImageData,
    params: Record<string, any>,
    time: number,
  ): ImageData | Promise<ImageData>

  /** WebGLシェーダーソース（任意） */
  shaderSource?: string
}

/** 音声エフェクトプラグイン */
export abstract class AudioEffectPlugin extends Plugin {
  declare meta: PluginMeta & { type: 'audio-effect' }
  abstract params: ParamDef[]

  abstract process(
    input: AudioBuffer,
    params: Record<string, any>,
    time: number,
  ): AudioBuffer | Promise<AudioBuffer>
}

/** トランジションプラグイン */
export abstract class TransitionPlugin extends Plugin {
  declare meta: PluginMeta & { type: 'transition' }
  abstract params: ParamDef[]

  abstract process(
    from: ImageData,
    to: ImageData,
    progress: number,
    params: Record<string, any>,
  ): ImageData | Promise<ImageData>
}
