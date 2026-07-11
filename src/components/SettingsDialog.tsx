import React, { useState } from 'react'
import type { ProjectSettings } from '../models/timeline'

type SettingsTab = 'project' | 'display' | 'shortcuts'

interface SettingsDialogProps {
  open: boolean
  settings: ProjectSettings
  onSave: (settings: ProjectSettings) => void
  onClose: () => void
}

const shortcutList = [
  { label: '再生/一時停止', key: 'Space' },
  { label: '先頭に移動', key: 'Home' },
  { label: '末尾に移動', key: 'End' },
  { label: '1フレーム進む', key: '→' },
  { label: '1フレーム戻る', key: '←' },
  { label: '10フレーム進む', key: 'Shift + →' },
  { label: '10フレーム戻る', key: 'Shift + ←' },
  { label: '元に戻す', key: 'Ctrl + Z' },
  { label: 'やり直し', key: 'Ctrl + Y / Ctrl + Shift + Z' },
  { label: 'コピー', key: 'Ctrl + C' },
  { label: '切り取り', key: 'Ctrl + X' },
  { label: '貼り付け', key: 'Ctrl + V' },
  { label: '複製', key: 'Ctrl + D' },
  { label: '削除', key: 'Delete / Backspace' },
  { label: 'リップル削除', key: 'Shift + Delete' },
  { label: '分割', key: 'S' },
  { label: 'マーカー追加/削除', key: 'M' },
  { label: '前のマーカー', key: ',' },
  { label: '次のマーカー', key: '.' },
  { label: 'スナップ切替', key: 'N' },
  { label: '前のクリップ', key: '[' },
  { label: '次のクリップ', key: ']' },
  { label: '1秒戻る', key: 'PageUp' },
  { label: '1秒進む', key: 'PageDown' },
]

export default function SettingsDialog({ open, settings, onSave, onClose }: SettingsDialogProps) {
  const [tab, setTab] = useState<SettingsTab>('project')
  const [localSettings, setLocalSettings] = useState(settings)

  if (!open) return null

  const handleChange = (key: keyof ProjectSettings, value: number | string) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="ymm4-settings-overlay" onClick={onClose}>
      <div className="ymm4-settings-dialog" onClick={e => e.stopPropagation()}>
        <div className="ymm4-settings-header">
          <span>設定</span>
          <button className="ymm4-settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="ymm4-settings-body">
          <div className="ymm4-settings-sidebar">
            {(['project', 'display', 'shortcuts'] as SettingsTab[]).map(t => (
              <div
                key={t}
                className={`ymm4-settings-tab-btn ${tab === t ? 'active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'project' ? '📄 プロジェクト' : t === 'display' ? '🖥 表示' : '⌨ ショートカット'}
              </div>
            ))}
          </div>

          <div className="ymm4-settings-content">
            {tab === 'project' && (
              <div>
                <h3 style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>プロジェクト設定</h3>

                <div className="ymm4-settings-field">
                  <label className="ymm4-settings-label">解像度</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      className="ymm4-settings-input"
                      style={{ width: 80 }}
                      type="number"
                      value={localSettings.width}
                      onChange={e => handleChange('width', Number(e.target.value))}
                    />
                    <span style={{ color: 'var(--ymm4-text-muted)' }}>×</span>
                    <input
                      className="ymm4-settings-input"
                      style={{ width: 80 }}
                      type="number"
                      value={localSettings.height}
                      onChange={e => handleChange('height', Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="ymm4-settings-field">
                  <label className="ymm4-settings-label">フレームレート (FPS)</label>
                  <select
                    className="ymm4-settings-select"
                    value={localSettings.fps}
                    onChange={e => handleChange('fps', Number(e.target.value))}
                  >
                    <option value={24}>24 FPS</option>
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                    <option value={120}>120 FPS</option>
                  </select>
                </div>

                <div className="ymm4-settings-field">
                  <label className="ymm4-settings-label">総フレーム数</label>
                  <input
                    className="ymm4-settings-input"
                    type="number"
                    value={localSettings.totalFrames}
                    onChange={e => handleChange('totalFrames', Number(e.target.value))}
                  />
                </div>

                <div className="ymm4-settings-field">
                  <label className="ymm4-settings-label">サンプリングレート</label>
                  <select
                    className="ymm4-settings-select"
                    value={localSettings.audioSamplingRate}
                    onChange={e => handleChange('audioSamplingRate', Number(e.target.value))}
                  >
                    <option value={22050}>22050 Hz</option>
                    <option value={44100}>44100 Hz</option>
                    <option value={48000}>48000 Hz</option>
                  </select>
                </div>

                <div className="ymm4-settings-field">
                  <label className="ymm4-settings-label">背景色</label>
                  <input
                    className="ymm4-settings-input"
                    type="text"
                    value={localSettings.backgroundColor}
                    onChange={e => handleChange('backgroundColor', e.target.value)}
                    style={{ width: 100 }}
                  />
                </div>
              </div>
            )}

            {tab === 'display' && (
              <div>
                <h3 style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>表示設定</h3>
                <div style={{ fontSize: 12, color: 'var(--ymm4-text-muted)' }}>
                  表示設定は準備中です。
                </div>
              </div>
            )}

            {tab === 'shortcuts' && (
              <div>
                <h3 style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>ショートカットキー</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {shortcutList.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '3px 8px',
                        fontSize: 12,
                        borderRadius: 2,
                      }}
                    >
                      <span style={{ color: 'var(--ymm4-text)' }}>{s.label}</span>
                      <span
                        style={{
                          color: 'var(--ymm4-text-muted)',
                          fontFamily: 'Consolas, monospace',
                          fontSize: 11,
                          background: 'var(--ymm4-bg-alt)',
                          padding: '1px 6px',
                          borderRadius: 2,
                        }}
                      >
                        {s.key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ymm4-settings-footer">
          <button className="ymm4-settings-btn" onClick={onClose}>キャンセル</button>
          <button
            className="ymm4-settings-btn primary"
            onClick={() => {
              onSave(localSettings)
              onClose()
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
