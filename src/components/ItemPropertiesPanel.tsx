import React, { useState } from 'react'
import type { TimelineItem, Effect } from '../models/timeline'

interface ItemPropertiesPanelProps {
  item: TimelineItem | null
  totalFrames: number
  fps: number
  onUpdateItem: (updates: Partial<TimelineItem>) => void
  onDeleteEffect: (effectIndex: number) => void
}

type AnimationType = 'none' | 'fadeIn' | 'fadeOut' | 'slideInLeft' | 'slideInRight' | 'slideOutLeft' | 'slideOutRight' | 'zoomIn' | 'zoomOut'

const ANIMATION_OPTIONS: { value: AnimationType; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'fadeIn', label: 'フェードイン' },
  { value: 'fadeOut', label: 'フェードアウト' },
  { value: 'slideInLeft', label: '左からスライドイン' },
  { value: 'slideInRight', label: '右からスライドイン' },
  { value: 'slideOutLeft', label: '左にスライドアウト' },
  { value: 'slideOutRight', label: '右にスライドアウト' },
  { value: 'zoomIn', label: 'ズームイン' },
  { value: 'zoomOut', label: 'ズームアウト' },
]

const BUILTIN_EFFECTS = [
  { name: '色調補正', params: { brightness: 1.0, contrast: 1.0, saturation: 1.0, hue: 0 } },
  { name: 'シャドウ', params: { blur: 5, offsetX: 2, offsetY: 2, opacity: 0.5, color: '#000000' } },
  { name: 'ぼかし（ガウシアン）', params: { radius: 5 } },
  { name: 'モノクロ', params: { enabled: true } },
  { name: 'セピア', params: { intensity: 1.0 } },
  { name: 'クロマキー', params: { color: '#00ff00', threshold: 0.3, softness: 0.1 } },
  { name: 'グロー', params: { radius: 10, intensity: 0.5, threshold: 0.8 } },
  { name: 'モザイク', params: { blockSize: 10 } },
] as const

function PropertyRow({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <div className="ymm4-property-row">
      <span className="ymm4-property-label">{label}</span>
      <input
        className="ymm4-property-input"
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        min={min}
        max={max}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function EffectParamRow({
  name,
  value,
  onChange,
}: {
  name: string
  value: number | string | boolean
  onChange: (v: number | string | boolean) => void
}) {
  if (typeof value === 'boolean') {
    return (
      <div className="ymm4-property-row">
        <span className="ymm4-property-label" style={{ width: 'auto' }}>{name}</span>
        <input
          type="checkbox"
          checked={value}
          onChange={e => onChange(e.target.checked)}
          style={{ accentColor: 'var(--ymm4-accent)' }}
        />
      </div>
    )
  }
  if (typeof value === 'string') {
    return (
      <div className="ymm4-property-row">
        <span className="ymm4-property-label">{name.slice(0, 3)}</span>
        <input
          className="ymm4-property-input"
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }
  // number
  const isPercent = name.includes('ity') || name.includes('ness') || name.includes('uration') || name.includes('tensity') || name.includes('ftness')
  return (
    <div className="ymm4-property-row">
      <span className="ymm4-property-label">{name.slice(0, 3)}</span>
      <input
        className="ymm4-property-input"
        type="number"
        value={Math.round(value * 100) / 100}
        step={isPercent ? 0.01 : 1}
        min={isPercent ? 0 : undefined}
        max={isPercent ? 1 : undefined}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export default function ItemPropertiesPanel({
  item,
  totalFrames,
  fps,
  onUpdateItem,
  onDeleteEffect,
}: ItemPropertiesPanelProps) {
  const [expandedEffect, setExpandedEffect] = useState<number | null>(null)
  const [showAddEffect, setShowAddEffect] = useState(false)

  if (!item) {
    return (
      <div className="ymm4-right-panel">
        <div className="ymm4-no-selection">
          <div className="icon">🎬</div>
          <div>アイテムを選択してください</div>
          <div style={{ fontSize: 11 }}>タイムラインのクリップをクリック</div>
        </div>
      </div>
    )
  }

  const duration = item.endFrame - item.startFrame
  const durationSec = (duration / fps).toFixed(1)

  const handleAddEffect = (effectName: string) => {
    const template = BUILTIN_EFFECTS.find(e => e.name === effectName)
    if (!template) return
    const newEffect: Effect = { name: template.name, params: { ...template.params, enabled: true } }
    onUpdateItem({ effects: [...item.effects, newEffect] })
    setShowAddEffect(false)
  }

  const handleUpdateEffectParams = (effectIndex: number, params: Record<string, number | string | boolean>) => {
    onUpdateItem({
      effects: item.effects.map((e, i) => i === effectIndex ? { ...e, params } : e),
    })
  }

  return (
    <div className="ymm4-right-panel">
      {/* 基本情報 */}
      <div className="ymm4-property-section">
        <div className="ymm4-property-header">
          <span>{item.name}</span>
          <span style={{ fontSize: 10, color: 'var(--ymm4-text-muted)', fontFamily: 'Consolas, monospace' }}>
            {item.id.slice(0, 8)}
          </span>
        </div>
        <div className="ymm4-property-body">
          <div className="ymm4-property-row">
            <span className="ymm4-prop-label-wide">種別</span>
            <span style={{ fontSize: 12 }}>
              {item.type === 'video' ? '🎬 動画' : item.type === 'audio' ? '🎵 音声' : item.type === 'text' ? 'Ｔ テキスト' : '🖼 画像'}
            </span>
          </div>
          <div className="ymm4-property-row">
            <span className="ymm4-prop-label-wide">長さ</span>
            <span style={{ fontSize: 12, fontFamily: 'Consolas, monospace' }}>
              {duration}f ({durationSec}s)
            </span>
          </div>
          <div className="ymm4-property-row">
            <span className="ymm4-prop-label-wide">開始</span>
            <input
              className="ymm4-property-input"
              type="number"
              value={item.startFrame}
              style={{ width: 80 }}
              onChange={e => onUpdateItem({
                startFrame: Number(e.target.value),
                endFrame: item.endFrame + (Number(e.target.value) - item.startFrame),
              })}
            />
          </div>
          <div className="ymm4-property-row">
            <span className="ymm4-prop-label-wide">終了</span>
            <input
              className="ymm4-property-input"
              type="number"
              value={item.endFrame}
              style={{ width: 80 }}
              onChange={e => onUpdateItem({ endFrame: Number(e.target.value) })}
            />
          </div>
          <div className="ymm4-property-row">
            <span className="ymm4-prop-label-wide">レイヤー</span>
            <input
              className="ymm4-property-input"
              type="number"
              value={item.layer}
              style={{ width: 80 }}
              min={0}
              max={99}
              onChange={e => onUpdateItem({ layer: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* 登場・退場アニメーション */}
      <div className="ymm4-property-section">
        <div className="ymm4-property-header">
          <span>🎬 登場・退場</span>
        </div>
        <div className="ymm4-property-body">
          <div className="ymm4-property-row">
            <span className="ymm4-prop-label-wide">登場</span>
            <select
              className="ymm4-property-input"
              value={item.appearAnimation || 'none'}
              onChange={e => onUpdateItem({ appearAnimation: e.target.value === 'none' ? undefined : e.target.value })}
            >
              {ANIMATION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="ymm4-property-row">
            <span className="ymm4-prop-label-wide">退場</span>
            <select
              className="ymm4-property-input"
              value={item.disappearAnimation || 'none'}
              onChange={e => onUpdateItem({ disappearAnimation: e.target.value === 'none' ? undefined : e.target.value })}
            >
              {ANIMATION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 変形（位置・サイズ・回転） */}
      <div className="ymm4-property-section">
        <div className="ymm4-property-header">
          <span>📐 変形</span>
        </div>
        <div className="ymm4-property-body">
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <PropertyRow label="X" value={item.transform.x} onChange={v => onUpdateItem({ transform: { ...item.transform, x: v } })} step={1} />
            </div>
            <div style={{ flex: 1 }}>
              <PropertyRow label="Y" value={item.transform.y} onChange={v => onUpdateItem({ transform: { ...item.transform, y: v } })} step={1} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <PropertyRow label="横" value={item.transform.scaleX} onChange={v => onUpdateItem({ transform: { ...item.transform, scaleX: v } })} step={0.01} />
            </div>
            <div style={{ flex: 1 }}>
              <PropertyRow label="縦" value={item.transform.scaleY} onChange={v => onUpdateItem({ transform: { ...item.transform, scaleY: v } })} step={0.01} />
            </div>
          </div>
          <PropertyRow label="回転" value={item.transform.rotation} onChange={v => onUpdateItem({ transform: { ...item.transform, rotation: v } })} step={0.1} min={-360} max={360} />
          <PropertyRow label="不透明度" value={item.opacity} onChange={v => onUpdateItem({ opacity: Math.max(0, Math.min(1, v)) })} step={0.01} min={0} max={1} />
          <PropertyRow label="音量" value={item.volume} onChange={v => onUpdateItem({ volume: Math.max(0, Math.min(2, v)) })} step={0.01} min={0} max={2} />
        </div>
      </div>

      {/* エフェクト */}
      <div className="ymm4-property-section" style={{ flex: 1, overflow: 'auto' }}>
        <div className="ymm4-property-header">
          <span>✨ エフェクト</span>
          <span style={{ fontSize: 10, color: 'var(--ymm4-text-muted)' }}>
            {item.effects.length}
          </span>
        </div>
        <div className="ymm4-property-body">
          {item.effects.length === 0 && !showAddEffect && (
            <div style={{ fontSize: 11, color: 'var(--ymm4-text-muted)', padding: '4px 0' }}>
              エフェクトなし
            </div>
          )}

          {item.effects.map((effect, i) => (
            <div key={i}>
              <div
                className="ymm4-effect-item"
                onClick={() => setExpandedEffect(expandedEffect === i ? null : i)}
              >
                <span className="effect-drag">⠿</span>
                <span className="effect-name">{effect.name}</span>
                <span
                  className={`effect-toggle ${effect.params.enabled !== false ? 'on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    const newParams = { ...effect.params, enabled: effect.params.enabled === false }
                    onUpdateItem({ effects: item.effects.map((e, j) => j === i ? { ...e, params: newParams } : e) })
                  }}
                >
                  {effect.params.enabled !== false ? '●' : '○'}
                </span>
                <span
                  className="effect-delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteEffect(i)
                    if (expandedEffect === i) setExpandedEffect(null)
                  }}
                >
                  ✕
                </span>
              </div>

              {/* エフェクトパラメータ編集（展開時） */}
              {expandedEffect === i && (
                <div style={{ padding: '4px 8px 8px 24px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  {Object.entries(effect.params).filter(([k]) => k !== 'enabled').map(([key, val]) => (
                    <EffectParamRow
                      key={key}
                      name={key}
                      value={val}
                      onChange={(newVal) => {
                        const newParams = { ...effect.params, [key]: newVal }
                        handleUpdateEffectParams(i, newParams)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* エフェクト追加 */}
          {showAddEffect && (
            <div style={{ padding: '4px 0' }}>
              {BUILTIN_EFFECTS.map(ef => (
                <div
                  key={ef.name}
                  className="ymm4-effect-item"
                  onClick={() => handleAddEffect(ef.name)}
                  style={{ fontSize: 11 }}
                >
                  <span style={{ color: 'var(--ymm4-green)', marginRight: 4 }}>＋</span>
                  {ef.name}
                </div>
              ))}
            </div>
          )}

          <button
            className="ymm4-toolbar-btn"
            style={{ marginTop: 4, width: '100%', justifyContent: 'center', fontSize: 11, border: '1px dashed var(--ymm4-border)' }}
            onClick={() => setShowAddEffect(prev => !prev)}
          >
            {showAddEffect ? '✕ 閉じる' : '＋ エフェクトを追加'}
          </button>
        </div>
      </div>
    </div>
  )
}
