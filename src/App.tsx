import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { Project, TimelineItem, TrackType } from './models/timeline'
import { addSampleItem, addTrack, createDefaultProject, formatTime, generateId, addScene, removeScene, renameScene, duplicateScene, switchScene } from './models/timeline'
import { parseYmmp, serializeYmmp } from './parsers/ymmp'
import { pluginManager } from './plugin/manager'
import { registerBuiltinEffects } from './engine/effect/effects/effects-index'
import { VoiceEngineManager } from './engine/voice/manager'
import { mediaManager } from './engine/media/manager'
import { AviUtlInterpreter, ScriptFrameState } from './engine/script/aviutl-interpreter'
import { EffectPipeline } from './engine/effect/pipeline'
import Timeline from './components/Timeline'
import MenuBar from './components/MenuBar'
import type { MenuGroup } from './components/MenuBar'
import LeftPanel from './components/LeftPanel'
import ItemPropertiesPanel from './components/ItemPropertiesPanel'
import PreviewCanvas from './components/PreviewCanvas'
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

function loadCustomShortcuts(): Record<string, string> {
  try {
    const raw = localStorage.getItem('oye_shortcuts')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function checkCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split('+')
  const key = parts.pop() || ''
  const hasCtrl = parts.includes('Ctrl')
  const hasShift = parts.includes('Shift')
  const hasAlt = parts.includes('Alt')
  const isMeta = e.ctrlKey || e.metaKey
  return (
    hasCtrl === isMeta &&
    hasShift === e.shiftKey &&
    hasAlt === e.altKey &&
    (e.key === key || e.code === key || e.key.toUpperCase() === key.toUpperCase())
  )
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

  // --- レイアウト ---
  const [leftPanelWidth, setLeftPanelWidth] = useState(240)
  const [rightPanelWidth, setRightPanelWidth] = useState(320)
  const [timelineHeight, setTimelineHeight] = useState(280)
  const resizingRef = useRef<{ type: 'left' | 'right' | 'timeline'; startX: number; startY: number; startW: number; startH: number } | null>(null)

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

  useEffect(() => { return () => { voiceEngine.dispose(); mediaManager.dispose() } }, [])

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
      // Sync tracks back to active scene
      const sceneIdx = next.scenes.findIndex(s => s.id === next.activeSceneId)
      let synced = next
      if (sceneIdx >= 0) {
        const scenes = [...next.scenes]
        scenes[sceneIdx] = { ...scenes[sceneIdx], tracks: next.tracks }
        synced = { ...next, scenes }
      }
      if (options?.recordHistory !== false) {
        historyRef.current.past.push(prev)
        if (historyRef.current.past.length > 120) historyRef.current.past.shift()
        historyRef.current.future = []
      }
      return synced
    })
  }, [])

  const syncTracksToScene = useCallback((p: Project): Project => {
    const sceneIdx = p.scenes.findIndex(s => s.id === p.activeSceneId)
    if (sceneIdx >= 0) {
      const scenes = [...p.scenes]
      scenes[sceneIdx] = { ...scenes[sceneIdx], tracks: p.tracks }
      return { ...p, scenes }
    }
    return p
  }, [])

  const handleUndo = useCallback(() => {
    setProject(prev => {
      const previous = historyRef.current.past.pop()
      if (!previous) return prev
      historyRef.current.future.push(prev)
      return syncTracksToScene(previous)
    })
  }, [syncTracksToScene])

  const handleRedo = useCallback(() => {
    setProject(prev => {
      const next = historyRef.current.future.pop()
      if (!next) return prev
      historyRef.current.past.push(prev)
      return syncTracksToScene(next)
    })
  }, [syncTracksToScene])

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

  // --- グループ化 / 解除 ---
  const handleGroupItems = useCallback((itemIds: string[]) => {
    if (itemIds.length < 2) return
    const groupId = generateId()
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => ({
        ...track,
        items: track.items.map(item => itemIds.includes(item.id) ? { ...item, groupId } : item),
      })),
    }))
  }, [applyProjectUpdate])

  const handleUngroupItems = useCallback((groupIds: string[]) => {
    if (groupIds.length === 0) return
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => ({
        ...track,
        items: track.items.map(item => groupIds.includes(item.groupId || '') ? { ...item, groupId: undefined } : item),
      })),
    }))
  }, [applyProjectUpdate])

  // --- キーボードショートカット ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return

      // Check custom shortcuts from localStorage first (read fresh on every keystroke)
      const customShortcuts = loadCustomShortcuts()
      for (const [action, combo] of Object.entries(customShortcuts)) {
        if (checkCombo(e, combo)) {
          e.preventDefault()
          switch (action) {
            case 'save': void handleSaveProject(); return
            case 'undo': handleUndo(); return
            case 'redo': handleRedo(); return
            case 'copy': const s = getSelectedItem(); if (s) handleCopySelectedClip(); return
            case 'cut': handleCutSelectedClip(); return
            case 'paste': handlePasteClip(); return
            case 'duplicate': handleDuplicateSelectedClip(); return
            case 'delete': handleDeleteSelectedClip(); return
            case 'rippleDelete': handleRippleDeleteSelectedClip(); return
            case 'split': handleSplitSelectedClip(); return
            case 'playPause': setIsPlaying(prev => !prev); return
            case 'toggleMarker': handleToggleMarkerAtCurrentFrame(); return
            case 'prevMarker': jumpToMarker(-1); return
            case 'nextMarker': jumpToMarker(1); return
            case 'toggleSnap': cycleSnapFrames(); return
            case 'prevClip': selectAdjacentClip(-1); return
            case 'nextClip': selectAdjacentClip(1); return
            case 'home': setCurrentFrame(0); return
            case 'end': setCurrentFrame(projectRef.current.settings.totalFrames - 1); return
            case 'group': handleGroupItems(selectedItemIds); return
            case 'ungroup': { const gIds = [...new Set(projectRef.current.tracks.reduce<string[]>((acc, t) => { t.items.forEach(item => { if (selectedItemIds.includes(item.id) && item.groupId) acc.push(item.groupId!) }); return acc }, []))]; handleUngroupItems(gIds); return }
          }
          break
        }
      }

      const isMeta = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (isMeta && key === 'n') { e.preventDefault(); handleNewProject(); return }
      if (isMeta && key === 'o') { e.preventDefault(); /* open dialog - handled by Electron */ return }
      if (isMeta && key === 's') { e.preventDefault(); e.shiftKey ? (savePathRef.current ? void handleSaveProject(savePathRef.current) : void handleSaveProject()) : void handleSaveProject(); return }
      if (isMeta && key === 'z') { e.preventDefault(); e.shiftKey ? handleRedo() : handleUndo(); return }
      if (isMeta && key === 'y') { e.preventDefault(); handleRedo(); return }
      if (isMeta && key === 'c') { const s = getSelectedItem(); if (s) { e.preventDefault(); handleCopySelectedClip() } return }
      if (isMeta && key === 'x') { const s = getSelectedItem(); if (s) { e.preventDefault(); handleCutSelectedClip() } return }
      if (isMeta && key === 'v') { e.preventDefault(); handlePasteClip(); return }
      if (isMeta && key === 'd') { e.preventDefault(); handleDuplicateSelectedClip(); return }
      if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); handleRippleDeleteSelectedClip(); return }
      if (isMeta && e.key === 'g') { e.preventDefault(); getSelectedItem() && handleGroupItems(selectedItemIds); return }
      if (isMeta && e.shiftKey && e.key === 'g') { e.preventDefault(); const gIds = selectedItemIds.length > 0 ? [...new Set(projectRef.current.tracks.reduce<string[]>((acc, t) => { t.items.forEach(item => { if (selectedItemIds.includes(item.id) && item.groupId) acc.push(item.groupId!) }); return acc }, []))] : []; handleUngroupItems(gIds); return }
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
    handleDeleteSelectedClip, handleDuplicateSelectedClip, handleGroupItems, handleNudge, handlePasteClip,
    handleRippleDeleteSelectedClip, handleSplitSelectedClip, handleToggleMarkerAtCurrentFrame,
    handleNewProject, handleRedo, handleSaveProject, handleUndo, jumpToMarker, selectAdjacentClip, selectedClip,
    selectedItemIds, handleUngroupItems,
  ])

  // --- 再生ループ ---
  useEffect(() => {
    if (!isPlaying) { lastTickRef.current = 0; mediaManager.stopAllAudio(); return }
    const fps = project.settings.fps; const interval = 1000 / fps
    const playedClips = new Set<string>()
    lastTickRef.current = performance.now()

    // 直近のフレームより先にある音声クリップをキューする
    const playAudioAtFrame = (frame: number) => {
      for (const track of projectRef.current.tracks) {
        if (track.mute) continue
        for (const item of track.items) {
          if (item.type !== 'audio' && item.type !== 'voice') continue
          if (playedClips.has(item.id)) continue
          if (item.sourcePath && frame >= item.startFrame && frame < item.endFrame) {
            const startSec = (frame - item.startFrame) / fps
            const durSec = (item.endFrame - item.startFrame) / fps
            mediaManager.playAudio(item.sourcePath, startSec, durSec, item.volume * track.volume)
            playedClips.add(item.id)
          }
        }
      }
    }

    const tick = (now: number) => {
      const delta = now - lastTickRef.current
      if (delta >= interval) {
        lastTickRef.current = now - (delta % interval)
        setCurrentFrame(prev => {
          const next = prev + Math.floor(delta / interval)
          playAudioAtFrame(next)
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

  const handleChangeTrackColor = useCallback((trackIndex: number, color: string) => {
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => i === trackIndex ? { ...t, color } : t),
    }))
  }, [applyProjectUpdate])

  // --- シーン管理 ---
  const handleAddScene = useCallback(() => {
    applyProjectUpdate(prev => addScene(prev))
  }, [applyProjectUpdate])

  const handleRemoveScene = useCallback((sceneId: string) => {
    if (project.scenes.length <= 1) return
    applyProjectUpdate(prev => removeScene(prev, sceneId))
    setSelectedClip(null)
  }, [applyProjectUpdate, project.scenes.length])

  const handleRenameScene = useCallback((sceneId: string, name: string) => {
    applyProjectUpdate(prev => renameScene(prev, sceneId, name), { recordHistory: false })
  }, [applyProjectUpdate])

  const handleDuplicateScene = useCallback((sceneId: string) => {
    applyProjectUpdate(prev => duplicateScene(prev, sceneId))
  }, [applyProjectUpdate])

  const handleSwitchScene = useCallback((sceneId: string) => {
    if (sceneId === project.activeSceneId) return
    applyProjectUpdate(prev => switchScene(prev, sceneId))
    setSelectedClip(null)
    setSelectedItemIds([])
  }, [applyProjectUpdate, project.activeSceneId])

  // --- メディア管理 ---
  interface MediaEntry { id: string; name: string; type: 'video' | 'audio' | 'image'; icon: string; path?: string }
  const [mediaItems, setMediaItems] = useState<MediaEntry[]>([
    { id: 'm1', name: 'サンプル動画.mp4', type: 'video', icon: '🎬' },
    { id: 'm2', name: 'サンプル音声.wav', type: 'audio', icon: '🎵' },
    { id: 'm3', name: 'サンプル画像.png', type: 'image', icon: '🖼' },
  ])

  const importMediaFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    let type: 'video' | 'audio' | 'image' = 'video'
    let icon = '🎬'
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext || '')) { type = 'audio'; icon = '🎵' }
    else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext || '')) { type = 'image'; icon = '🖼' }
    else if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv'].includes(ext || '')) { type = 'video'; icon = '🎬' }
    const filePath = (file as any).path || file.name
    setMediaItems(prev => {
      if (prev.some(m => m.name === file.name && m.path === filePath)) return prev
      return [...prev, { id: generateId(), name: file.name, type, icon, path: filePath }]
    })
  }, [])

  const characters = [
    { id: 'default', name: 'デフォルト', engine: 'voicevox', avatar: '😀', available: true },
    { id: 'zundamon', name: 'ずんだもん', engine: 'voicevox', avatar: '🌿', available: true },
    { id: 'tsumugi', name: '紡音つむぎ', engine: 'aivoice', avatar: '🎤', available: false },
  ]

  const scenesForLeft = project.scenes.map(s => ({
    id: s.id,
    name: s.name,
    duration: 9000,
  }))

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
        <div className="ymm4-toolbar-separator" />
        <button className="ymm4-toolbar-btn" onClick={() => { setCurrentFrame(0); setIsPlaying(false) }} title="先頭に戻る">⏮</button>
        <button className={`ymm4-toolbar-btn ${isPlaying ? 'active' : ''}`} onClick={() => setIsPlaying(prev => !prev)} title={isPlaying ? '停止' : '再生'}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="ymm4-toolbar-btn" onClick={() => setCurrentFrame(project.settings.totalFrames - 1)} title="末尾に移動">⏭</button>
        <span className="ymm4-bottom-bar-item" style={{ fontSize: 12, fontFamily: 'Consolas, monospace', marginLeft: 8 }}>
          {timeStr}
        </span>
        <button className={`ymm4-toolbar-btn ${snapFrames > 1 ? 'active' : ''}`} onClick={cycleSnapFrames}>
          🧲 {snapFrames}f
        </button>
        <div className="ymm4-toolbar-spacer" />
        <button className="ymm4-toolbar-btn" onClick={() => setExportOpen(true)}>📹 書き出し</button>
        <button className="ymm4-toolbar-btn" onClick={() => setSettingsOpen(true)}>⚙ 設定</button>
      </div>

      {/* メインエリア */}
      <div
        className="ymm4-main-area"
        style={{ '--left-panel-width': `${leftPanelWidth}px`, '--right-panel-width': `${rightPanelWidth}px`, '--timeline-height': `${timelineHeight}px` } as React.CSSProperties}
        onMouseMove={(e) => {
          const r = resizingRef.current
          if (!r) return
          if (r.type === 'left') {
            setLeftPanelWidth(Math.max(140, Math.min(500, r.startW + (e.clientX - r.startX))))
          } else if (r.type === 'right') {
            setRightPanelWidth(Math.max(200, Math.min(500, r.startW - (e.clientX - r.startX))))
          } else if (r.type === 'timeline') {
            const ch = e.currentTarget.clientHeight
            const maxH = ch - 100
            setTimelineHeight(Math.max(100, Math.min(maxH, r.startH + (r.startY - e.clientY))))
          }
        }}
        onMouseUp={() => { resizingRef.current = null }}
        onMouseLeave={() => { resizingRef.current = null }}
      >
        {/* 左パネルリサイズハンドル */}
        <div
          className="ymm4-resize-handle ymm4-resize-handle-left"
          onMouseDown={(e) => {
            e.preventDefault()
            resizingRef.current = { type: 'left', startX: e.clientX, startY: 0, startW: leftPanelWidth, startH: 0 }
          }}
        />
        <LeftPanel
          mediaItems={mediaItems}
          characters={characters}
          scenes={scenesForLeft}
          activeSceneId={project.activeSceneId}
          onSelectScene={handleSwitchScene}
          onAddScene={handleAddScene}
          onRemoveScene={handleRemoveScene}
          onRenameScene={handleRenameScene}
          onDuplicateScene={handleDuplicateScene}
          onAddMedia={() => {}}
          onSelectCharacter={setCurrentCharacterId}
          onImportMedia={(file) => importMediaFile(file)}
          onDropMedia={(files) => {
            for (let i = 0; i < files.length; i++) importMediaFile(files[i])
          }}
          mediaItemOnDragStart={(id, name, type) => {
            (window as any).__dragMedia = { id, name, type }
          }}
        />

        {/* 中央（プレビュー + セリフ入力） */}
        <div className="ymm4-center-area">
          <div className="ymm4-preview-area">
            <PreviewCanvas
              project={project}
              currentFrame={currentFrame}
              selectedItemId={selectedClip?.itemId ?? null}
              isPlaying={isPlaying}
            />
          </div>

          {/* セリフ入力 */}
          <SerifInput
            currentCharacterId={currentCharacterId}
            characters={characters}
            onSelectCharacter={setCurrentCharacterId}
            onAddSerif={handleAddSerif}
          />

          {/* タイムラインリサイズハンドル */}
          <div
            className="ymm4-resize-handle ymm4-resize-handle-timeline"
            onMouseDown={(e) => {
              e.preventDefault()
              const center = (e.currentTarget as HTMLElement).parentElement
              const wrapper = center?.querySelector('.ymm4-timeline-wrapper') as HTMLElement
              resizingRef.current = { type: 'timeline', startX: 0, startY: e.clientY, startW: 0, startH: wrapper?.offsetHeight || timelineHeight }
            }}
          />

          {/* タイムライン */}
          <div className="ymm4-timeline-wrapper" style={{ height: timelineHeight }}>
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
              onGroupItems={handleGroupItems}
              onUngroupItems={handleUngroupItems}
              onToggleTrackMute={handleToggleTrackMute}
              onToggleTrackLock={handleToggleTrackLock}
              onToggleTrackSolo={handleToggleTrackSolo}
              onChangeTrackColor={handleChangeTrackColor}
              onDropMediaItem={(_trackIndex, mediaName, mediaType, startFrame) => {
                const duration = project.settings.fps * 5
                const itemType = mediaType === 'audio' ? 'audio' as const : mediaType === 'image' ? 'image' as const : 'video' as const
                const clipName = mediaName.replace(/\.[^.]+$/, '')
                const sourcePath = mediaName.startsWith('http') || mediaName.includes(':\\') ? mediaName : undefined
                applyProjectUpdate(prev => {
                  const targetTrackType: TrackType = itemType === 'audio' ? 'audio' : 'video'
                  let targetIdx = prev.tracks.findIndex(t => t.type === targetTrackType && !t.locked)
                  if (targetIdx < 0) {
                    const newTrack = {
                      id: generateId(),
                      name: targetTrackType === 'video' ? '動画トラック' : '音声トラック',
                      type: targetTrackType as TrackType,
                      index: prev.tracks.length,
                      mute: false, solo: false, locked: false, visible: true, volume: 1.0,
                      items: [],
                    }
                    targetIdx = prev.tracks.length
                    return { ...prev, tracks: [...prev.tracks, { ...newTrack, items: [{
                      id: generateId(), name: clipName, type: itemType, sourcePath: sourcePath || mediaName,
                      startFrame, endFrame: startFrame + duration, layer: 0, opacity: 1, volume: 1,
                      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                      effects: [], keyframes: [],
                      color: ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8'][0],
                    }] }] }
                  }
                  return {
                    ...prev,
                    tracks: prev.tracks.map((t, i) => i !== targetIdx ? t : {
                      ...t,
                      items: [...t.items, {
                        id: generateId(), name: clipName, type: itemType, sourcePath: sourcePath || mediaName,
                        startFrame, endFrame: startFrame + duration, layer: 0, opacity: 1, volume: 1,
                        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                        effects: [], keyframes: [],
                        color: ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8'][t.items.length % 5],
                      }],
                    }),
                  }
                })
              }}
            />
          </div>
          {/* タイムラインリサイズハンドル（下部） */}
          <div
            className="ymm4-resize-handle ymm4-resize-handle-timeline-bottom"
            onMouseDown={(e) => {
              e.preventDefault()
              const center = (e.currentTarget as HTMLElement).parentElement
              const wrapper = center?.querySelector('.ymm4-timeline-wrapper') as HTMLElement
              resizingRef.current = { type: 'timeline', startX: 0, startY: e.clientY, startW: 0, startH: wrapper?.offsetHeight || timelineHeight }
            }}
          />
        </div>

        {/* 右パネルリサイズハンドル */}
        <div
          className="ymm4-resize-handle ymm4-resize-handle-right"
          onMouseDown={(e) => {
            e.preventDefault()
            resizingRef.current = { type: 'right', startX: e.clientX, startY: 0, startW: rightPanelWidth, startH: 0 }
          }}
        />
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
          <span className="ymm4-bottom-bar-item" style={{ fontFamily: 'Consolas, monospace' }}>
            f{currentFrame} / {project.settings.totalFrames}
          </span>
          <span className="ymm4-bottom-bar-item" style={{ fontFamily: 'Consolas, monospace' }}>
            {timeStr}
          </span>
        </div>
        <div className="ymm4-bottom-bar-right">
          <button className="ymm4-toolbar-btn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setCurrentFrame(0)} title="先頭">⏮</button>
          <button className={`ymm4-toolbar-btn ${isPlaying ? 'active' : ''}`} style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setIsPlaying(prev => !prev)} title={isPlaying ? '停止' : '再生'}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="ymm4-toolbar-btn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setCurrentFrame(project.settings.totalFrames - 1)} title="末尾">⏭</button>
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
