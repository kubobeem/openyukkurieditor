import React, { useRef, useCallback, useState, useEffect } from 'react'
import type { Project, TimelineItem } from '../models/timeline'
import './Timeline.css'

interface TimelineProps {
  project: Project
  currentFrame: number
  onFrameChange: (frame: number) => void
  onAddClip: (trackIndex: number) => void
  onMoveItem: (trackIndex: number, itemId: string, newStartFrame: number) => void
  isPlaying: boolean
  snapFrames: number
  markers: number[]
  selectedItemId: string | null
  onSelectItem: (trackIndex: number, itemId: string | null) => void
  onToggleTrackMute: (trackIndex: number) => void
  onToggleTrackLock: (trackIndex: number) => void
  onToggleTrackSolo: (trackIndex: number) => void
}

const DEFAULT_SCALE = 8
const MIN_SCALE = 2
const MAX_SCALE = 40
const TRACK_HEIGHT = 48
const RULER_HEIGHT = 28
const TRACK_LIST_WIDTH = 200

/**
 * Helper: draw a rounded rectangle manually (polyfill for ctx.roundRect).
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export default function Timeline({
  project,
  currentFrame,
  onFrameChange,
  onAddClip,
  onMoveItem,
  isPlaying,
  snapFrames,
  markers,
  selectedItemId,
  onSelectItem,
  onToggleTrackMute,
  onToggleTrackLock,
  onToggleTrackSolo,
}: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rulerRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  const [scale, setScale] = useState(DEFAULT_SCALE)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [hoveredTrackIndex, setHoveredTrackIndex] = useState<number | null>(null)

  // Drag state
  const dragRef = useRef<{
    active: boolean
    itemId: string | null
    trackIndex: number
    startX: number
    startFrame: number
  }>({ active: false, itemId: null, trackIndex: -1, startX: 0, startFrame: 0 })
  const justDraggedRef = useRef(false)

  const totalWidth = project.settings.totalFrames * scale
  const totalHeight = project.tracks.length * TRACK_HEIGHT

  /** Find item under a canvas point (y is relative to the scroll container) */
  const findItemAt = useCallback(
    (canvasX: number, canvasY: number): { item: TimelineItem; trackIndex: number } | null => {
      const trackIndex = Math.floor(canvasY / TRACK_HEIGHT)
      if (trackIndex < 0 || trackIndex >= project.tracks.length) return null
      const track = project.tracks[trackIndex]
      const frameX = (canvasX + scrollLeft) / scale
      for (const item of track.items) {
        if (frameX >= item.startFrame && frameX <= item.endFrame) {
          return { item, trackIndex }
        }
      }
      return null
    },
    [project.tracks, scale, scrollLeft],
  )

  // ---- Drawing ----

  const drawRuler = useCallback(() => {
    const canvas = rulerRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = containerRef.current?.clientWidth || 800
    canvas.width = width * dpr
    canvas.height = RULER_HEIGHT * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${RULER_HEIGHT}px`
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#1f1e1b'
    ctx.fillRect(0, 0, width, RULER_HEIGHT)

    ctx.strokeStyle = '#252320'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, RULER_HEIGHT - 0.5)
    ctx.lineTo(width, RULER_HEIGHT - 0.5)
    ctx.stroke()

    const fps = project.settings.fps
    const pxPerSec = scale * fps
    let interval: number
    if (pxPerSec >= 120) interval = 1
    else if (pxPerSec >= 60) interval = 2
    else if (pxPerSec >= 30) interval = 5
    else if (pxPerSec >= 12) interval = 10
    else interval = 30

    const frameInterval = interval * fps
    const startFrame = Math.max(0, Math.floor(scrollLeft / scale / frameInterval) * frameInterval)
    const endFrame = Math.min(
      project.settings.totalFrames,
      startFrame + Math.ceil((width + scrollLeft) / scale),
    )

    ctx.font = '10px Consolas, monospace'
    ctx.fillStyle = '#9a9ab0'
    ctx.textAlign = 'center'

    for (let f = startFrame; f <= endFrame; f += 1) {
      const x = f * scale - scrollLeft
      if (x < 0 || x > width) continue
      const isSecond = f % frameInterval === 0
      const isHalf = f % (frameInterval / 2) === 0

      if (isSecond) {
        ctx.strokeStyle = '#3d3d3a'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, 16)
        ctx.lineTo(x, RULER_HEIGHT)
        ctx.stroke()
        const sec = Math.floor(f / fps)
        const min = Math.floor(sec / 60)
        const remainingSec = sec % 60
        ctx.fillText(`${min}:${remainingSec.toString().padStart(2, '0')}`, x, 12)
      } else if (isHalf) {
        ctx.strokeStyle = '#252320'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, 20)
        ctx.lineTo(x, RULER_HEIGHT)
        ctx.stroke()
      } else {
        ctx.strokeStyle = '#2a2a28'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, 24)
        ctx.lineTo(x, RULER_HEIGHT)
        ctx.stroke()
      }
    }

    // Markers on ruler
    if (markers.length > 0) {
      markers.forEach(mf => {
        const mx = mf * scale - scrollLeft
        if (mx < -4 || mx > width + 4) return
        // Small diamond marker at the top
        ctx.fillStyle = '#ffcc44'
        ctx.beginPath()
        ctx.moveTo(mx, 4)
        ctx.lineTo(mx + 4, 10)
        ctx.lineTo(mx, 16)
        ctx.lineTo(mx - 4, 10)
        ctx.closePath()
        ctx.fill()
      })
    }
  }, [project.settings.fps, project.settings.totalFrames, scale, scrollLeft, markers])

  const drawTimeline = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const container = containerRef.current
    if (!container) return

    const dpr = window.devicePixelRatio || 1
    const cw = container.clientWidth
    const ch = container.clientHeight

    // Set canvas size only when it changes to avoid flicker
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(ch * dpr)
    }
    canvas.style.width = `${cw}px`
    canvas.style.height = `${ch}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Clear
    ctx.fillStyle = '#181715'
    ctx.fillRect(0, 0, cw, ch)

    project.tracks.forEach((track, index) => {
      const y = index * TRACK_HEIGHT
      const isEven = index % 2 === 0

      ctx.fillStyle = isEven ? '#1b1a18' : '#181715'
      ctx.fillRect(0, y, cw, TRACK_HEIGHT)

      if (hoveredTrackIndex === index) {
        ctx.fillStyle = 'rgba(204, 120, 92, 0.08)'
        ctx.fillRect(0, y, cw, TRACK_HEIGHT)
      }

      ctx.strokeStyle = '#252320'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, y + TRACK_HEIGHT - 0.5)
      ctx.lineTo(cw, y + TRACK_HEIGHT - 0.5)
      ctx.stroke()

      // Locked track overlay (drawn once per track, not per clip)
      if (track.locked) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
        ctx.fillRect(0, y, cw, TRACK_HEIGHT)
      }

      // Clips
      track.items.forEach(item => {
        const isSelected = selectedItemId === item.id
        const itemX = item.startFrame * scale - scrollLeft
        const itemW = (item.endFrame - item.startFrame) * scale
        const itemY = y + 4
        const itemH = TRACK_HEIGHT - 8

        if (itemX + itemW < 0 || itemX > cw) return

        const color = item.color || '#4fc3f7'
        const radius = 4

        // Background
        roundRect(ctx, itemX, itemY, itemW, itemH, radius)
        ctx.fillStyle = color + '33'
        ctx.fill()

        // Selection glow
        if (isSelected) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2.5
        } else {
          ctx.strokeStyle = color
          ctx.lineWidth = 1.5
        }
        ctx.stroke()

        // Left edge handle
        roundRect(ctx, itemX, y + 2, 3, TRACK_HEIGHT - 4, 1)
        ctx.fillStyle = color
        ctx.fill()

        // Right edge handle
        roundRect(ctx, itemX + itemW - 3, y + 2, 3, TRACK_HEIGHT - 4, 1)
        ctx.fillStyle = color
        ctx.fill()

        // Labels
        if (itemW > 60) {
          ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif'
          ctx.fillStyle = '#e8e8f0'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          const icon = item.type === 'video' ? '🎬' : item.type === 'audio' ? '🎵' : item.type === 'text' ? 'Ｔ' : '🖼'
          const label = item.name.length > 12 ? item.name.substring(0, 11) + '…' : item.name
          ctx.fillStyle = '#faf9f5'
          ctx.fillText(`${icon} ${label}`, itemX + 8, itemY + itemH / 2)
        }

        if (itemW > 100) {
          const df = item.endFrame - item.startFrame
          const ds = (df / project.settings.fps).toFixed(1)
          ctx.font = '9px Consolas, monospace'
          ctx.fillStyle = '#a09d96'
          ctx.textAlign = 'right'
          ctx.fillText(`${df}f (${ds}s)`, itemX + itemW - 6, itemY + itemH / 2)
        }
      })
    })

    // Marker lines on timeline
    if (markers.length > 0) {
      markers.forEach(mf => {
        const mx = mf * scale - scrollLeft
        if (mx < 0 || mx > cw) return
        ctx.strokeStyle = 'rgba(255, 204, 68, 0.3)'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(mx, 0)
        ctx.lineTo(mx, ch)
        ctx.stroke()
        ctx.setLineDash([])
      })
    }

    // Playhead
    const phX = currentFrame * scale - scrollLeft
    if (phX >= 0 && phX <= cw) {
      ctx.strokeStyle = '#cc785c'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(phX, 0)
      ctx.lineTo(phX, ch)
      ctx.stroke()

      ctx.fillStyle = '#cc785c'
      ctx.beginPath()
      ctx.moveTo(phX - 5, 0)
      ctx.lineTo(phX + 5, 0)
      ctx.lineTo(phX, 6)
      ctx.closePath()
      ctx.fill()

      ctx.font = '10px Consolas, monospace'
      ctx.fillStyle = '#cc785c'
      ctx.textAlign = 'center'
      ctx.fillText(`f${currentFrame}`, phX, ch - 6)
    }
  }, [project, currentFrame, scale, scrollLeft, markers, hoveredTrackIndex, selectedItemId])

  // Redraw using requestAnimationFrame
  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      drawRuler()
      drawTimeline()
    })
  }, [drawRuler, drawTimeline])

  // Trigger redraws on state changes
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      drawRuler()
      drawTimeline()
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [drawRuler, drawTimeline])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => scheduleDraw())
    observer.observe(container)
    return () => observer.disconnect()
  }, [scheduleDraw])

  // ---- Interaction handlers ----

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft)
  }, [])

  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left + scrollLeft
      const frame = Math.max(0, Math.min(project.settings.totalFrames - 1, Math.round(x / scale)))
      onFrameChange(frame)
    },
    [scrollLeft, scale, project.settings.totalFrames, onFrameChange],
  )

  // Drag: we track current mouse position for delta calculation on commit
  const mouseXRef = useRef(0)

  const commitDrag = useCallback(() => {
    const drag = dragRef.current
    if (!drag.active || !drag.itemId) return
    drag.active = false
    justDraggedRef.current = true
    const track = project.tracks[drag.trackIndex]
    if (!track || track.locked) return

    // Calculate new position from the last known mouse position
    const deltaFrames = Math.round((mouseXRef.current - drag.startX) / scale)
    // Compute clip duration for max-bound
    const draggedItem = project.tracks[drag.trackIndex]?.items.find(i => i.id === drag.itemId)
    if (!draggedItem) return
    const itemDuration = draggedItem.endFrame - draggedItem.startFrame
    const maxStart = Math.max(0, project.settings.totalFrames - itemDuration)
    const rawStart = drag.startFrame + deltaFrames
    const snappedStart = snapFrames > 1 ? Math.round(rawStart / snapFrames) * snapFrames : rawStart
    const newStart = Math.max(0, Math.min(maxStart, snappedStart))
    if (newStart !== drag.startFrame) {
      onMoveItem(drag.trackIndex, drag.itemId, newStart)
    }
  }, [scale, snapFrames, onMoveItem, project.tracks, project.settings.totalFrames])

  // Use ref to avoid stale closure in global listener
  const commitDragRef = useRef(commitDrag)
  commitDragRef.current = commitDrag

  // Window-level mouseup to catch drag end outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      const drag = dragRef.current
      if (drag.active) {
        commitDragRef.current()
        scheduleDraw()
      }
    }
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [scheduleDraw])

  // Clear justDragged flag after a tick
  useEffect(() => {
    if (justDraggedRef.current) {
      const t = setTimeout(() => { justDraggedRef.current = false }, 0)
      return () => clearTimeout(t)
    }
  }, [project])

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      justDraggedRef.current = false
      const rect = e.currentTarget.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const hit = findItemAt(mx, my)
      if (hit) {
        onSelectItem(hit.trackIndex, hit.item.id)
        mouseXRef.current = mx
        dragRef.current = {
          active: true,
          itemId: hit.item.id,
          trackIndex: hit.trackIndex,
          startX: mx,
          startFrame: hit.item.startFrame,
        }
      } else {
        onSelectItem(0, null)
      }
    },
    [findItemAt, onSelectItem],
  )

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      // Track hover
      const ti = Math.floor(my / TRACK_HEIGHT)
      setHoveredTrackIndex(ti >= 0 && ti < project.tracks.length ? ti : null)

      // Drag handling – track mouse for final commit
      const drag = dragRef.current
      if (drag.active) {
        mouseXRef.current = mx
        scheduleDraw()
      }
    },
    [project.tracks.length, scheduleDraw],
  )

  const handleCanvasMouseUp = useCallback(() => {
    commitDrag()
  }, [commitDrag])

  const handleCanvasMouseLeave = useCallback(() => {
    setHoveredTrackIndex(null)
  }, [])

  // Single click to seek on empty space
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (justDraggedRef.current) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left + scrollLeft
      const frame = Math.max(0, Math.min(project.settings.totalFrames - 1, Math.round(x / scale)))
      onFrameChange(frame)
    },
    [scrollLeft, scale, project.settings.totalFrames, onFrameChange],
  )

  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const y = e.clientY - rect.top
      const ti = Math.floor(y / TRACK_HEIGHT)
      if (ti >= 0 && ti < project.tracks.length && !project.tracks[ti].locked) onAddClip(ti)
    },
    [project.tracks, onAddClip],
  )

  const handleZoomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setScale(Number(e.target.value))
  }, [])

  // Auto-scroll during playback
  useEffect(() => {
    if (!isPlaying) return
    const c = containerRef.current
    if (!c) return
    const phX = currentFrame * scale
    if (phX > c.scrollLeft + c.clientWidth - 50) {
      c.scrollLeft = phX - c.clientWidth * 0.3
    } else if (phX < c.scrollLeft + 50) {
      c.scrollLeft = Math.max(0, phX - 50)
    }
  }, [isPlaying, currentFrame, scale])

  const clipCount = project.tracks.reduce((s, t) => s + t.items.length, 0)

  return (
    <div className="timeline-container">
      {/* Header */}
      <div className="timeline-header">
        <div className="track-list-header" style={{ width: TRACK_LIST_WIDTH }}>
          <span>トラック</span>
          <span style={{ fontSize: 11, color: '#a09d96' }}>
            {project.tracks.length} トラック
          </span>
        </div>
        <div className="ruler-container" onClick={handleRulerClick}>
          <canvas ref={rulerRef} className="ruler-canvas" />
        </div>
      </div>

      {/* Body */}
      <div className="timeline-body">
        {/* Track List */}
        <div className="track-list" style={{ width: TRACK_LIST_WIDTH }}>
          {project.tracks.map((track, index) => (
            <div
              key={track.id}
              className={`track-list-item track-type-${track.type}`}
              style={{ height: TRACK_HEIGHT }}
            >
              <div className="track-list-name">
                <span className="track-list-icon">
                  {track.type === 'video' ? '🎬' : track.type === 'audio' ? '🎵' : 'Ｔ'}
                </span>
                <span className="track-list-title">{track.name}</span>
              </div>
              <div className="track-list-controls">
                <button
                  className={`track-btn ${track.mute ? 'active' : ''}`}
                  title={track.mute ? 'ミュート解除' : 'ミュート'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleTrackMute(index)
                  }}
                >
                  {track.mute ? '🔇' : '🔊'}
                </button>
                <button
                  className={`track-btn ${track.locked ? 'active' : ''}`}
                  title={track.locked ? 'ロック解除' : 'ロック'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleTrackLock(index)
                  }}
                >
                  {track.locked ? '🔒' : '🔓'}
                </button>
                <button
                  className={`track-btn ${track.solo ? 'active' : ''}`}
                  title={track.solo ? 'ソロ解除' : 'ソロ'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleTrackSolo(index)
                  }}
                >
                  {track.solo ? '🎤' : '🎶'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div className="timeline-scroll" ref={containerRef} onScroll={handleScroll}>
          <div style={{ width: totalWidth, minHeight: '100%', position: 'relative' }}>
            <canvas
              ref={canvasRef}
              className="timeline-canvas"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
              style={{ width: totalWidth, height: totalHeight }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="timeline-footer">
        <div className="zoom-control">
          <span className="zoom-label">縮小</span>
          <input
            type="range"
            className="zoom-slider"
            min={MIN_SCALE}
            max={MAX_SCALE}
            value={scale}
            onChange={handleZoomChange}
          />
          <span className="zoom-label">拡大</span>
          <span className="zoom-label" style={{ marginLeft: 8, fontFamily: 'Consolas, monospace' }}>
            {scale.toFixed(0)}px/f
          </span>
        </div>
        <div className="timeline-footer-info">
          <span>ダブルクリックでクリップ追加</span>
          <span style={{ marginLeft: 16 }}>全 {clipCount} クリップ</span>
          <span style={{ marginLeft: 16 }}>スナップ: {snapFrames}f</span>
          {selectedItemId && <span style={{ marginLeft: 16, color: '#cc785c' }}>選択中</span>}
        </div>
      </div>
    </div>
  )
}
