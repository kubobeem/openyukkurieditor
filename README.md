# Open Yukkuri Editor 🎬

**ゆっくりMovieMaker4 (YMM4) 互換のオープンソース動画編集デスクトップアプリ**

## 特徴

- 🎞 **YMM4 (.ymmp) 互換** — プロジェクトファイルの読み込み・保存に対応
- 🎚 **タイムラインエディター** — Canvasベースの軽快なタイムライン編集
- 📌 **トラック管理** — 動画・音声・テキストトラックの追加・編集
- 🎯 **クリップ操作** — 選択・ドラッグ移動
- ▶️ **再生プレビュー** — タイムライン上の再生・頭出し
- 📦 **ポータブルexe** — インストール不要で動作

## 技術スタック

- **フロントエンド:** React 18 + TypeScript
- **デスクトップ:** Electron
- **レンダリング:** HTML5 Canvas
- **ビルド:** Vite + electron-builder

## 開発

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# アイコン生成
npm run icon

# ビルド
npm run build

# パッケージング（ポータブルexe）
npm run package:portable
```

## ライセンス

Apache License 2.0

---

*このプロジェクトは ゆっくりMovieMaker4 (YMM4) とは独立したオープンソース実装であり、公式製品とは一切関係ありません。*
