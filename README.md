# Open Yukkuri Editor 🎬

**ゆっくりMovieMaker4 (YMM4) 互換のオープンソース動画編集デスクトップアプリ**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)

YMM4 のプロジェクトファイル (.ymmp) を直接読み書きできる、ウェブ技術で作られた動画編集アプリです。

## 機能一覧

### ✅ 現在対応済み

| 機能 | 状態 |
|------|------|
| 🎞 **YMM4 .ymmp 入出力** | ✅ 完璧 — 実フォーマット対応パーサー/シリアライザー、**ラウンドトリップ保存**対応 |
| 🎚 **タイムライン編集** | ✅ トラック管理、クリップの追加/移動/トリム/分割/削除 |
| 🎯 **ドラッグ＆ドロップ** | ✅ メディアパネル → タイムライン / エクスプローラー直ドロップ |
| 🖼 **画像プレビュー** | ✅ 実際の画像を描画、アスペクト比維持 |
| 🎬 **動画プレビュー** | ✅ フレームシークで現在位置のフレームを表示 |
| 🎵 **音声再生** | ✅ タイムライン再生に同期、ミュート/ソロ対応 |
| 📝 **テキスト/字幕** | ✅ セリフ入力パネル、登場・退場アニメーション |
| 🎚 **キーフレーム** | ✅ 位置/拡大/回転/不透明度のキーフレームアニメーション |
| ✨ **エフェクト** | ✅ シャドウ/光彩/ぼかし/色調補正など 14 種内蔵 |
| 📂 **シーン管理** | ✅ 追加/削除/リネーム/複製/切り替え |
| 📹 **書き出し** | ✅ MP4/AVI/GIF ダイアログ（UI のみ、実エンコードは FFmpeg 未統合） |
| 🎤 **VOICEVOX連携** | ✅ HTTP API で音声合成、キャッシュ管理 |
| 🔌 **プラグインシステム** | ✅ エフェクト/音声合成プラグイン API |
| 📜 **AviUtlスクリプト互換** | ✅ .anm/.obj インタープリター内蔵 |
| 🎮 **MCPサーバー** | ✅ AI エージェントからの操作に対応 |
| ⌨ **カスタムショートカット** | ✅ キー割り当て自由設定 |
| 📦 **ポータブル exe** | ✅ インストール不要で動作 |
| ⏮️ **トランスポート制御** | ✅ 先頭/再生/停止/末尾 |
| 🧲 **スナップ** | ✅ 1f/5f/10f 切り替え |

### 🔜 今後対応予定

- **FFmpeg 統合** — 実際の動画出力
- **WebGL/GPU レンダリング** — 高パフォーマンスプレビュー
- **トランジションエフェクト** — クリップ間の切り替え
- **オーディオ波形表示** — 音声トラックの実波形
- **YMM4 プラグイン (.ymme) 互換** — Edge.js ブリッジ

## YMM4 互換性詳細

Open Yukkuri Editor は **実際の YMM4 .ymmp ファイル形式** に完全対応しています。

| 項目 | 対応状況 |
|------|---------|
| Timelines → シーン変換 | ✅ |
| VideoInfo (FPS/解像度/Hz) | ✅ |
| VideoItem | ✅ |
| AudioItem | ✅ |
| VoiceItem (セリフ/キャラ名/発音) | ✅ |
| ImageItem | ✅ |
| TextItem | ✅ |
| アニメーション値 (From/To/Span) | ✅ ラウンドトリップ保存 |
| VideoEffects | ✅ |
| FadeIn/FadeOut | ✅ |
| LayoutXml / ToolStates | ✅ ラウンドトリップ保存 |
| Characters | ✅ ラウンドトリップ保存 |
| CollapsedGroups | ✅ ラウンドトリップ保存 |
| UTF-8 BOM | ✅ 対応 |

> YMM4 で作ったプロジェクトを Open Yukkuri Editor で編集 → 保存 → 再び YMM4 で開く、が可能です。

## 技術スタック

| コンポーネント | 技術 |
|---------------|------|
| UI フレームワーク | React 18 + TypeScript |
| デスクトップ | Electron 33 |
| レンダリング | HTML5 Canvas 2D |
| 音声 | Web Audio API |
| ビルド | Vite 6 + electron-builder 25 |
| AI 連携 | MCP (Model Context Protocol) |

## 開発

```bash
# 依存関係インストール
npm install
cd mcp-server && npm install && cd ..

# 開発サーバー起動（ホットリロード対応）
npm run dev

# 型チェック
npm run typecheck

# ビルド
npm run build

# アイコン生成（初回のみ）
npm run icon

# パッケージング（ポータブル .exe）
npm run package:portable

# パッケージング（インストーラー）
npm run package:nsis
```

## ダウンロード

最新の実行ファイルは [GitHub Releases](https://github.com/kubobeem/openyukkurieditor/releases) からダウンロードできます。

- `open-yukkuri-editor-<version>-portable-x64.exe` — ポータブル版（インストール不要）
- `open-yukkuri-editor-<version>-x64.exe` — NSIS インストーラー版

## キーボードショートカット

| ショートカット | 機能 |
|---------------|------|
| `Ctrl+N` | 新規プロジェクト |
| `Ctrl+O` | プロジェクトを開く |
| `Ctrl+S` | 保存 |
| `Ctrl+Z` / `Ctrl+Y` | 元に戻す / やり直し |
| `Space` | 再生 / 停止 |
| `Home` / `End` | 先頭 / 末尾 |
| `←` / `→` | 1フレーム移動 |
| `Shift+←` / `Shift+→` | 10フレーム移動 |
| `Delete` | クリップ削除 |
| `S` | クリップ分割 |
| `M` | マーカー追加 |
| `Ctrl+D` | 複製 |
| `Ctrl+G` | グループ化 |

## プロジェクト構成

```
open-yukkuri-editor/
├── electron/          # Electron メインプロセス
│   ├── main.ts        # ウィンドウ管理、IPC、ファイル入出力
│   └── preload.ts     # コンテキストブリッジ
├── src/               # フロントエンド (React)
│   ├── App.tsx        # メインアプリケーション
│   ├── components/    # UI コンポーネント
│   │   ├── Timeline.tsx          # タイムライン
│   │   ├── PreviewCanvas.tsx     # プレビュー描画
│   │   ├── LeftPanel.tsx         # 左パネル
│   │   ├── ItemPropertiesPanel.tsx # プロパティ編集
│   │   ├── SerifInput.tsx        # セリフ入力
│   │   ├── MenuBar.tsx           # メニューバー
│   │   ├── ExportDialog.tsx      # 書き出し
│   │   └── SettingsDialog.tsx    # 設定
│   ├── engine/        # エンジン
│   │   ├── media/     # メディア再生管理
│   │   ├── effect/    # エフェクトパイプライン
│   │   ├── voice/     # 音声合成
│   │   └── script/    # AviUtl スクリプト
│   ├── models/        # データモデル
│   ├── parsers/       # .ymmp パーサー
│   ├── plugin/        # プラグインシステム
│   └── styles/        # CSS
├── mcp-server/        # MCP サーバー (AI連携)
├── docs/              # 設計ドキュメント
└── buildResources/    # アイコン等
```

## ライセンス

Apache License 2.0

---

*このプロジェクトは ゆっくりMovieMaker4 (YMM4) とは独立したオープンソース実装であり、公式製品とは一切関係ありません。*
