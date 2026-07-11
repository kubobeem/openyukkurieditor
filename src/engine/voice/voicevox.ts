/** ============================================================
 *  VOICEVOX Engine — HTTP API Client
 *  ============================================================ */

interface VoicevoxSpeaker {
  name: string
  speakerUuid: string
  styles: { id: number; name: string }[]
  version: string
}

interface VoicevoxQuery {
  accent_phrases: unknown[]
  speedScale: number
  pitchScale: number
  intonationScale: number
  volumeScale: number
  prePhonemeLength: number
  postPhonemeLength: number
  outputSamplingRate: number
  outputStereo: boolean
  kana?: string
}

export class VoicevoxClient {
  private baseUrl: string
  private cache = new Map<string, ArrayBuffer>()

  constructor(baseUrl = 'http://localhost:50021') {
    this.baseUrl = baseUrl
  }

  /** エンジンの稼働確認 */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/version`, { signal: AbortSignal.timeout(3000) })
      return res.ok
    } catch {
      return false
    }
  }

  /** 話者一覧を取得 */
  async getSpeakers(): Promise<VoicevoxSpeaker[]> {
    const res = await fetch(`${this.baseUrl}/speakers`)
    if (!res.ok) throw new Error(`VOICEVOX: Failed to get speakers (${res.status})`)
    return res.json()
  }

  /** テキストから音声クエリを生成 */
  async createQuery(text: string, speaker: number): Promise<VoicevoxQuery> {
    const url = `${this.baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`
    const res = await fetch(url, { method: 'POST' })
    if (!res.ok) throw new Error(`VOICEVOX: Failed to create query (${res.status})`)
    return res.json()
  }

  /** クエリから音声を合成してWAVデータを取得 */
  async synthesize(query: VoicevoxQuery, speaker: number): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/synthesis?speaker=${speaker}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    })
    if (!res.ok) throw new Error(`VOICEVOX: Failed to synthesize (${res.status})`)
    return res.arrayBuffer()
  }

  /** テキスト→音声（キャッシュ付き） */
  async speak(
    text: string,
    styleId: number,
    options?: { speed?: number; pitch?: number; intonation?: number; volume?: number },
  ): Promise<ArrayBuffer> {
    // キャッシュチェック
    const cacheKey = `${text}:${styleId}:${JSON.stringify(options || {})}`
    const cached = this.cache.get(cacheKey)
    if (cached) return cached.slice(0)

    const query = await this.createQuery(text, styleId)

    // パラメータ調整
    if (options?.speed !== undefined) query.speedScale = options.speed
    if (options?.pitch !== undefined) query.pitchScale = options.pitch
    if (options?.intonation !== undefined) query.intonationScale = options.intonation
    if (options?.volume !== undefined) query.volumeScale = options.volume

    const wavData = await this.synthesize(query, styleId)

    // キャッシュに保存
    this.cache.set(cacheKey, wavData.slice(0))
    // 簡易キャッシュ制限
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }

    return wavData
  }

  /** ArrayBuffer → AudioBuffer に変換 */
  async decodeAudio(ctx: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> {
    return ctx.decodeAudioData(buffer.slice(0))
  }
}
