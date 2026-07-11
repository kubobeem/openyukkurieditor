import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { Project, TimelineItem, TrackType } from './models/timeline'
import { addSampleItem, addTrack, createDefaultProject, formatTime, generateId } from './models/timeline'
import { parseYmmp, serializeYmmp } from './parsers/ymmp'
import { pluginManager } from './plugin/manager'
import { registerBuiltinEffects } from './engine/effect/effects/effects-index'
import { VoiceEngineManager } from './engine/voice/manager'
import { AviUtlInterpreter, ScriptFrameState } from './engine/script/aviutl-interpreter'
import { EffectPipeline } from './engine/effect/pipeline'
import Timeline from './components/Timeline'
import MenuBar from './components/MenuBar'
import type { MenuGroup } from './components/MenuBar'
import LeftPanel from './components/LeftPanel'
import ItemPropertiesPanel from './components/ItemPropertiesPanel'
import SerifInput from './components/SerifInput'
import SettingsDialog from './components/SettingsDialog'
import ExportDialog from './components/ExportDialog'
import './styles/ymm4-theme.css'

type SelectedClip = { trackIndex: number; itemId: string }
type ProjectHistory = { past: Project[]; future: Project[] }

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function cloneTimelineItem(item: TimelineItem): TimelineItem {
  return {
    ...item,
    transform: { ...item.transform },
    effects: item.effects.map(e => ({ ...e, params: { ...e.params } })),
    keyframes: item.keyframes.map(kf => ({ ...kf, properties: { ...kf.properties } })),
  }
}

function trackTypeForItem(item: TimelineItem): TrackType {
  if (item.type === 'audio' || item.type === 'voice') return 'audio'
  if (item.type === 'text') return 'text'
  return 'video'
}

// エンジン初期化
registerBuiltinEffects()
const voiceEngine = new VoiceEngineManager()
voiceEngine.registerDefaults()
const scriptRunner = new AviUtlInterpreter()
const effectPipeline = new EffectPipeline()

export default function App() {
  // --- プロジェクト管理 ---
  const [project, setProject] = useState<Project>(createDefaultProject)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const savePathRef = useRef<string | null>(null)
  const animFrameRef = useRef<number>(0)
  const lastTickRef = useRef(0)
  const projectRef = useRef(project)
  const historyRef = useRef<ProjectHistory>({ past: [], future: [] })
  const clipClipboardRef = useRef<TimelineItem | null>(null)

  // --- UI 状態 ---
  const [selectedClip, setSelectedClip] = useState<SelectedClip | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [snapFrames, setSnapFrames] = useState(1)
  const [markers, setMarkers] = useState<number[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  // --- VOICEVOX / 音声 ---
  const [voiceText, setVoiceText] = useState('')
  const [voiceEngines, setVoiceEngines] = useState<any[]>([])
  const [selectedEngine, setSelectedEngine] = useState('voicevox')
  const [selectedStyle, setSelectedStyle] = useState(0)
  const [pluginsLoaded, setPluginsLoaded] = useState(false)
  const [currentCharacterId, setCurrentCharacterId] = useState('default')

  const timeStr = formatTime(currentFrame, project.settings.fps)

  // --- ref sync ---
  useEffect(() => { projectRef.current = project }, [project])

  // --- 選択中のクリップが消えたら解除 ---
  useEffect(() => {
    if (!selectedClip) return
    const track = project.tracks[selectedClip.trackIndex]
    const exists = !!track?.items.some(item => item.id === selectedClip.itemId)
    if (!exists) setSelectedClip(null)
  }, [project, selectedClip])

  // --- プラグインロード ---
  useEffect(() => {
    pluginManager.loadAll().then(() => {
      setPluginsLoaded(true)
      console.log(`[App] ${pluginManager.getVideoEffects().length} effects loaded`)
    })
    return () => pluginManager.destroyAll()
  }, [])

  useEffect(() => { return () => voiceEngine.dispose() }, [])

  // --- 音声エンジン検出 ---
  useEffect(() => {
    voiceEngine.getAvailableEngines().then(setVoiceEngines)
    const interval = setInterval(() => {
      voiceEngine.getAvailableEngines().then(setVoiceEngines)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // --- プロジェクト履歴 ---
  const clampFrame = useCallback((frame: number) => {
    return Math.max(0, Math.min(project.settings.totalFrames - 1, frame))
  }, [project.settings.totalFrames])

  const clearHistory = useCallback(() => {
    historyRef.current = { past: [], future: [] }
  }, [])

  const applyProjectUpdate = useCallback((
    updater: (prev: Project) => Project,
    options?: { recordHistory?: boolean },
  ) => {
    setProject(prev => {
      const next = updater(prev)
      if (next === prev) return prev
      if (options?.recordHistory !== false) {
        historyRef.current.past.push(prev)
        if (historyRef.current.past.length > 120) historyRef.current.past.shift()
        historyRef.current.future = []
      }
      return next
    })
  }, [])

  const handleUndo = useCallback(() => {
    setProject(prev => {
      const previous = historyRef.current.past.pop()
      if (!previous) return prev
      historyRef.current.future.push(prev)
      return previous
    })
  }, [])

  const handleRedo = useCallback(() => {
    setProject(prev => {
      const next = historyRef.current.future.pop()
      if (!next) return prev
      historyRef.current.past.push(prev)
      return next
    })
  }, [])

  // --- プロジェクト保存 ---
  const handleSaveProject = useCallback(async (explicitPath?: string) => {
    const json = serializeYmmp(projectRef.current)
    if (window.electronAPI) {
      if (explicitPath) { savePathRef.current = explicitPath; await window.electronAPI.writeFile(explicitPath, json); return }
      if (savePathRef.current) { await window.electronAPI.writeFile(savePathRef.current, json); return }
      const result = await window.electronAPI.showSaveDialog()
      if (!result.canceled && result.filePath) { savePathRef.current = result.filePath; await window.electronAPI.writeFile(result.filePath, json) }
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `${projectRef.current.name}.ymmp`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }, [])

  // --- プロジェクト新規作成 ---
  const handleNewProject = useCallback(() => {
    setProject(createDefaultProject())
    setCurrentFrame(0); setSelectedClip(null); setMarkers([])
    setIsPlaying(false); savePathRef.current = null; clearHistory()
  }, [clearHistory])

  // --- クリップ操作 ---
  const handleTrimItem = useCallback((trackIndex: number, itemId: string, newStartFrame: number, newEndFrame: number) => {
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i !== trackIndex || track.locked ? track : {
        ...track,
        items: track.items.map(item => item.id === itemId ? {
          ...item, startFrame: newStartFrame, endFrame: newEndFrame,
        } : item),
      }),
    }))
  }, [applyProjectUpdate])

  const handleMoveItemToTrack = useCallback((itemId: string, fromTrackIndex: number, toTrackIndex: number, newStartFrame: number) => {
    applyProjectUpdate(prev => {
      const sourceTrack = prev.tracks[fromTrackIndex]
      const targetTrack = prev.tracks[toTrackIndex]
      if (!sourceTrack || !targetTrack || targetTrack.locked) return prev
      const item = sourceTrack.items.find(i => i.id === itemId)
      if (!item) return prev
      const duration = item.endFrame - item.startFrame
      return {
        ...prev,
        tracks: prev.tracks.map((track, i) => {
          if (i === fromTrackIndex) return { ...track, items: track.items.filter(it => it.id !== itemId) }
          if (i === toTrackIndex) return { ...track, items: [...track.items, { ...item, startFrame: newStartFrame, endFrame: newStartFrame + duration }] }
          return track
        }),
      }
    })
  }, [applyProjectUpdate])

  const handleMoveItem = useCallback((trackIndex: number, itemId: string, newStartFrame: number) => {
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i !== trackIndex || track.locked ? track : {
        ...track,
        items: track.items.map(item => item.id === itemId ? {
          ...item, startFrame: newStartFrame, endFrame: item.endFrame + (newStartFrame - item.startFrame),
        } : item),
      }),
    }))
  }, [applyProjectUpdate])

  const handleDeleteSelectedClip = useCallback(() => {
    if (!selectedClip) return
    let deleted = false
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i !== selectedClip.trackIndex || track.locked ? track : {
        ...track,
        items: track.items.filter(item => { if (item.id === selectedClip.itemId) { deleted = true; return false } return true }),
      }),
    }))
    if (deleted) setSelectedClip(null)
  }, [applyProjectUpdate, selectedClip])

  const handleDuplicateSelectedClip = useCallback(() => {
    if (!selectedClip) return
    let nextSelection: SelectedClip | null = null
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i !== selectedClip.trackIndex || track.locked ? track : {
        ...track,
        items: (() => {
          const source = track.items.find(item => item.id === selectedClip.itemId)
          if (!source) return track.items
          const duration = source.endFrame - source.startFrame
          const gap = Math.max(1, Math.round(prev.settings.fps / 6))
          const maxStart = Math.max(0, prev.settings.totalFrames - duration)
          const startFrame = Math.max(0, Math.min(maxStart, source.endFrame + gap))
          const dup = { ...cloneTimelineItem(source), id: generateId(), name: `${source.name} コピー`, startFrame, endFrame: startFrame + duration }
          nextSelection = { trackIndex: i, itemId: dup.id }
          return [...track.items, dup]
        })(),
      }),
    }))
    if (nextSelection) setSelectedClip(nextSelection)
  }, [applyProjectUpdate, selectedClip])

  const handleCopySelectedClip = useCallback(() => {
    if (!selectedClip) return
    const track = projectRef.current.tracks[selectedClip.trackIndex]
    const item = track?.items.find(c => c.id === selectedClip.itemId)
    if (item) clipClipboardRef.current = cloneTimelineItem(item)
  }, [selectedClip])

  const handleCutSelectedClip = useCallback(() => {
    handleCopySelectedClip(); handleDeleteSelectedClip()
  }, [handleCopySelectedClip, handleDeleteSelectedClip])

  const handlePasteClip = useCallback(() => {
    const cb = clipClipboardRef.current
    if (!cb) return
    const copied = cloneTimelineItem(cb)
    let nextSelection: SelectedClip | null = null
    applyProjectUpdate(prev => {
      const desiredType = trackTypeForItem(copied)
      const selTrack = selectedClip ? prev.tracks[selectedClip.trackIndex] : null
      let targetIdx = -1
      if (selectedClip && selTrack && !selTrack.locked && selTrack.type === desiredType) targetIdx = selectedClip.trackIndex
      else targetIdx = prev.tracks.findIndex(t => !t.locked && t.type === desiredType)
      if (targetIdx < 0) targetIdx = prev.tracks.findIndex(t => !t.locked)
      if (targetIdx < 0) return prev
      const duration = copied.endFrame - copied.startFrame
      const maxStart = Math.max(0, prev.settings.totalFrames - duration)
      const startFrame = Math.max(0, Math.min(maxStart, currentFrame))
      const pasted: TimelineItem = { ...copied, id: generateId(), startFrame, endFrame: startFrame + duration }
      nextSelection = { trackIndex: targetIdx, itemId: pasted.id }
      return { ...prev, tracks: prev.tracks.map((t, i) => i === targetIdx ? { ...t, items: [...t.items, pasted] } : t) }
    })
    if (nextSelection) setSelectedClip(nextSelection)
  }, [applyProjectUpdate, currentFrame, selectedClip])

  const cycleSnapFrames = useCallback(() => {
    setSnapFrames(prev => prev === 1 ? 5 : prev === 5 ? 10 : 1)
  }, [])

  const handleRippleDeleteSelectedClip = useCallback(() => {
    if (!selectedClip) return
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i !== selectedClip.trackIndex || track.locked ? track : {
        ...track,
        items: (() => {
          const target = track.items.find(item => item.id === selectedClip.itemId)
          if (!target) return track.items
          const dur = target.endFrame - target.startFrame
          return track.items.filter(item => item.id !== selectedClip.itemId).map(item =>
            item.startFrame >= target.endFrame
              ? { ...item, startFrame: Math.max(0, item.startFrame - dur), endFrame: Math.max(0, item.endFrame - dur) }
              : item,
          )
        })(),
      }),
    }))
    setSelectedClip(null)
  }, [applyProjectUpdate, selectedClip])

  const handleSplitSelectedClip = useCallback(() => {
    const item = (() => {
      if (!selectedClip) return null
      const track = projectRef.current.tracks[selectedClip.trackIndex]
      return track?.items.find(c => c.id === selectedClip.itemId) ?? null
    })()
    if (!item || currentFrame <= item.startFrame || currentFrame >= item.endFrame) return
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i !== selectedClip!.trackIndex || track.locked ? track : {
        ...track,
        items: track.items.flatMap(existing => existing.id !== item.id ? [existing] : [
          { ...existing, endFrame: currentFrame },
          { ...cloneTimelineItem(existing), id: generateId(), name: `${existing.name} B`, startFrame: currentFrame },
        ]),
      }),
    }))
  }, [applyProjectUpdate, currentFrame, selectedClip])

  const handleToggleMarkerAtCurrentFrame = useCallback(() => {
    setMarkers(prev => prev.includes(currentFrame) ? prev.filter(m => m !== currentFrame) : [...prev, currentFrame].sort((a, b) => a - b))
  }, [currentFrame])

  const jumpToMarker = useCallback((dir: 1 | -1) => {
    if (markers.length === 0) return
    if (dir > 0) { const n = markers.find(m => m > currentFrame); setCurrentFrame(n ?? markers[0]); return }
    const pm = markers.filter(m => m < currentFrame)
    setCurrentFrame(pm.length > 0 ? pm[pm.length - 1] : markers[markers.length - 1])
  }, [currentFrame, markers])

  const selectAdjacentClip = useCallback((dir: 1 | -1) => {
    const tracks = projectRef.current.tracks
    if (tracks.length === 0) return
    if (!selectedClip) {
      for (let ti = 0; ti < tracks.length; ti++) { if (tracks[ti].items.length > 0) { setSelectedClip({ trackIndex: ti, itemId: tracks[ti].items[0].id }); return } }
      return
    }
    const track = tracks[selectedClip.trackIndex]
    if (!track || track.items.length === 0) return
    const sorted = [...track.items].sort((a, b) => a.startFrame - b.startFrame)
    const idx = sorted.findIndex(i => i.id === selectedClip.itemId)
    if (idx < 0) return
    const ni = Math.max(0, Math.min(sorted.length - 1, idx + dir))
    setSelectedClip({ trackIndex: selectedClip.trackIndex, itemId: sorted[ni].id })
    setCurrentFrame(sorted[ni].startFrame)
  }, [selectedClip])

  const getSelectedItem = useCallback((): { trackIndex: number; item: TimelineItem } | null => {
    if (!selectedClip) return null
    const track = projectRef.current.tracks[selectedClip.trackIndex]
    if (!track) return null
    const item = track.items.find(c => c.id === selectedClip.itemId)
    return item ? { trackIndex: selectedClip.trackIndex, item } : null
  }, [selectedClip])

  // --- アイテムプロパティ更新 ---
  const handleUpdateItem = useCallback((updates: Partial<TimelineItem>) => {
    const sel = getSelectedItem()
    if (!sel) return
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i !== sel.trackIndex ? track : {
        ...track,
        items: track.items.map(item => item.id === sel.item.id ? { ...item, ...updates } : item),
      }),
    }), { recordHistory: true })
  }, [applyProjectUpdate, getSelectedItem])

  const handleDeleteEffect = useCallback((effectIndex: number) => {
    const sel = getSelectedItem()
    if (!sel) return
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i !== sel.trackIndex ? track : {
        ...track,
        items: track.items.map(item => item.id !== sel.item.id ? item : {
          ...item,
          effects: item.effects.filter((_, j) => j !== effectIndex),
        }),
      }),
    }))
  }, [applyProjectUpdate, getSelectedItem])

  // --- セリフ追加 ---
  const handleAddSerif = useCallback((text: string, characterId: string) => {
    const textTrackIdx = projectRef.current.tracks.findIndex(t => t.type === 'text' && !t.locked)
    if (textTrackIdx < 0) return
    const item: TimelineItem = {
      id: generateId(),
      name: `セリフ: ${text.slice(0, 20)}`,
      type: 'text',
      startFrame: currentFrame,
      endFrame: currentFrame + projectRef.current.settings.fps * 3,
      layer: 0,
      opacity: 1,
      volume: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      keyframes: [],
      text,
      voicePreset: characterId,
    }
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i !== textTrackIdx ? track : {
        ...track,
        items: [...track.items, item],
      }),
    }))
    setCurrentFrame(prev => prev + projectRef.current.settings.fps * 3)
  }, [applyProjectUpdate, currentFrame])

  // --- ヌージュ ---
  const handleNudge = useCallback((clip: SelectedClip | null, delta: number) => {
    if (!clip) return
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i !== clip.trackIndex || track.locked ? track : {
        ...track,
        items: track.items.map(item => {
          if (item.id !== clip.itemId) return item
          const dur = item.endFrame - item.startFrame
          const maxStart = Math.max(0, prev.settings.totalFrames - dur)
          const startFrame = Math.max(0, Math.min(maxStart, item.startFrame + delta))
          const moved = startFrame - item.startFrame
          return moved === 0 ? item : { ...item, startFrame, endFrame: item.endFrame + moved }
        }),
      }),
    }))
  }, [applyProjectUpdate])

  // --- キーボードショートカット ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const isMeta = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (isMeta && key === 's') { e.preventDefault(); void handleSaveProject(); return }
      if (isMeta && key === 'z') { e.preventDefault(); e.shiftKey ? handleRedo() : handleUndo(); return }
      if (isMeta && key === 'y') { e.preventDefault(); handleRedo(); return }
      if (isMeta && key === 'c') { const s = getSelectedItem(); if (s) { e.preventDefault(); handleCopySelectedClip() } return }
      if (isMeta && key === 'x') { const s = getSelectedItem(); if (s) { e.preventDefault(); handleCutSelectedClip() } return }
      if (isMeta && key === 'v') { e.preventDefault(); handlePasteClip(); return }
      if (isMeta && key === 'd') { e.preventDefault(); handleDuplicateSelectedClip(); return }
      if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); handleRippleDeleteSelectedClip(); return }
      if (isMeta && e.key === 'ArrowLeft') { e.preventDefault(); handleNudge(selectedClip, e.shiftKey ? -10 : -1); return }
      if (isMeta && e.key === 'ArrowRight') { e.preventDefault(); handleNudge(selectedClip, e.shiftKey ? 10 : 1); return }
      if (key === 's' && !isMeta) { e.preventDefault(); handleSplitSelectedClip(); return }
      if (key === 'm' && !isMeta) { e.preventDefault(); handleToggleMarkerAtCurrentFrame(); return }
      if (key === 'n' && !isMeta) { e.preventDefault(); cycleSnapFrames(); return }
      if (key === ',') { e.preventDefault(); jumpToMarker(-1); return }
      if (key === '.') { e.preventDefault(); jumpToMarker(1); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); handleDeleteSelectedClip(); return }
      if (e.code === 'Space') { e.preventDefault(); setIsPlaying(prev => !prev); return }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setCurrentFrame(prev => clampFrame(prev - (e.shiftKey ? 10 : 1))); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); setCurrentFrame(prev => clampFrame(prev + (e.shiftKey ? 10 : 1))); return }
      if (e.key === 'PageUp') { e.preventDefault(); setCurrentFrame(prev => clampFrame(prev - projectRef.current.settings.fps)); return }
      if (e.key === 'PageDown') { e.preventDefault(); setCurrentFrame(prev => clampFrame(prev + projectRef.current.settings.fps)); return }
      if (e.key === '[') { e.preventDefault(); selectAdjacentClip(-1); return }
      if (e.key === ']') { e.preventDefault(); selectAdjacentClip(1); return }
      if (e.key === 'Home') { e.preventDefault(); setCurrentFrame(0); return }
      if (e.key === 'End') { e.preventDefault(); setCurrentFrame(projectRef.current.settings.totalFrames - 1) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    clampFrame, cycleSnapFrames, getSelectedItem, handleCopySelectedClip, handleCutSelectedClip,
    handleDeleteSelectedClip, handleDuplicateSelectedClip, handleNudge, handlePasteClip,
    handleRippleDeleteSelectedClip, handleSplitSelectedClip, handleToggleMarkerAtCurrentFrame,
    handleRedo, handleSaveProject, handleUndo, jumpToMarker, selectAdjacentClip, selectedClip,
  ])

  // --- 再生ループ ---
  useEffect(() => {
    if (!isPlaying) { lastTickRef.current = 0; return }
    const fps = project.settings.fps; const interval = 1000 / fps
    lastTickRef.current = performance.now()
    const tick = (now: number) => {
      const delta = now - lastTickRef.current
      if (delta >= interval) {
        lastTickRef.current = now - (delta % interval)
        setCurrentFrame(prev => {
          const next = prev + Math.floor(delta / interval)
          if (next >= project.settings.totalFrames) { setIsPlaying(false); return 0 }
          return next
        })
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isPlaying, project.settings.fps, project.settings.totalFrames])

  // --- Electron IPC ---
  useEffect(() => {
    if (!window.electronAPI) return
    const disposeOpen = window.electronAPI.onOpenProject(async (filePath: string) => {
      const content = await window.electronAPI!.readFile(filePath)
      if (!content) return
      try { const loaded = parseYmmp(content); setProject(loaded); setCurrentFrame(0); setSelectedClip(null); setMarkers([]); setIsPlaying(false); savePathRef.current = filePath; clearHistory() } catch (e) { console.error(e) }
    })
    return disposeOpen
  }, [clearHistory])

  useEffect(() => {
    if (!window.electronAPI) return
    const disposeSave = window.electronAPI.onSaveProject(() => void handleSaveProject())
    const disposeSaveAs = window.electronAPI.onSaveProjectAs((filePath: string) => void handleSaveProject(filePath))
    return () => { disposeSave(); disposeSaveAs() }
  }, [handleSaveProject])

  // --- ハンドラ類 ---
  const handleAddClip = useCallback((trackIndex: number) => {
    applyProjectUpdate(prev => (prev.tracks[trackIndex] && !prev.tracks[trackIndex].locked) ? addSampleItem(prev, trackIndex) : prev)
  }, [applyProjectUpdate])

  const handleAddTrack = useCallback((type: 'video' | 'audio' | 'text') => {
    applyProjectUpdate(prev => addTrack(prev, type))
  }, [applyProjectUpdate])

  const handleFrameChange = useCallback((frame: number) => setCurrentFrame(clampFrame(frame)), [clampFrame])
  const handlePlayPause = useCallback(() => setIsPlaying(prev => !prev), [])

  const handleToggleTrackMute = useCallback((trackIndex: number) => {
    applyProjectUpdate(prev => ({ ...prev, tracks: prev.tracks.map((t, i) => i === trackIndex ? { ...t, mute: !t.mute } : t) }))
  }, [applyProjectUpdate])

  const handleToggleTrackLock = useCallback((trackIndex: number) => {
    applyProjectUpdate(prev => ({ ...prev, tracks: prev.tracks.map((t, i) => i === trackIndex ? { ...t, locked: !t.locked } : t) }))
  }, [applyProjectUpdate])

  const handleToggleTrackSolo = useCallback((trackIndex: number) => {
    applyProjectUpdate(prev => ({ ...prev, tracks: prev.tracks.map((t, i) => i === trackIndex ? { ...t, solo: !t.solo } : t) }))
  }, [applyProjectUpdate])

  // --- ダミーデータ ---
  const mediaItems = [
    { id: 'm1', name: 'サンプル動画.mp4', type: 'video' as const, icon: '🎬' },
    { id: 'm2', name: 'サンプル音声.wav', type: 'audio' as const, icon: '🎵' },
    { id: 'm3', name: 'サンプル画像.png', type: 'image' as const, icon: '🖼' },
  ]

  const characters = [
    { id: 'default', name: 'デフォルト', engine: 'voicevox', avatar: '😀', available: true },
    { id: 'zundamon', name: 'ずんだもん', engine: 'voicevox', avatar: '🌿', available: true },
    { id: 'tsumugi', name: '紡音つむぎ', engine: 'aivoice', avatar: '🎤', available: false },
  ]

  const scenes = [
    { id: 's1', name: 'シーン 1', duration: 9000 },
  ]

  const plugins = [
    ...pluginManager.getVideoEffects().map(e => ({ name: e.meta.name, id: e.meta.id, type: 'effect' })),
    ...pluginManager.getVoicePlugins().map(e => ({ name: e.meta.name, id: e.meta.id, type: 'voice' })),
  ]

  // --- メニュー定義 ---
  const menuGroups: MenuGroup[] = [
    {
      label: 'ファイル',
      items: [
        { label: '新規プロジェクト', shortcut: 'Ctrl+N', action: handleNewProject },
        { label: '開く', shortcut: 'Ctrl+O', action: () => {
          if (window.electronAPI) {
            // Electron handles this via native menu - this covers web fallback
          }
        } },
        { label: '保存', shortcut: 'Ctrl+S', action: () => void handleSaveProject() },
        { label: '名前を付けて保存', shortcut: 'Ctrl+Shift+S', action: () => {} },
        'separator',
        { label: 'プロジェクト設定', action: () => setSettingsOpen(true) },
        'separator',
        { label: '終了', shortcut: 'Alt+F4', action: () => window.close() },
      ],
    },
    {
      label: '編集',
      items: [
        { label: '元に戻す', shortcut: 'Ctrl+Z', action: handleUndo },
        { label: 'やり直し', shortcut: 'Ctrl+Y', action: handleRedo },
        'separator',
        { label: '切り取り', shortcut: 'Ctrl+X', action: handleCutSelectedClip },
        { label: 'コピー', shortcut: 'Ctrl+C', action: handleCopySelectedClip },
        { label: '貼り付け', shortcut: 'Ctrl+V', action: handlePasteClip },
        { label: '複製', shortcut: 'Ctrl+D', action: handleDuplicateSelectedClip },
        'separator',
        { label: '削除', shortcut: 'Delete', action: handleDeleteSelectedClip },
        { label: 'リップル削除', shortcut: 'Shift+Delete', action: handleRippleDeleteSelectedClip },
        'separator',
        { label: '分割', shortcut: 'S', action: handleSplitSelectedClip },
      ],
    },
    {
      label: '表示',
      items: [
        { label: 'メディアパネル', action: () => {} },
        { label: 'キャラクターパネル', action: () => {} },
        { label: 'プロパティパネル', action: () => {} },
        'separator',
        { label: '設定...', action: () => setSettingsOpen(true) },
      ],
    },
    {
      label: 'ツール',
      items: [
        { label: `プラグイン (${plugins.length})`, action: () => {} },
        { label: 'AviUtl Script テスト', action: () => { scriptRunner.evaluate('x=100\ny=sin(frame*10)\nalpha=128', { frame: currentFrame, width: 1920, height: 1080 } as ScriptFrameState); console.log('[Script] executed') } },
      ],
    },
    {
      label: 'ヘルプ',
      items: [
        { label: 'Open Yukkuri Editor について', action: () => {} },
        { label: 'キーボードショートカット', action: () => setSettingsOpen(true) },
      ],
    },
  ]

  const selectedItem = getSelectedItem()

  return (
    <div className="ymm4-app-layout">
      {/* メニューバー */}
      <MenuBar groups={menuGroups} brand="OE" />

      {/* ツールバー */}
      <div className="ymm4-toolbar">
        <button className="ymm4-toolbar-btn" onClick={handleNewProject}>📄 新規</button>
        <button className="ymm4-toolbar-btn primary" onClick={() => void handleSaveProject()}>💾 保存</button>
        <div className="ymm4-toolbar-separator" />
        <button className="ymm4-toolbar-btn" onClick={handleUndo}>↶ 元に戻す</button>
        <button className="ymm4-toolbar-btn" onClick={handleRedo}>↷ やり直し</button>
        <div className="ymm4-toolbar-separator" />
        <button className="ymm4-toolbar-btn" onClick={() => handleAddTrack('video')}>＋ 動画</button>
        <button className="ymm4-toolbar-btn" onClick={() => handleAddTrack('audio')}>＋ 音声</button>
        <button className="ymm4-toolbar-btn" onClick={() => handleAddTrack('text')}>＋ テキスト</button>
        <div className="ymm4-toolbar-separator" />
        <button className={`ymm4-toolbar-btn ${snapFrames > 1 ? 'active' : ''}`} onClick={cycleSnapFrames}>
          🧲 {snapFrames}f
        </button>
        <div className="ymm4-toolbar-spacer" />
        <button className="ymm4-toolbar-btn" onClick={() => setExportOpen(true)}>📹 書き出し</button>
        <button className="ymm4-toolbar-btn" onClick={() => setSettingsOpen(true)}>⚙ 設定</button>
      </div>

      {/* メインエリア */}
      <div className="ymm4-main-area">
        {/* 左パネル */}
        <LeftPanel
          mediaItems={mediaItems}
          characters={characters}
          scenes={scenes}
          activeSceneId="s1"
          onSelectScene={() => {}}
          onAddMedia={() => {}}
          onSelectCharacter={setCurrentCharacterId}
        />

        {/* 中央（プレビュー + セリフ入力） */}
        <div className="ymm4-center-area">
          <div className="ymm4-preview-area">
            <div className="ymm4-preview-frame">
              <span className="ymm4-preview-label">
                {project.settings.width} × {project.settings.height}
              </span>
              <span className="ymm4-preview-time">{timeStr}</span>
            </div>
          </div>

          {/* セリフ入力 */}
          <SerifInput
            currentCharacterId={currentCharacterId}
            characters={characters}
            onSelectCharacter={setCurrentCharacterId}
            onAddSerif={handleAddSerif}
          />

          {/* タイムライン */}
          <div className="ymm4-timeline-wrapper">
            <Timeline
              project={project}
              currentFrame={currentFrame}
              onFrameChange={handleFrameChange}
              onAddClip={handleAddClip}
              onMoveItem={handleMoveItem}
              onTrimItem={handleTrimItem}
              onMoveItemToTrack={handleMoveItemToTrack}
              isPlaying={isPlaying}
              snapFrames={snapFrames}
              markers={markers}
              selectedItemId={selectedClip?.itemId ?? null}
              selectedItemIds={selectedItemIds}
              onSelectItem={(trackIndex, itemId) => {
                if (!itemId) { setSelectedClip(null); return }
                setSelectedClip({ trackIndex, itemId })
              }}
              onSelectItems={(ids) => setSelectedItemIds(ids)}
              onDeleteItem={(trackIndex, itemId) => {
                applyProjectUpdate(prev => ({
                  ...prev,
                  tracks: prev.tracks.map((t, i) => i !== trackIndex || t.locked ? t : {
                    ...t,
                    items: t.items.filter(it => it.id !== itemId),
                  }),
                }))
                if (selectedClip?.itemId === itemId) setSelectedClip(null)
              }}
              onDuplicateItem={(trackIndex, itemId) => {
                applyProjectUpdate(prev => ({
                  ...prev,
                  tracks: prev.tracks.map((t, i) => i !== trackIndex || t.locked ? t : {
                    ...t,
                    items: (() => {
                      const source = t.items.find(it => it.id === itemId)
                      if (!source) return t.items
                      const dur = source.endFrame - source.startFrame
                      const gap = Math.max(1, Math.round(prev.settings.fps / 6))
                      const maxStart = Math.max(0, prev.settings.totalFrames - dur)
                      const startFrame = Math.max(0, Math.min(maxStart, source.endFrame + gap))
                      const dup = { ...cloneTimelineItem(source), id: generateId(), name: `${source.name} コピー`, startFrame, endFrame: startFrame + dur }
                      return [...t.items, dup]
                    })(),
                  }),
                }))
              }}
              onToggleTrackMute={handleToggleTrackMute}
              onToggleTrackLock={handleToggleTrackLock}
              onToggleTrackSolo={handleToggleTrackSolo}
            />
          </div>
        </div>

        {/* 右パネル（アイテムプロパティ） */}
        <ItemPropertiesPanel
          item={selectedItem?.item ?? null}
          totalFrames={project.settings.totalFrames}
          fps={project.settings.fps}
          currentFrame={currentFrame}
          onUpdateItem={handleUpdateItem}
          onDeleteEffect={handleDeleteEffect}
        />
      </div>

      {/* ボトムバー */}
      <div className="ymm4-bottom-bar">
        <div className="ymm4-bottom-bar-left">
          <span className="ymm4-bottom-bar-item">
            ⏵ {currentFrame}
          </span>
          <span className="ymm4-bottom-bar-item">
            ⌚ {timeStr}
          </span>
        </div>
        <div className="ymm4-bottom-bar-right">
          <span className="ymm4-bottom-bar-item">
            FPS <span className="ymm4-bottom-bar-value">{project.settings.fps}</span>
          </span>
          <span className="ymm4-bottom-bar-item">
            解像度 <span className="ymm4-bottom-bar-value">{project.settings.width}×{project.settings.height}</span>
          </span>
          <span className="ymm4-bottom-bar-item">
            スナップ <span className="ymm4-bottom-bar-value">{snapFrames}f</span>
          </span>
          <span className="ymm4-bottom-bar-item">
            マーカー <span className="ymm4-bottom-bar-value">{markers.length}</span>
          </span>
        </div>
      </div>

      {/* 書き出しダイアログ */}
      <ExportDialog
        open={exportOpen}
        width={project.settings.width}
        height={project.settings.height}
        fps={project.settings.fps}
        totalFrames={project.settings.totalFrames}
        onClose={() => setExportOpen(false)}
        onExport={(settings) => {
          console.log('[Export] Settings:', settings)
          alert(`書き出し完了！\n形式: ${settings.format}\n解像度: ${settings.width}×${settings.height}\nFPS: ${settings.fps}`)
        }}
      />

      {/* 設定ダイアログ */}
      <SettingsDialog
        open={settingsOpen}
        settings={project.settings}
        onSave={(newSettings) => applyProjectUpdate(prev => ({ ...prev, settings: newSettings }), { recordHistory: false })}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
