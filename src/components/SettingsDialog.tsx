import React, { useState, useEffect } from 'react'
import type { ProjectSettings } from '../models/timeline'

type SettingsTab = 'project' | 'display' | 'shortcuts' | 'presets'

interface SettingsDialogProps {
  open: boolean
  settings: ProjectSettings
  onSave: (settings: ProjectSettings) => void
  onClose: () => void
}

interface ShortcutEntry {
  action: string
  label: string
  defaultKey: string
  customKey: string
}

// localStorage keys
const STORAGE_KEY_SHORTCUTS = 'oye_shortcuts'
const STORAGE_KEY_PRESETS = 'oye_presets'

function loadShortcuts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SHORTCUTS)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveShortcuts(map: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY_SHORTCUTS, JSON.stringify(map))
}

interface PresetItem {
  name: string
  settings: ProjectSettings
}

function loadPresets(): PresetItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRESETS)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function savePresets(presets: PresetItem[]) {
  localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets))
}

const DEFAULT_SHORTCUTS: ShortcutEntry[] = [
  { action: 'save', label: '保存', defaultKey: 'Ctrl+S', customKey: '' },
  { action: 'undo', label: '元に戻す', defaultKey: 'Ctrl+Z', customKey: '' },
  { action: 'redo', label: 'やり直し', defaultKey: 'Ctrl+Y', customKey: '' },
  { action: 'copy', label: 'コピー', defaultKey: 'Ctrl+C', customKey: '' },
  { action: 'cut', label: '切り取り', defaultKey: 'Ctrl+X', customKey: '' },
  { action: 'paste', label: '貼り付け', defaultKey: 'Ctrl+V', customKey: '' },
  { action: 'duplicate', label: '複製', defaultKey: 'Ctrl+D', customKey: '' },
  { action: 'delete', label: '削除', defaultKey: 'Delete', customKey: '' },
  { action: 'rippleDelete', label: 'リップル削除', defaultKey: 'Shift+Delete', customKey: '' },
  { action: 'split', label: '分割', defaultKey: 'S', customKey: '' },
  { action: 'playPause', label: '再生/一時停止', defaultKey: 'Space', customKey: '' },
  { action: 'toggleMarker', label: 'マーカー追加/削除', defaultKey: 'M', customKey: '' },
  { action: 'prevMarker', label: '前のマーカー', defaultKey: ',', customKey: '' },
  { action: 'nextMarker', label: '次のマーカー', defaultKey: '.', customKey: '' },
  { action: 'toggleSnap', label: 'スナップ切替', defaultKey: 'N', customKey: '' },
  { action: 'prevClip', label: '前のクリップ', defaultKey: '[', customKey: '' },
  { action: 'nextClip', label: '次のクリップ', defaultKey: ']', customKey: '' },
  { action: 'home', label: '先頭に移動', defaultKey: 'Home', customKey: '' },
  { action: 'end', label: '末尾に移動', defaultKey: 'End', customKey: '' },
  { action: 'group', label: 'グループ化', defaultKey: 'Ctrl+G', customKey: '' },
  { action: 'ungroup', label: 'グループ解除', defaultKey: 'Ctrl+Shift+G', customKey: '' },
]

const PRESET_NAMES = [
  { name: 'FHD 30fps (5分)', width: 1920, height: 1080, fps: 30, totalFrames: 9000, audioSamplingRate: 48000, backgroundColor: '#1a1a2e' },
  { name: 'FHD 60fps (5分)', width: 1920, height: 1080, fps: 60, totalFrames: 18000, audioSamplingRate: 48000, backgroundColor: '#1a1a2e' },
  { name: '4K 30fps (5分)', width: 3840, height: 2160, fps: 30, totalFrames: 9000, audioSamplingRate: 48000, backgroundColor: '#1a1a2e' },
  { name: 'HD 30fps (3分)', width: 1280, height: 720, fps: 30, totalFrames: 5400, audioSamplingRate: 44100, backgroundColor: '#1a1a2e' },
  { name: '縦長 9:16 30fps', width: 1080, height: 1920, fps: 30, totalFrames: 9000, audioSamplingRate: 48000, backgroundColor: '#1a1a2e' },
]

export default function SettingsDialog({ open, settings, onSave, onClose }: SettingsDialogProps) {
  const [tab, setTab] = useState<SettingsTab>('project')
  const [localSettings, setLocalSettings] = useState(settings)
  const [shortcuts, setShortcuts] = useState<ShortcutEntry[]>(() => {
    const custom = loadShortcuts()
    return DEFAULT_SHORTCUTS.map(s => ({ ...s, customKey: custom[s.action] || '' }))
  })
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null)
  const [presets, setPresets] = useState<PresetItem[]>(loadPresets)
  const [presetName, setPresetName] = useState('')
  const [presetMsg, setPresetMsg] = useState('')

  useEffect(() => { setLocalSettings(settings) }, [settings])

  if (!open) return null

  const handleChange = (key: keyof ProjectSettings, value: number | string) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSaveSettings = () => {
    onSave(localSettings)
    const shortcutMap: Record<string, string> = {}
    shortcuts.forEach(s => { if (s.customKey) shortcutMap[s.action] = s.customKey })
    saveShortcuts(shortcutMap)
    onClose()
  }

  // Capture key combo for shortcut editing
  const handleShortcutKeyDown = (e: React.KeyboardEvent, action: string) => {
    e.preventDefault()
    e.stopPropagation()
    const key = e.key
    // Enter = 確定 (現状維持), Escape = キャンセル
    if (key === 'Enter' || key === 'Escape') {
      setEditingShortcut(null)
      return
    }
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')
    const cleanKey = key.length === 1 ? key.toUpperCase() : key === ' ' ? 'Space' : key
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      parts.push(cleanKey)
      setShortcuts(prev => prev.map(s => s.action === action ? { ...s, customKey: parts.join('+') } : s))
      setEditingShortcut(null)
    }
  }

  const applyPreset = (preset: { width: number; height: number; fps: number; totalFrames: number; audioSamplingRate: number; backgroundColor: string }) => {
    setLocalSettings(prev => ({ ...prev, ...preset }))
  }

  const saveCurrentAsPreset = () => {
    if (!presetName.trim()) return
    const newPreset: PresetItem = { name: presetName.trim(), settings: { ...localSettings } }
    const updated = [...presets, newPreset]
    setPresets(updated)
    savePresets(updated)
    setPresetName('')
    setPresetMsg('プリセットを保存しました')
    setTimeout(() => setPresetMsg(''), 2000)
  }

  const deletePreset = (index: number) => {
    const updated = presets.filter((_, i) => i !== index)
    setPresets(updated)
    savePresets(updated)
  }

  return (
    <div className="ymm4-settings-overlay" onClick={onClose}>
      <div className="ymm4-settings-dialog" onClick={e => e.stopPropagation()} style={{ width: 700, maxHeight: '85vh' }}>
        <div className="ymm4-settings-header">
          <span>設定</span>
          <button className="ymm4-settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="ymm4-settings-body">
          <div className="ymm4-settings-sidebar">
            {(['project', 'display', 'shortcuts', 'presets'] as SettingsTab[]).map(t => (
              <div
                key={t}
                className={`ymm4-settings-tab-btn ${tab === t ? 'active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'project' ? '📄 プロジェクト' : t === 'display' ? '🖥 表示' : t === 'shortcuts' ? '⌨ ショートカット' : '💾 プリセット'}
              </div>
            ))}
          </div>

          <div className="ymm4-settings-content" style={{ overflow: 'auto' }}>
            {tab === 'project' && (
              <div>
                <h3 style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>プロジェクト設定</h3>

                <div className="ymm4-settings-field">
                  <label className="ymm4-settings-label">プリセットから選択</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {PRESET_NAMES.map(p => (
                      <button
                        key={p.name}
                        className="ymm4-toolbar-btn"
                        style={{ fontSize: 10, padding: '2px 8px' }}
                        onClick={() => applyPreset(p)}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

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
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={localSettings.backgroundColor}
                      onChange={e => handleChange('backgroundColor', e.target.value)}
                      style={{ width: 40, height: 28, padding: 0, border: 'none', cursor: 'pointer' }}
                    />
                    <input
                      className="ymm4-settings-input"
                      type="text"
                      value={localSettings.backgroundColor}
                      onChange={e => handleChange('backgroundColor', e.target.value)}
                      style={{ width: 100 }}
                    />
                  </div>
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
                <p style={{ fontSize: 11, color: 'var(--ymm4-text-muted)', marginBottom: 12 }}>
                  キーをクリックして編集、Enterで確定、Escでキャンセル
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {shortcuts.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '3px 8px',
                        fontSize: 12,
                        borderRadius: 2,
                        background: editingShortcut === s.action ? 'rgba(204,120,92,0.1)' : 'transparent',
                      }}
                    >
                      <span style={{ color: 'var(--ymm4-text)' }}>{s.label}</span>
                      {editingShortcut === s.action ? (
                        <input
                          autoFocus
                          className="ymm4-settings-input"
                          style={{ width: 140, fontSize: 11, fontFamily: 'Consolas, monospace' }}
                          placeholder="キーを押してください..."
                          value=""
                          onKeyDown={(e) => handleShortcutKeyDown(e, s.action)}
                          onBlur={() => setEditingShortcut(null)}
                        />
                      ) : (
                        <span
                          style={{
                            color: 'var(--ymm4-text-muted)',
                            fontFamily: 'Consolas, monospace',
                            fontSize: 11,
                            background: 'var(--ymm4-bg-alt)',
                            padding: '1px 6px',
                            borderRadius: 2,
                            cursor: 'pointer',
                            minWidth: 100,
                            textAlign: 'center',
                          }}
                          onClick={() => setEditingShortcut(s.action)}
                        >
                          {s.customKey || s.defaultKey}
                          {s.customKey && (
                            <span
                              style={{ marginLeft: 6, fontSize: 9, color: '#e57373', cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                setShortcuts(prev => prev.map(x => x.action === s.action ? { ...x, customKey: '' } : x))
                              }}
                            >
                              ✕
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'presets' && (
              <div>
                <h3 style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>プリセット管理</h3>

                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <input
                    className="ymm4-settings-input"
                    style={{ flex: 1 }}
                    type="text"
                    placeholder="プリセット名を入力..."
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                  />
                  <button
                    className="ymm4-settings-btn primary"
                    onClick={saveCurrentAsPreset}
                    disabled={!presetName.trim()}
                  >
                    現在の設定を保存
                  </button>
                </div>
                {presetMsg && (
                  <div style={{ fontSize: 11, color: 'var(--ymm4-green)', marginBottom: 8 }}>{presetMsg}</div>
                )}

                <div style={{ fontSize: 11, color: 'var(--ymm4-text-muted)', marginBottom: 8 }}>
                  保存済みプリセット: {presets.length}件
                </div>

                {presets.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ymm4-text-muted)', padding: 16, textAlign: 'center' }}>
                    保存されたプリセットはありません。現在のプロジェクト設定を名前を付けて保存できます。
                  </div>
                )}

                {presets.map((preset, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      fontSize: 12,
                      borderRadius: 2,
                      marginBottom: 2,
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>{preset.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--ymm4-text-muted)', marginLeft: 8 }}>
                        {preset.settings.width}×{preset.settings.height} / {preset.settings.fps}fps / {preset.settings.totalFrames}f
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="ymm4-toolbar-btn"
                        style={{ fontSize: 10, padding: '2px 6px' }}
                        onClick={() => setLocalSettings({ ...preset.settings })}
                      >
                        適用
                      </button>
                      <button
                        className="ymm4-toolbar-btn"
                        style={{ fontSize: 10, padding: '2px 6px', color: '#e57373' }}
                        onClick={() => deletePreset(i)}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ymm4-settings-footer">
          <button className="ymm4-settings-btn" onClick={onClose}>キャンセル</button>
          <button
            className="ymm4-settings-btn primary"
            onClick={handleSaveSettings}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
