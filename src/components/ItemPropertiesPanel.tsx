import React, { useCallback } from 'react'
import type { TimelineItem, Effect } from '../models/timeline'

interface ItemPropertiesPanelProps {
  item: TimelineItem | null
  totalFrames: number
  fps: number
  onUpdateItem: (updates: Partial<TimelineItem>) => void
  onDeleteEffect: (effectIndex: number) => void
}

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

export default function ItemPropertiesPanel({
  item,
  totalFrames,
  fps,
  onUpdateItem,
  onDeleteEffect,
}: ItemPropertiesPanelProps) {
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
            <span style={{ fontSize: 12 }}>
              {duration}f ({durationSec}s)
            </span>
          </div>
          <div className="ymm4-property-row">
            <span className="ymm4-prop-label-wide">開始</span>
            <span style={{ fontSize: 12, fontFamily: 'Consolas, monospace' }}>
              {item.startFrame}f
            </span>
          </div>
          <div className="ymm4-property-row">
            <span className="ymm4-prop-label-wide">レイヤー</span>
            <span style={{ fontSize: 12 }}>{item.layer}</span>
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
              <PropertyRow
                label="X"
                value={item.transform.x}
                onChange={v => onUpdateItem({ transform: { ...item.transform, x: v } })}
                step={1}
              />
            </div>
            <div style={{ flex: 1 }}>
              <PropertyRow
                label="Y"
                value={item.transform.y}
                onChange={v => onUpdateItem({ transform: { ...item.transform, y: v } })}
                step={1}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <PropertyRow
                label="横"
                value={item.transform.scaleX}
                onChange={v => onUpdateItem({ transform: { ...item.transform, scaleX: v } })}
                step={0.01}
              />
            </div>
            <div style={{ flex: 1 }}>
              <PropertyRow
                label="縦"
                value={item.transform.scaleY}
                onChange={v => onUpdateItem({ transform: { ...item.transform, scaleY: v } })}
                step={0.01}
              />
            </div>
          </div>
          <PropertyRow
            label="回転"
            value={item.transform.rotation}
            onChange={v => onUpdateItem({ transform: { ...item.transform, rotation: v } })}
            step={0.1}
            min={-360}
            max={360}
          />
          <PropertyRow
            label="不透明度"
            value={item.opacity}
            onChange={v => onUpdateItem({ opacity: Math.max(0, Math.min(1, v)) })}
            step={0.01}
            min={0}
            max={1}
          />
          <PropertyRow
            label="音量"
            value={item.volume}
            onChange={v => onUpdateItem({ volume: Math.max(0, Math.min(2, v)) })}
            step={0.01}
            min={0}
            max={2}
          />
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
          {item.effects.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--ymm4-text-muted)', padding: '4px 0' }}>
              エフェクトなし
            </div>
          )}
          {item.effects.map((effect, i) => (
            <div key={i} className="ymm4-effect-item">
              <span className="effect-drag">⠿</span>
              <span className="effect-name">{effect.name}</span>
              <span
                className={`effect-toggle ${effect.params.enabled !== false ? 'on' : ''}`}
                onClick={() => {
                  const newParams = { ...effect.params, enabled: effect.params.enabled === false }
                  onUpdateItem({
                    effects: item.effects.map((e, j) => j === i ? { ...e, params: newParams } : e),
                  })
                }}
              >
                {effect.params.enabled !== false ? '●' : '○'}
              </span>
              <span className="effect-delete" onClick={() => onDeleteEffect(i)}>✕</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
