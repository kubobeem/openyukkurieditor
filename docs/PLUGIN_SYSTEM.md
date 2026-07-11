# プラグインシステム設計書

## 1. 概要

YMM4互換かつ独自拡張可能なプラグインシステムを設計します。

### 目標
- YMM4のプラグインAPIと互換性を持つ（C# DLL → TypeScript変換レイヤー）
- 独自のJavaScript/TypeScriptプラグインをネイティブサポート
- AviUtlのスクリプト（.anm/.obj）も変換レイヤーで実行可能
- サンドボックス化によるセキュリティ

## 2. プラグインの種類

```
Plugin
├── EffectPlugin          # 映像/音声エフェクト
│   ├── VideoEffect       # 映像フィルター
│   └── AudioEffect       # 音声フィルター
├── ToolPlugin            # ツール/ユーティリティ
├── VoicePlugin           # 音声合成エンジン連携
├── IOFilesystemPlugin    # ファイル入出力
│   ├── ImageLoader       # 画像読み込み
│   ├── VideoLoader       # 動画読み込み
│   └── Exporter          # 動画出力
├── ShapePlugin           # 図形描画
├── TransitionPlugin      # シーン間トランジション
└── ScriptPlugin          # AviUtl互換スクリプト
```

## 3. Plugin API 設計

### 3.1 基本インターフェース

```typescript
// plugin/api/core.ts

/** プラグインのメタデータ */
interface PluginMeta {
  id: string              // 一意識別子（例: "open-yukkuri/effect/blur"）
  name: string            // 表示名
  version: string         // セマンティックバージョン
  author: string          // 作者名
  description: string     // 説明
  icon?: string           // アイコン（SVG or emoji）
  license?: string        // ライセンス
  minApiVersion?: string  // 最小APIバージョン
}

/** プラグイン基底クラス */
abstract class Plugin {
  abstract meta: PluginMeta
  abstract init(): void | Promise<void>
  abstract destroy(): void
}

/** プラグインコンテキスト（実行環境へのアクセス） */
interface PluginContext {
  project: ProjectProxy            // 読み取り専用プロジェクト参照
  timeline: TimelineProxy          // タイムライン操作
  resources: ResourceManager       // リソース管理
  logger: Logger                   // ロギング
  settings: SettingsManager        // 設定保存
  ui?: UIExtension                 // UI拡張（ToolPluginのみ）
}
```

### 3.2 エフェクトプラグインAPI

```typescript
// plugin/api/effect.ts

interface EffectParam {
  id: string
  name: string
  type: 'number' | 'boolean' | 'color' | 'select' | 'slider' | 'position'
  default: any
  min?: number
  max?: number
  step?: number
  options?: { label: string; value: any }[]
}

abstract class VideoEffectPlugin extends Plugin {
  abstract params: EffectParam[]
  
  /** フレーム単位のエフェクト処理 */
  abstract process(input: ImageData, params: Record<string, any>, time: number): ImageData | Promise<ImageData>
  
  /** WebGLシェーダー（任意） */
  shaderSource?: string
  
  /** 処理が重い場合にキャッシュをサポート */
  supportsCache?: boolean
}

abstract class AudioEffectPlugin extends Plugin {
  abstract params: EffectParam[]
  
  /** 音声データの処理 */
  abstract process(input: AudioBuffer, params: Record<string, any>, time: number): AudioBuffer | Promise<AudioBuffer>
}
```

### 3.3 音声合成プラグインAPI

```typescript
// plugin/api/voice.ts

interface VoicePreset {
  id: string
  name: string
  speaker: string
  speed: number
  pitch: number
  emotion?: string
}

abstract class VoicePlugin extends Plugin {
  abstract presets: VoicePreset[]
  
  /** テキスト → {} 音声合成 */
  abstract synthesize(text: string, preset: VoicePreset, options?: VoiceOptions): Promise<AudioBuffer>
  
  /** 話者一覧の取得 */
  abstract getSpeakers(): Promise<VoiceSpeaker[]>
}
```

### 3.4 ツールプラグインAPI

```typescript
// plugin/api/tool.ts

abstract class ToolPlugin extends Plugin {
  /** ツールをアクティブにした時に表示するUIコンポーネント */
  abstract renderUI(): React.ReactNode | string
  
  /** ツールのショートカットキー */
  shortcut?: string
}
```

## 4. プラグインの読み込み機構

```
Plugin Loader Architecture:
┌─────────────────────────────────────────────┐
│              PluginManager                    │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Scanner  │→│ Loader   │→│ Registry   │ │
│  │(検出)    │  │(読み込み)│  │(管理)      │ │
│  └──────────┘  └──────────┘  └────────────┘ │
│       │             │              │         │
│  ┌────▼────┐  ┌────▼────┐  ┌─────▼───────┐ │
│  │ Sandbox  │  │ Hot     │  │ Dependency  │ │
│  │ (隔離)   │  │ Reload  │  │ Resolver   │ │
│  └─────────┘  └─────────┘  └─────────────┘ │
└─────────────────────────────────────────────┘
```

### 読み込みパス
```
open-yukkuri-editor/
└── plugins/
    ├── <plugin-id>/
    │   ├── plugin.json      # マニフェスト
    │   ├── index.js         # メインファイル
    │   ├── icon.svg         # アイコン
    │   └── assets/          # 追加リソース
    └── ...
```

### plugin.json マニフェスト

```json
{
  "id": "example-effect",
  "name": "Example Effect",
  "version": "1.0.0",
  "author": "Username",
  "type": "video-effect",
  "entry": "index.js",
  "apiVersion": "1.0",
  "dependencies": {},
  "permissions": ["network:voicevox"]
}
```

## 5. YMM4プラグイン互換レイヤー

YMM4のプラグインはC# DLLとして配布されています。これらを直接読み込むには2つの方法があります：

### 方法A: トランスパイラ方式（推奨）
YMM4プラグインのC#コードを解析し、TypeScriptに変換するツールを開発。
ただし完全自動は困難なため、プラグイン作者にTypeScript版の提供を促す。

### 方法B: Edge.js / Node会話方式
ElectronのmainプロセスでYMM4プラグインDLLを読み込み、IPCで結果を受け渡す。
- メリット: 既存DLLがそのまま使える
- デメリット: Windowsのみ、パフォーマンスオーバーヘッド

**推奨**: 当面はB（Edge.js方式）でYMM4互換を実現し、徐々にネイティブTypeScriptプラグインに移行。

## 6. AviUtlスクリプト互換レイヤー

AviUtlのスクリプト（.anm, .obj）は独自のLua-like言語です。

### 変換方式
1. **AviUtlスクリプトパーサー** をTypeScriptで実装
2. 各命令をTypeScriptの同等関数にマッピング
3. スクリプトの状態管理（変数、フレームカウンター等）

```typescript
// engine/script/aviutl-interpreter.ts

interface AviUtlScriptState {
  // AviUtl互換変数
  frame: number           // 現在のフレーム
  width: number           // オブジェクト幅
  height: number          // オブジェクト高さ
  x: number               // X座標
  y: number               // Y座標
  alpha: number           // 透明度
  scale: number           // 拡大率
  rotation: number        // 回転
  // ...多数の互換変数
}

type AviUtlScript = (state: AviUtlScriptState) => void
```

## 7. セキュリティモデル

```
Plugin Permission Levels:
├── Level 0: 隔離実行
│   └── ファイルアクセス不可、ネットワーク不可
├── Level 1: 制限付き
│   ├── 自プラグインディレクトリのみ読み書き可
│   └── 特定ホストへのネットワーク可
└── Level 2: フルアクセス
    ├── ファイルシステム全アクセス
    └── ネットワーク全アクセス
```

## 8. 実装優先順位

1. **PluginManager 基盤** — スキャン・読み込み・レジストリ
2. **VideoEffectPlugin** — 最初のエフェクトプラグイン（ブラー等）
3. **ToolPlugin** — 設定UIを持つツール系
4. **VoicePlugin** — VOICEVOX統合
5. **YMM4互換レイヤー** — Edge.js方式
6. **AviUtlスクリプト互換** — インタープリター方式
