# AviUtl互換性＆スクリプトシステム設計書

## 1. 概要

AviUtlのフィルタベース編集モデルとスクリプトシステム（.anm/.obj）をOpen Yukkuri Editorで再現します。

## 2. AviUtl互換レイヤー全体像

```
Open Yukkuri Editor
        │
        ▼
┌──────────────────────────────────────┐
│        AviUtl Compatibility Layer     │
│                                       │
│  ┌──────────────┐  ┌──────────────┐  │
│  │  Filter      │  │  Script      │  │
│  │  Pipeline    │  │  Interpreter │  │
│  └──────┬───────┘  └──────┬───────┘  │
│         │                 │          │
│  ┌──────┴─────────────────┴───────┐  │
│  │    AviUtl → Internal Model     │  │
│  │    Converter                   │  │
│  └──────────┬────────────────────┘  │
│             │                       │
│  ┌──────────┴────────────────────┐  │
│  │    AviUtl Project Parser      │  │
│  │    (.aup? / 独自形式)         │  │
│  └───────────────────────────────┘  │
└──────────────────────────────────────┘
```

## 3. フィルタパイプライン

AviUtlの編集モデルは「フィルタをかける」という概念が中心です。

```typescript
// engine/effect/aviutl-filter.ts

interface AviUtlFilter {
  name: string
  track: number           // フィルタ適用トラック番号
  enabled: boolean
  params: Record<string, number>
  
  /** AviUtl互換のフィルタ処理 */
  process(frame: AviUtlFrame, settings: AviUtlFilterSettings): AviUtlFrame
}

interface AviUtlFrame {
  pixels: Uint8ClampedArray  // RGBAピクセルデータ
  width: number
  height: number
  frameNo: number
  sceneNo: number
}
```

### AviUtl標準フィルタのマッピング

| AviUtlフィルタ | Open Yukkuri Editor相当 | 状態 |
|---------------|------------------------|:---:|
| 拡張フィルタ(EDIT) | タイムライン編集 ✨ | ✅ 実装済 |
| 色調補正 | EffectSystem > ColorCorrection | 🔧 予定 |
| ぼかし | EffectSystem > GaussianBlur | 🔧 予定 |
| シャープ | EffectSystem > Sharpen | 🔧 予定 |
| 輝度・コントラスト | EffectSystem > BrightnessContrast | 🔧 予定 |
| レベル補正 | EffectSystem > LevelCorrection | 🔧 予定 |
| ネガポジ反転 | EffectSystem > Invert | 🔧 予定 |
| フェード | TransitionSystem > Fade | 🔧 予定 |
| カメラ制御 | KeyframeSystem > Camera | 🔧 予定 |

## 4. AviUtlスクリプトインタープリター

AviUtlのスクリプト（.anm, .obj）を解析・実行するエンジン。

### 4.1 対応スクリプト変数

AviUtlスクリプトで利用可能な変数をすべてTypeScriptで再現：

```typescript
// engine/script/aviutl-state.ts

class AviUtlScriptState {
  // === 基本オブジェクト情報 ===
  frame: number = 0           // フレーム番号 (0始まり)
  width: number = 0           // オブジェクト幅
  height: number = 0          // オブジェクト高さ
  x: number = 0               // X位置（中央基準）
  y: number = 0               // Y位置（中央基準）
  z: number = 0               // Z位置
  
  // === 表示属性 ===
  alpha: number = 255         // 不透明度 (0-255)
  scaleX: number = 1.0        // 横拡大率
  scaleY: number = 1.0        // 縦拡大率
  rotation: number = 0        // 回転角度 (度)
  blur: number = 0            // ぼかし量
  
  // === 色 ===
  red: number = 255
  green: number = 255
  blue: number = 255
  
  // === カメラ制御 ===
  camX: number = 0
  camY: number = 0
  camZ: number = 0
  camRotX: number = 0
  camRotY: number = 0
  camRotZ: number = 0
  camFov: number = 30
  
  // === 描画設定 ===
  blendMode: BlendMode = 'normal'
  filter: number = 0
  
  // === ユーザー定義 ===
  user: Record<string, number> = {}
  
  // === オブジェクトごとの独立変数 ===
  self: {
    frame: number            // オブジェクト内フレーム
    time: number             // オブジェクト内時間
    duration: number         // オブジェクトの長さ
    index: number            // オブジェクトインデックス
  }
}
```

### 4.2 スクリプトパーサー

```typescript
// engine/script/parser.ts

interface ScriptAST {
  type: 'assignment' | 'if' | 'loop' | 'expression' | 'functionCall'
  // ...
}

class AviUtlScriptParser {
  parse(source: string): ScriptAST[] {
    // トークナイズ → AST構築
    // 対応構文:
    // - 代入: x = 100
    // - 条件: if (frame > 100) { ... }
    // - 関数: sqrt(), abs(), sin(), cos(), tan()
    // - 乱数: rnd(min, max)
    // - 時間: frame, time
  }
}
```

### 4.3 スクリプトランナー

```typescript
// engine/script/runner.ts

class AviUtlScriptRunner {
  private parser = new AviUtlScriptParser()
  private state = new AviUtlScriptState()
  
  /** スクリプトを1フレーム分実行 */
  execute(script: string, frameState: Partial<AviUtlScriptState>): AviUtlScriptState {
    // 状態更新
    Object.assign(this.state, frameState)
    this.state.self.frame = frameState.frame ?? 0
    
    // スクリプト解析
    const ast = this.parser.parse(script)
    
    // AST実行
    for (const node of ast) {
      this.evaluate(node)
    }
    
    return { ...this.state }
  }
  
  private evaluate(node: ScriptAST): number {
    // ノードの種類に応じた実行
  }
}
```

## 5. 標準スクリプト機能

### イージング関数一覧
```typescript
enum Easing {
  Linear,
  EaseInQuad, EaseOutQuad, EaseInOutQuad,
  EaseInCubic, EaseOutCubic, EaseInOutCubic,
  EaseInQuart, EaseOutQuart, EaseInOutQuart,
  EaseInQuint, EaseOutQuint, EaseInOutQuint,
  EaseInSine, EaseOutSine, EaseInOutSine,
  EaseInExpo, EaseOutExpo, EaseInOutExpo,
  EaseInCirc, EaseOutCirc, EaseInOutCirc,
  EaseInElastic, EaseOutElastic, EaseInOutElastic,
  EaseInBack, EaseOutBack, EaseInOutBack,
  EaseInBounce, EaseOutBounce, EaseInOutBounce,
}
```

### カメラ制御機能
```typescript
interface CameraController {
  // 3D空間カメラ制御
  perspective(fov: number): void
  lookAt(x: number, y: number, z: number): void
  orbit(radius: number, theta: number, phi: number): void
  shake(intensity: number, speed: number): void
}
```

## 6. レガシープラグイン対応

### 6.1 AviUtlプラグインDLL読み込み

```typescript
// main-process/plugin-bridge.ts (Electron Main)

// Edge.js を使用してAviUtlプラグインDLLを読み込み
// → 課題: Windows x86のみ、安定性の問題
// → 代替案: プラグイン機能をネイティブTypeScriptに移植
```

**方針**: 既存AviUtlプラグインの直接実行は現実的ではないため、以下を推奨：
1. 主要なAviUtlプラグイン機能をTypeScriptで再実装
2. スクリプト（.anm/.obj）はインタープリター方式で対応
3. DLLプラグインは作者にTypeScript版を促す

### 6.2 AviUtl互換プラグイン一覧（移植目標）

| AviUtlプラグイン | 機能 | Open Yukkuri Editorでの実装方式 |
|-----------------|------|-------------------------------|
| 拡張編集 | タイムライン編集 | ✅ 独自実装済み |
| L-SMASH Works | 動画読み込み | ffmpeg.wasm + WebCodecs |
| x264guiEx | 動画出力 | ffmpeg.wasm |
| patch.aul | バグ修正・安定化 | Electronネイティブ |
| InputPipePlugin | 安定化フォーク | 不要 |
| カメラ制御 | 3Dカメラ | キーフレームシステム |
| 図形描画 | 矩形・円・多角形 | Canvas 2D + SVG |
| タイトル | テキストアニメーション | React + CSS Animation |

## 7. 実装優先順位

1. **フィルタパイプライン基盤** — エフェクトグラフに統合
2. **AviUtlスクリプトパーサー** — 基本構文の解析
3. **AviUtlスクリプトランナー** — 基本変数の制御
4. **カメラ制御** — 3D空間カメラ
5. **イージング関数ライブラリ** — 全31種類
6. **主要AviUtlエフェクト移植** — 色調補正、ぼかし等
7. **スクリプト拡張** — .anm完全互換を目指す
