# 音声合成連携設計書

## 1. 概要

YMM4の最大の特徴である音声合成エンジン連携を、Open Yukkuri Editorでも実現します。

## 2. 対応エンジン

| エンジン名 | 方式 | ライセンス | 対応優先度 |
|-----------|------|-----------|:---------:|
| **VOICEVOX** | HTTP API (localhost) | MIT / 商用OK | 🔴 最優先 |
| **COEIROINK** | HTTP API (localhost) | 独自 / 商用OK | 🔴 最優先 |
| **OpenAI TTS** | Cloud API (要API Key) | 従量課金 | 🟡 標準 |
| **Google TTS** | Cloud API (要API Key) | 従量課金 | 🟡 標準 |
| **Style-Bert-VITS2** | HTTP API (localhost) | MIT | 🟡 標準 |
| **AITalk** | ローカルSDK | 商用ライセンス | 🟢 低優先 |
| **CeVIO AI** | COM連携 | 商用ライセンス | 🟢 低優先 |
| **VOICEPEAK** | ローカルAPI | 商用ライセンス | 🟢 低優先 |

## 3. アーキテクチャ

```
┌──────────────────────────────────────────────────┐
│               Voice Plugin System                 │
│                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │  VOICEVOX  │  │  COEIROINK │  │  Other     │  │
│  │  Plugin    │  │  Plugin    │  │  Plugins.. │  │
│  └─────┬──────┘  └─────┬──────┘  └──────┬─────┘  │
│        │               │                 │         │
│  ┌─────┴───────────────┴─────────────────┴──────┐  │
│  │           VoiceEngineManager                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │  Engine   │ │  Queue   │ │  Cache       │  │  │
│  │  │  Registry │ │ Manager  │ │  (IndexedDB) │  │  │
│  │  └──────────┘ └──────────┘ └──────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                         │                           │
│  ┌──────────────────────┴──────────────────────┐   │
│  │              Voice Control UI                │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │   │
│  │  │  Speaker │ │  Preset  │ │  Timeline    │ │   │
│  │  │  Select  │ │  Manager │ │  Preview     │ │   │
│  │  └──────────┘ └──────────┘ └──────────────┘  │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

## 4. VOICEVOX統合（最優先）

### 4.1 接続方式
```typescript
// engine/voice/voicevox.ts

interface VoicevoxSpeaker {
  name: string
  speakerUuid: string
  styles: { id: number; name: string }[]
  version: string
}

interface VoicevoxQuery {
  accent_phrases: AccentPhrase[]
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

class VoicevoxEngine {
  private baseUrl = 'http://localhost:50021'
  private cache = new Map<string, ArrayBuffer>()
  
  /** 話者一覧を取得 */
  async getSpeakers(): Promise<VoicevoxSpeaker[]> { /* ... */ }
  
  /** テキストから音声クエリを生成 */
  async createQuery(text: string, speaker: number): Promise<VoicevoxQuery> { /* ... */ }
  
  /** クエリから音声を合成 */
  async synthesize(query: VoicevoxQuery, speaker: number): Promise<ArrayBuffer> { /* ... */ }
  
  /** テキスト→音声（ショートカット） */
  async speak(text: string, styleId: number): Promise<ArrayBuffer> {
    const query = await this.createQuery(text, styleId)
    return this.synthesize(query, styleId)
  }
}
```

### 4.2 音声クリップ生成フロー

```
テキスト入力
    │
    ▼
話者選択（キャラクター＋スタイル）
    │
    ▼
パラメータ調整（速度・ピッチ・抑揚）
    │
    ▼
[VOICEVOX API] HTTP POST /audio_query
    │
    ▼
音声クエリ調整（アクセント・長さ）
    │
    ▼
[VOICEVOX API] HTTP POST /synthesis
    │
    ▼
WAV データ受信
    │
    ▼
AudioBuffer に変換
    │
    ▼
タイムラインにクリップとして配置
    │
    ▼
字幕/テロップ自動生成（オプション）
```

## 5. 音声キャッシュ管理

```typescript
interface VoiceCacheEntry {
  text: string           // 入力テキスト（ハッシュ化）
  engineId: string       // エンジンID
  speakerId: number      // 話者ID
  params: VoiceParams    // パラメータ（速度等）
  audioData: Blob        // WAVデータ
  duration: number       // 再生時間（秒）
  createdAt: Date
}
```

### キャッシュ戦略
1. IndexedDBに永続化
2. テキスト + 話者 + パラメータのハッシュをキーに
3. クライアント側で重複合成を防止
4. キャッシュ上限（デフォルト100MB、設定可能）

## 6. 音声+字幕の自動同期

```typescript
class VoiceTextItem {
  /** 音声のテキスト */
  text: string
  
  /** 話者設定 */
  voicePreset: VoicePreset
  
  /** 字幕設定 */
  subtitleSettings: {
    font: string
    size: number
    color: string
    position: 'top' | 'middle' | 'bottom'
    style: 'speech' | 'thought' | 'narration'
  }
  
  /** タイムライン上の配置（自動計算） */
  estimatedDuration: number
}
```

## 7. 実装優先順位

1. **VOICEVOX Engine クライアント** — 話者取得・音声合成API
2. **VoiceControl UI** — 話者選択・パラメータ調整パネル
3. **音声クリップ生成** — タイムラインへの自動配置
4. **キャッシュ管理** — IndexedDBキャッシュ
5. **COEIROINK対応** — VOICEVOX互換API
6. **字幕自動生成** — フレーズ区切り＋タイミング
7. **OpenAI TTS対応** — クラウドAPI
