---
name: open-yukkuri-editor
description: >
  AI-powered video editing with Open Yukkuri Editor — Create, edit, and export
  YMM4-compatible videos using voice synthesis (VOICEVOX), effects, and timeline editing.
---

# Open Yukkuri Editor — AI Video Creation Skill

あなたは Open Yukkuri Editor を使って動画を作成できます。このスキルはMCPサーバーを通じて動画編集機能を提供します。

## 前提条件

1. **MCPサーバーが起動していること**
   ```bash
   cd open-yukkuri-editor && npm run build:mcp && node mcp-server/dist/index.js
   ```
2. **VOICEVOX（オプション）**: 音声合成には http://localhost:50021 が必要

## 使い方の流れ

### 1. プロジェクト作成
```json
{
  "tool": "create_project",
  "args": {
    "name": "マイ動画",
    "duration_seconds": 60
  }
}
```

### 2. トラック追加（動画・音声・テキスト）
```json
{
  "tool": "add_track",
  "args": { "type": "audio", "name": "ナレーション" }
}
```

### 3. 音声＋字幕の一括追加（最も便利）
```json
{
  "tool": "add_voice_clip",
  "args": {
    "text": "こんにちは、ゆっくりしていってね！",
    "track_index_audio": 1,
    "track_index_text": 2,
    "start_frame": 0,
    "speaker": 3
  }
}
```

### 4. エフェクト適用
```json
{
  "tool": "apply_effect",
  "args": {
    "track_index": 0,
    "item_index": 0,
    "effect_name": "brightness-contrast",
    "params": "{\"brightness\":20,\"contrast\":15}"
  }
}
```

### 5. 確認と出力
```json
{ "tool": "preview", "args": {} }
{ "tool": "export_project", "args": { "format": "ymmp" } }
```

## おすすめの動画作成フロー

1. **create_project** — プロジェクト作成（16:9, 30fps）
2. **add_track** — 動画トラック・音声トラック・テキストトラックを追加
3. **add_voice_clip** — 台本を1行ずつ追加（これだけで音声＋字幕が自動生成）
4. **add_clip** — BGMや画像を背景トラックに追加
5. **apply_effect** — 色調補正やぼかしで演出
6. **preview** — プロジェクトの状態確認
7. **export_project** — .ymmp形式で出力（YMM4で開ける）

## 注意事項

- VOICEVOXが起動していない場合、`synthesize_voice` / `add_voice_clip` はエラーを返しますが、テキストのみの編集は可能です
- 話者ID: 3=ずんだもん, 1=四国めたん, 2=春日部つむぎ など
- .ymmp形式はYMM4（ゆっくりMovieMaker4）で直接読み込めます
