/** ============================================================
 *  Plugin API — Voice Synthesis Plugin Interfaces
 *  ============================================================ */

import { Plugin, type PluginMeta, type PluginContext } from './core'

export interface VoiceSpeaker {
  name: string
  speakerUuid: string
  styles: { id: number; name: string }[]
}

export interface VoicePreset {
  id: string
  name: string
  engineId: string
  speakerId: number
  styleId: number
  speed: number
  pitch: number
  intonation: number
  volume: number
}

export interface VoiceOptions {
  speed?: number
  pitch?: number
  intonation?: number
  volume?: number
}

/** 音声合成プラグイン */
export abstract class VoicePlugin extends Plugin {
  declare meta: PluginMeta & { type: 'voice' }

  abstract get engineName(): string
  abstract get engineUrl(): string

  /** 話者一覧を取得 */
  abstract getSpeakers(): Promise<VoiceSpeaker[]>

  /** テキスト → 音声合成 */
  abstract synthesize(
    text: string,
    styleId: number,
    options?: VoiceOptions,
  ): Promise<ArrayBuffer>

  /** エンジンが起動しているか確認 */
  abstract healthCheck(): Promise<boolean>
}
