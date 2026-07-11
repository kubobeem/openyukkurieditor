# エフェクト・フィルターシステム設計書

## 1. 概要

YMM4およびAviUtlのエフェクトシステムを統合した、プラグイン可能なエフェクトグラフを設計します。

## 2. エフェクトグラフアーキテクチャ

```
クリップ
  │
  ▼
Effect Chain (各クリップに適用)
  ├── VideoEffect[]    ───→ 映像処理
  └── AudioEffect[]    ───→ 音声処理
  
トランジション（シーン間/クリップ間）
  └── TransitionEffect
  
トラックエフェクト（トラック全体に適用）
  └── TrackEffect[]
```

### エフェクトの適用順序

```
生フレーム → 色調補正 → フィルター → マスク → 変形 → 合成 → 出力
            [1]         [2]        [3]      [4]     [5]    [6]
```

## 3. 標準搭載エフェクト一覧

### 3.1 映像エフェクト

#### 色調補正系
| エフェクト名 | パラメータ | YMM4 | AviUtl |
|-------------|-----------|------|--------|
| 明るさ・コントラスト | brightness, contrast | ✅ | ✅ |
| 色相・彩度・明度 | hue, saturation, lightness | ✅ | ✅ |
| レベル補正 | inputMin, inputMax, gamma | ✅ | ✅ |
| トーンカーブ | RGB/Channel カーブ | ✅ | ✅ |
| カラーバランス | shadows, midtones, highlights | ✅ | ✅ |
| グレースケール | - | ✅ | ✅ |
| セピア | - | ✅ | ✅ |
| 色反転 | - | ✅ | ✅ |
| しきい値 | threshold | ✅ | ✅ |

#### ぼかし・シャープ系
| エフェクト名 | パラメータ | YMM4 | AviUtl |
|-------------|-----------|------|--------|
| ガウスぼかし | radius | ✅ | ✅ |
| 方向ブラー | angle, distance | ✅ | ✅ |
| 放射ブラー | centerX, centerY, amount | ✅ | ✅ |
| シャープ | amount | ✅ | ✅ |
| スムーズ | amount | ✅ | ✅ |

#### 変形系
| エフェクト名 | パラメータ | YMM4 | AviUtl |
|-------------|-----------|------|--------|
| 拡大縮小 | scaleX, scaleY | ✅ | ✅ |
| 回転 | angle | ✅ | ✅ |
| 歪み | amount | ✅ | ✅ |
| 波形 | amplitude, frequency, phase | ✅ | ✅ |
| 極座標変換 | - | ✅ | ✅ |
| パースペクティブ | topLeft, topRight, bottomLeft, bottomRight | ✅ | ✅ |

#### 合成系
| エフェクト名 | パラメータ | YMM4 | AviUtl |
|-------------|-----------|------|--------|
| アルファブレンド | mode, opacity | ✅ | ✅ |
| 加算合成 | - | ✅ | ✅ |
| 乗算合成 | - | ✅ | ✅ |
| スクリーン | - | ✅ | ✅ |
| オーバーレイ | - | ✅ | ✅ |
| 光彩 | color, radius, opacity | ✅ | ✅ |
| ドロップシャドウ | offsetX, offsetY, blur, color | ✅ | ✅ |
| 縁取り | width, color, opacity | ✅ | ✅ |

### 3.2 音声エフェクト

| エフェクト名 | パラメータ | YMM4 | AviUtl |
|-------------|-----------|------|--------|
| 音量調整 | volume | ✅ | ✅ |
| フェードイン/アウト | duration | ✅ | ✅ |
| ノイズ除去 | threshold | ✅ | ✅ |
| コンプレッサー | threshold, ratio | ✅ | ✅ |
| イコライザー | bands[] | ✅ | ✅ |
| リバーブ | roomSize, damping | ✅ | ✅ |
| ピッチシフト | semitones | ✅ | ✅ |
| ディレイ | delay, feedback | ✅ | ✅ |

### 3.3 トランジション

| トランジション | パラメータ | YMM4 | AviUtl |
|---------------|-----------|------|--------|
| フェード | duration, direction | ✅ | ✅ |
| クロスフェード | duration | ✅ | ✅ |
| ワイプ | direction, softness | ✅ | ✅ |
| スライド | direction, offset | ✅ | ✅ |
| ズーム | direction, scale | ✅ | ✅ |
| 回転 | angle, direction | ✅ | ✅ |
| マスキング | maskImage | ✅ | - |
| 3Dフリップ | axis, perspective | - | ✅ |

## 4. エフェクト処理パイプライン

```typescript
// engine/effect/pipeline.ts

interface EffectFrame {
  imageData: ImageData     // 現在のフレーム画像
  audioData: AudioBuffer   // 現在の音声
  frameNumber: number      // フレーム番号
  time: number             // 経過時間（秒）
  resolution: { width: number; height: number }
}

class EffectPipeline {
  private chain: VideoEffectPlugin[]
  
  async process(frame: EffectFrame): Promise<EffectFrame> {
    let current = frame
    
    for (const effect of this.chain) {
      if (!effect.enabled) continue
      
      // パラメータ補間（キーフレーム対応）
      const params = this.interpolateParams(effect, frame.time)
      
      // エフェクト適用
      current.imageData = await effect.process(current.imageData, params, frame.time)
    }
    
    return current
  }
  
  private interpolateParams(effect: VideoEffectPlugin, time: number): Record<string, any> {
    // キーフレームによるパラメータ補間
    // イージング関数の適用
  }
}
```

## 5. プリセットシステム

```typescript
interface EffectPreset {
  id: string
  name: string
  category: string        // "color", "blur", "distort"...
  effects: {
    pluginId: string
    params: Record<string, any>
  }[]
  thumbnail?: string      // Base64 or path
}
```

### 標準プリセット例
- 「アニメ風」: 輪郭強調 + 色調調整
- 「レトロVHS」: ノイズ + 色収差 + 走査線
- 「映画風」: レターボックス + 色温度調整
- 「ドラマチック」: コントラスト強調 + ビネット

## 6. WebGLによるGPU処理

重いエフェクトはWebGLシェーダーで処理：

```glsl
// 標準GLSLエフェクトシェーダー例（ガウスぼかし）
attribute vec2 position;
varying vec2 texCoord;

void main() {
  texCoord = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
```

```typescript
class WebGLEffectRenderer {
  private gl: WebGL2RenderingContext
  
  applyShader(effect: VideoEffectPlugin, input: WebGLTexture): WebGLTexture {
    const program = this.compileShader(effect.shaderSource!)
    // ...WebGLパイプライン処理
  }
}
```

## 7. 実装優先順位

1. **基本色調補正**（明るさ、コントラスト、彩度）— Canvas 2Dで実装
2. **ぼかし・シャープ** — Canvas 2D + WebGL
3. **変形・移動・回転** — CSS transform / Canvas 2D
4. **合成モード** — globalCompositeOperation 活用
5. **トランジション** — Canvas 2D
6. **音声エフェクト** — Web Audio API
7. **プリセット管理** — JSONベース
8. **WebGLシェーダー** — 高度なエフェクト用
