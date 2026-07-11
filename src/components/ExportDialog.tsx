import React, { useState } from 'react'

interface ExportDialogProps {
  open: boolean
  width: number
  height: number
  fps: number
  totalFrames: number
  onClose: () => void
  onExport: (settings: ExportSettings) => void
}

export interface ExportSettings {
  format: 'mp4' | 'avi' | 'gif'
  width: number
  height: number
  fps: number
  quality: number
}

export default function ExportDialog({ open, width, height, fps, totalFrames, onClose, onExport }: ExportDialogProps) {
  const [format, setFormat] = useState<'mp4' | 'avi' | 'gif'>('mp4')
  const [outWidth, setOutWidth] = useState(width)
  const [outHeight, setOutHeight] = useState(height)
  const [outFps, setOutFps] = useState(fps)
  const [quality, setQuality] = useState(80)

  if (!open) return null

  const duration = (totalFrames / fps).toFixed(1)

  return (
    <div className="ymm4-settings-overlay" onClick={onClose}>
      <div className="ymm4-settings-dialog" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="ymm4-settings-header">
          <span>📹 書き出し</span>
          <button className="ymm4-settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="ymm4-settings-content" style={{ padding: 16, maxHeight: 400, overflowY: 'auto' }}>
          <div className="ymm4-settings-field">
            <label className="ymm4-settings-label">出力形式</label>
            <select className="ymm4-settings-select" value={format} onChange={e => setFormat(e.target.value as any)}>
              <option value="mp4">MP4 （推奨）</option>
              <option value="avi">AVI</option>
              <option value="gif">GIF</option>
            </select>
          </div>

          <div className="ymm4-settings-field">
            <label className="ymm4-settings-label">解像度</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="ymm4-settings-input" type="number" value={outWidth} style={{ width: 80 }} onChange={e => setOutWidth(Number(e.target.value))} />
              <span style={{ color: 'var(--ymm4-text-muted)' }}>×</span>
              <input className="ymm4-settings-input" type="number" value={outHeight} style={{ width: 80 }} onChange={e => setOutHeight(Number(e.target.value))} />
            </div>
          </div>

          <div className="ymm4-settings-field">
            <label className="ymm4-settings-label">フレームレート</label>
            <select className="ymm4-settings-select" value={outFps} onChange={e => setOutFps(Number(e.target.value))}>
              <option value={24}>24 FPS</option>
              <option value={30}>30 FPS</option>
              <option value={60}>60 FPS</option>
            </select>
          </div>

          <div className="ymm4-settings-field">
            <label className="ymm4-settings-label">品質</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="range" min={10} max={100} value={quality} onChange={e => setQuality(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontFamily: 'Consolas, monospace', color: 'var(--ymm4-text-secondary)', minWidth: 40 }}>{quality}%</span>
            </div>
          </div>

          <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--ymm4-text-muted)', borderTop: '1px solid var(--ymm4-border)', marginTop: 8 }}>
            <div>長さ: {duration}秒 / {totalFrames}フレーム</div>
            <div style={{ marginTop: 4 }}>出力サイズ目安: 約 {(totalFrames / outFps * 2).toFixed(0)} MB（推定）</div>
          </div>
        </div>

        <div className="ymm4-settings-footer">
          <button className="ymm4-settings-btn" onClick={onClose}>キャンセル</button>
          <button className="ymm4-settings-btn primary" onClick={() => { onExport({ format, width: outWidth, height: outHeight, fps: outFps, quality }); onClose() }}>
            書き出し
          </button>
        </div>
      </div>
    </div>
  )
}
