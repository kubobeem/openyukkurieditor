/** ============================================================
 *  VoiceEngineManager — 複数音声合成エンジンの統合管理
 *  ============================================================ */

import { VoicevoxClient } from './voicevox'

export interface VoiceEngineInfo {
  id: string
  name: string
  available: boolean
  speakers: { id: number; name: string; styleName: string }[]
}

export interface SynthesizeOptions {
  speed?: number
  pitch?: number
  intonation?: number
  volume?: number
}

export class VoiceEngineManager {
  private engines = new Map<string, VoicevoxClient>()
  private audioCtx: AudioContext

  constructor() {
    this.audioCtx = new AudioContext()
  }

  /** エンジンを登録 */
  register(id: string, baseUrl: string): void {
    this.engines.set(id, new VoicevoxClient(baseUrl))
  }

  /** デフォルトエンジンを登録 */
  registerDefaults(): void {
    this.register('voicevox', 'http://localhost:50021')
    this.register('coeiroink', 'http://localhost:50031')
  }

  /** 利用可能なエンジンと話者一覧を取得 */
  async getAvailableEngines(): Promise<VoiceEngineInfo[]> {
    const results: VoiceEngineInfo[] = []

    for (const [id, client] of this.engines) {
      try {
        const available = await client.healthCheck()
        if (!available) {
          results.push({ id, name: this.getEngineName(id), available: false, speakers: [] })
          continue
        }
        const speakers = await client.getSpeakers()
        const flatSpeakers = speakers.flatMap(s =>
          s.styles.map(st => ({
            id: st.id,
            name: s.name,
            styleName: st.name,
          }))
        )
        results.push({
          id,
          name: this.getEngineName(id),
          available: true,
          speakers: flatSpeakers,
        })
      } catch {
        results.push({ id, name: this.getEngineName(id), available: false, speakers: [] })
      }
    }
    return results
  }

  /** 音声合成 */
  async synthesize(
    engineId: string,
    text: string,
    styleId: number,
    options?: SynthesizeOptions,
  ): Promise<AudioBuffer> {
    const client = this.engines.get(engineId)
    if (!client) throw new Error(`Engine not found: ${engineId}`)

    const wavData = await client.speak(text, styleId, options)
    return client.decodeAudio(this.audioCtx, wavData)
  }

  /** プレビュー再生 */
  async preview(engineId: string, text: string, styleId: number, options?: SynthesizeOptions): Promise<void> {
    const audioBuffer = await this.synthesize(engineId, text, styleId, options)
    const source = this.audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.audioCtx.destination)
    source.start()
  }

  private getEngineName(id: string): string {
    const names: Record<string, string> = {
      voicevox: 'VOICEVOX',
      coeiroink: 'COEIROINK',
    }
    return names[id] || id
  }

  dispose(): void {
    this.audioCtx.close()
  }
}
