import React, { useRef, useEffect } from 'react'
import type { Project, TimelineItem, Keyframe, EasingType } from '../models/timeline'
import { mediaManager } from '../engine/media/manager'

interface PreviewCanvasProps {
  project: Project
  currentFrame: number
  selectedItemId: string | null
  isPlaying: boolean
}

const PADDING = 4

function applyEasing(t: number, easing: EasingType): number {
  switch (easing) {
    case 'linear': return t
    case 'easeIn': return t * t
    case 'easeOut': return t * (2 - t)
    case 'easeInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    case 'bounce': {
      const n1 = 7.5625; const d1 = 2.75
      if (t < 1 / d1) return n1 * t * t
      else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
      else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
      else return n1 * (t -= 2.625 / d1) * t + 0.984375
    }
    case 'elastic': {
      const c4 = (2 * Math.PI) / 3
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
    }
    default: return t
  }
}

function interpolateKeyframes(keyframes: Keyframe[], frame: number): Partial<Keyframe['properties']> {
  if (keyframes.length === 0) return {}
  if (keyframes.length === 1) return { ...keyframes[0].properties }
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame)
  if (frame <= sorted[0].frame) return { ...sorted[0].properties }
  if (frame >= sorted[sorted.length - 1].frame) return { ...sorted[sorted.length - 1].properties }
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]
    if (frame >= prev.frame && frame <= next.frame) {
      const range = next.frame - prev.frame
      const rawT = range === 0 ? 0 : (frame - prev.frame) / range
      const t = applyEasing(rawT, prev.easing || 'linear')
      const result: Record<string, number> = {}
      const allKeys = new Set([...Object.keys(prev.properties), ...Object.keys(next.properties)])
      for (const key of allKeys) {
        const pv = (prev.properties as any)[key]
        const nv = (next.properties as any)[key]
        if (pv !== undefined && nv !== undefined) result[key] = pv + (nv - pv) * t
        else if (pv !== undefined) result[key] = pv
        else if (nv !== undefined) result[key] = nv
      }
      return result as Partial<Keyframe['properties']>
    }
    prev = next
  }
  return {}
}

function getAnimationOpacity(item: TimelineItem, frame: number, fps: number): number {
  const duration = item.endFrame - item.startFrame
  if (item.appearAnimation && frame < item.startFrame + Math.min(15, duration * 0.15)) {
    const progress = (frame - item.startFrame) / Math.min(15, duration * 0.15)
    const t = Math.max(0, Math.min(1, progress))
    if (item.appearAnimation === 'fadeIn' || item.appearAnimation === 'fadeOut') return t
    return 1
  }
  if (item.disappearAnimation && frame > item.endFrame - Math.min(15, duration * 0.15)) {
    const progress = (item.endFrame - frame) / Math.min(15, duration * 0.15)
    const t = Math.max(0, Math.min(1, progress))
    if (item.disappearAnimation === 'fadeOut' || item.disappearAnimation === 'fadeIn') return t
    return 1
  }
  return 1
}

export default function PreviewCanvas({
  project,
  currentFrame,
  selectedItemId,
  isPlaying,
}: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastFrameRef = useRef(-1)
  const seekingRef = useRef(false)

  const { width, height, fps, backgroundColor } = project.settings
  const aspectRatio = width / height

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cw = container.clientWidth - PADDING * 2
    const ch = container.clientHeight - PADDING * 2
    let displayW: number, displayH: number
    if (cw / ch > aspectRatio) { displayH = ch; displayW = ch * aspectRatio }
    else { displayW = cw; displayH = cw / aspectRatio }
    displayW = Math.max(displayW, 160); displayH = Math.max(displayH, 90)

    if (canvas.width !== Math.round(displayW * dpr) || canvas.height !== Math.round(displayH * dpr)) {
      canvas.width = Math.round(displayW * dpr)
      canvas.height = Math.round(displayH * dpr)
    }
    const canvasEl = canvas as HTMLCanvasElement
    canvasEl.style.width = `${displayW}px`
    canvasEl.style.height = `${displayH}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const sx = displayW / width
    const sy = displayH / height

    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, displayW, displayH)

    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(displayW / 2, 0); ctx.lineTo(displayW / 2, displayH)
    ctx.moveTo(0, displayH / 2); ctx.lineTo(displayW, displayH / 2)
    ctx.stroke()
    for (let i = 1; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(displayW * i / 3, 0); ctx.lineTo(displayW * i / 3, displayH)
      ctx.moveTo(0, displayH * i / 3); ctx.lineTo(displayW, displayH * i / 3)
      ctx.stroke()
    }

    const visibleItems: { item: TimelineItem; trackIndex: number }[] = []
    for (let ti = 0; ti < project.tracks.length; ti++) {
      const track = project.tracks[ti]
      if (!track.visible) continue
      for (const item of track.items) {
        if (currentFrame >= item.startFrame && currentFrame < item.endFrame) {
          visibleItems.push({ item, trackIndex: ti })
        }
      }
    }
    visibleItems.sort((a, b) => a.item.layer - b.item.layer)

    const drawPromises: Promise<void>[] = []

    for (const { item } of visibleItems) {
      ctx.save()

      const animOpacity = getAnimationOpacity(item, currentFrame, fps)
      let totalOpacity = item.opacity * animOpacity

      const kfProps = interpolateKeyframes(item.keyframes, currentFrame)
      const posX = (kfProps.x ?? item.transform.x) * sx
      const posY = (kfProps.y ?? item.transform.y) * sy
      const scaleX = kfProps.scaleX ?? item.transform.scaleX
      const scaleY = kfProps.scaleY ?? item.transform.scaleY
      const rotation = (kfProps.rotation ?? item.transform.rotation) * Math.PI / 180
      const kfOpacity = kfProps.opacity ?? 1
      totalOpacity *= kfOpacity
      ctx.globalAlpha = totalOpacity

      const duration = item.endFrame - item.startFrame
      const appearLen = Math.min(15, duration * 0.15)
      const disappearLen = Math.min(15, duration * 0.15)
      const appearProgress = Math.max(0, Math.min(1, (currentFrame - item.startFrame) / appearLen))
      const disappearProgress = Math.max(0, Math.min(1, (item.endFrame - currentFrame) / disappearLen))
      let animOffsetX = 0, animOffsetY = 0

      if (item.appearAnimation && appearProgress < 1) {
        const t = applyEasing(appearProgress, 'easeOut')
        if (item.appearAnimation === 'slideInLeft') animOffsetX = displayW * (1 - t)
        if (item.appearAnimation === 'slideInRight') animOffsetX = -displayW * (1 - t)
        if (item.appearAnimation === 'zoomIn') { ctx.globalAlpha *= t; ctx.translate(displayW / 2, displayH / 2); ctx.scale(t, t); ctx.translate(-displayW / 2, -displayH / 2) }
        if (item.appearAnimation === 'zoomOut') { ctx.globalAlpha *= t; ctx.translate(displayW / 2, displayH / 2); ctx.scale(2 - t, 2 - t); ctx.translate(-displayW / 2, -displayH / 2) }
      }
      if (item.disappearAnimation && disappearProgress < 1) {
        const t = applyEasing(disappearProgress, 'easeOut')
        if (item.disappearAnimation === 'slideOutLeft') animOffsetX = -displayW * (1 - t)
        if (item.disappearAnimation === 'slideOutRight') animOffsetX = displayW * (1 - t)
        if (item.disappearAnimation === 'zoomOut') { ctx.globalAlpha *= t; ctx.translate(displayW / 2, displayH / 2); ctx.scale(t, t); ctx.translate(-displayW / 2, -displayH / 2) }
        if (item.disappearAnimation === 'zoomIn') { ctx.globalAlpha *= t; ctx.translate(displayW / 2, displayH / 2); ctx.scale(2 - t, 2 - t); ctx.translate(-displayW / 2, -displayH / 2) }
      }

      const itemW = (item.endFrame - item.startFrame) * sx * 0.5
      const itemH = 60 * sy

      ctx.translate(displayW / 2 + posX + animOffsetX, displayH / 2 + posY + animOffsetY)
      ctx.rotate(rotation)
      ctx.scale(scaleX, scaleY)

      const halfW = itemW / 2
      const halfH = itemH / 2

      if (item.type === 'text') {
        ctx.fillStyle = item.color || '#ffffff'
        ctx.font = `${Math.max(12, Math.round(20 * sx))}px -apple-system, BlinkMacSystemFont, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const text = item.text || item.name
        const lines = text.split('\n')
        const lineHeight = Math.max(14, Math.round(24 * sy))
        ctx.shadowColor = 'rgba(0,0,0,0.7)'
        ctx.shadowBlur = 4
        ctx.fillStyle = item.color || '#ffffff'
        lines.forEach((line, i) => { ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineHeight) })
        ctx.shadowBlur = 0
      } else if (item.type === 'audio') {
        const gradient = ctx.createLinearGradient(-halfW, 0, halfW, 0)
        gradient.addColorStop(0, (item.color || '#81c784') + '88')
        gradient.addColorStop(0.5, (item.color || '#81c784') + '44')
        gradient.addColorStop(1, (item.color || '#81c784') + '88')
        ctx.fillStyle = gradient
        ctx.fillRect(-halfW, -halfH, itemW, itemH)
        ctx.strokeStyle = (item.color || '#81c784') + '99'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let px = 0; px < itemW; px += 2) {
          const t = px / itemW
          const amp = (0.3 + 0.7 * (1 - Math.abs(t - 0.5) * 2)) * halfH * 0.6
          const y1 = Math.sin(t * 40 + currentFrame * 0.1) * amp
          ctx.lineTo(-halfW + px, y1)
        }
        ctx.stroke()
      } else if (item.type === 'image' && item.sourcePath) {
        const img = mediaManager.getImage(item.sourcePath)
        if (img && img.complete && img.naturalWidth > 0) {
          const imgW = halfW * 2; const imgH = halfH * 2
          const iar = img.naturalWidth / img.naturalHeight
          let drawW: number, drawH: number
          if (imgW / imgH > iar) { drawH = imgH; drawW = imgH * iar }
          else { drawW = imgW; drawH = drawW / iar }
          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)

          const hasShadow = item.effects.some(e => (e.name === 'シャドウ' || e.name === 'ドロップシャドウ') && e.params.enabled !== false)
          if (!hasShadow) {
            ctx.strokeStyle = (item.color || '#4fc3f7') + '66'
            ctx.lineWidth = 1
            ctx.strokeRect(-drawW / 2 - 1, -drawH / 2 - 1, drawW + 2, drawH + 2)
          }
        } else {
          const color = item.color || '#4fc3f7'
          ctx.fillStyle = color + '99'
          roundRect(ctx, -halfW, -halfH, itemW, itemH, 4); ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.font = `${Math.max(10, Math.round(14 * sx))}px sans-serif`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText('🖼', 0, -halfH * 0.3)
          ctx.font = `${Math.max(8, Math.round(10 * sx))}px sans-serif`
          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.fillText('読み込み中...', 0, halfH * 0.4)
        }
      } else if (item.type === 'video' && item.sourcePath) {
        const vid = mediaManager.getVideo(item.sourcePath)
        if (vid.readyState >= 2 && vid.videoWidth > 0) {
          seekToFrameTimed(vid, item, currentFrame, fps)
          const vw = vid.videoWidth; const vh = vid.videoHeight
          const var_ = vw / vh
          const dW = halfW * 2; const dH = halfH * 2
          let drawW: number, drawH: number
          if (dW / dH > var_) { drawH = dH; drawW = dH * var_ }
          else { drawW = dW; drawH = drawW / var_ }
          try { ctx.drawImage(vid, -drawW / 2, -drawH / 2, drawW, drawH) } catch { /* not ready */ }
        } else {
          const color = item.color || '#4fc3f7'
          ctx.fillStyle = color + '99'
          roundRect(ctx, -halfW, -halfH, itemW, itemH, 4); ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.font = `${Math.max(10, Math.round(14 * sx))}px sans-serif`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText('🎬', 0, -halfH * 0.3)
          ctx.font = `${Math.max(8, Math.round(10 * sx))}px sans-serif`
          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.fillText(vid.readyState < 2 ? '読み込み中...' : item.name, 0, halfH * 0.4)
        }
      } else {
        const color = item.color || '#4fc3f7'
        const hasShadow = item.effects.some(e => (e.name === 'シャドウ' || e.name === 'ドロップシャドウ') && e.params.enabled !== false)
        if (hasShadow) {
          const shadowEffect = item.effects.find(e => e.name === 'シャドウ' || e.name === 'ドロップシャドウ')
          ctx.shadowColor = shadowEffect?.params?.color as string || 'rgba(0,0,0,0.5)'
          ctx.shadowBlur = (shadowEffect?.params?.blur as number) || 6
          ctx.shadowOffsetX = (shadowEffect?.params?.offsetX as number) || 3
          ctx.shadowOffsetY = (shadowEffect?.params?.offsetY as number) || 3
        }
        ctx.fillStyle = color + '99'
        roundRect(ctx, -halfW, -halfH, itemW, itemH, 4); ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = color; ctx.lineWidth = 1.5
        roundRect(ctx, -halfW, -halfH, itemW, itemH, 4); ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = `${Math.max(10, Math.round(14 * sx))}px sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('📄', 0, -halfH * 0.3)
        ctx.font = `${Math.max(8, Math.round(10 * sx))}px sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fillText(item.name.length > 10 ? item.name.substring(0, 9) + '…' : item.name, 0, halfH * 0.4)
      }

      ctx.restore()
    }

    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.font = '11px Consolas, monospace'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(`f${currentFrame}  ${visibleItems.length} items`, 6, 6)

    if (selectedItemId) {
      const selected = visibleItems.find(v => v.item.id === selectedItemId)
      if (selected) {
        ctx.strokeStyle = '#cc785c'; ctx.lineWidth = 2; ctx.setLineDash([4, 3])
        const sItem = selected.item
        const sItemW = (sItem.endFrame - sItem.startFrame) * sx * 0.5
        const sItemH = 60 * sy
        const sPosX = sItem.transform.x * sx; const sPosY = sItem.transform.y * sy
        ctx.strokeRect(displayW / 2 + sPosX - sItemW / 2 - 4, displayH / 2 + sPosY - sItemH / 2 - 4, sItemW + 8, sItemH + 8)
        ctx.setLineDash([])
      }
    }

    lastFrameRef.current = currentFrame
    seekingRef.current = false
  }, [project, currentFrame, selectedItemId, isPlaying, aspectRatio, width, height, fps, backgroundColor])

  return (
    <div ref={containerRef} className="ymm4-preview-container">
      <canvas ref={canvasRef} className="ymm4-preview-canvas" />
      <div className="ymm4-preview-hud">
        <span className="ymm4-preview-resolution">{width}×{height}</span>
        <span className="ymm4-preview-time">
          {Math.floor(currentFrame / fps / 60).toString().padStart(2, '0')}:
          {Math.floor((currentFrame / fps) % 60).toString().padStart(2, '0')}:
          {(currentFrame % fps).toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

const seekingTimers = new Map<string, number>()

function seekToFrameTimed(vid: HTMLVideoElement, item: TimelineItem, frame: number, fps: number) {
  const key = item.id
  const targetTime = (frame - item.startFrame) / fps
  if (Math.abs(vid.currentTime - targetTime) < 0.3 / fps) return
  const existing = seekingTimers.get(key)
  if (existing) { clearTimeout(existing); seekingTimers.delete(key) }
  const timer = window.setTimeout(() => {
    vid.currentTime = targetTime
    seekingTimers.delete(key)
  }, 16)
  seekingTimers.set(key, timer)
}
