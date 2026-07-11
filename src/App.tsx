import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { Project, TimelineItem, TrackType } from './models/timeline'
import { addSampleItem, addTrack, createDefaultProject, formatTime, generateId } from './models/timeline'
import { parseYmmp, serializeYmmp } from './parsers/ymmp'
import Timeline from './components/Timeline'
import { pluginManager } from './plugin/manager'
import { registerBuiltinEffects } from './engine/effect/effects/effects-index'
import { VoiceEngineManager } from './engine/voice/manager'
import { AviUtlInterpreter, ScriptFrameState } from './engine/script/aviutl-interpreter'
import { EffectPipeline } from './engine/effect/pipeline'

type SelectedClip = {
  trackIndex: number
  itemId: string
}

type ProjectHistory = {
  past: Project[]
  future: Project[]
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function cloneTimelineItem(item: TimelineItem): TimelineItem {
  return {
    ...item,
    transform: { ...item.transform },
    effects: item.effects.map(effect => ({ ...effect, params: { ...effect.params } })),
    keyframes: item.keyframes.map(keyframe => ({ ...keyframe, properties: { ...keyframe.properties } })),
  }
}

function trackTypeForItem(item: TimelineItem): TrackType {
  if (item.type === 'audio' || item.type === 'voice') return 'audio'
  if (item.type === 'text') return 'text'
  return 'video'
}

// プラグインとエンジンの初期化
registerBuiltinEffects()
const voiceEngine = new VoiceEngineManager()
voiceEngine.registerDefaults()
const scriptRunner = new AviUtlInterpreter()
const effectPipeline = new EffectPipeline()

export default function App() {
  const [project, setProject] = useState<Project>(createDefaultProject)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const [voiceEngines, setVoiceEngines] = useState<any[]>([])
  const [selectedEngine, setSelectedEngine] = useState('voicevox')
  const [selectedStyle, setSelectedStyle] = useState(0)
  const [pluginsLoaded, setPluginsLoaded] = useState(false)
  const [showPlugins, setShowPlugins] = useState(false)
  const [selectedClip, setSelectedClip] = useState<SelectedClip | null>(null)
  const [snapFrames, setSnapFrames] = useState(1)
  const [markers, setMarkers] = useState<number[]>([])
  const savePathRef = useRef<string | null>(null)
  const animFrameRef = useRef<number>(0)
  const lastTickRef = useRef(0)
  const projectRef = useRef(project)
  const historyRef = useRef<ProjectHistory>({ past: [], future: [] })
  const clipClipboardRef = useRef<TimelineItem | null>(null)

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
        if (historyRef.current.past.length > 120) {
          historyRef.current.past.shift()
        }
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

  useEffect(() => {
    projectRef.current = project
  }, [project])

  useEffect(() => {
    if (!selectedClip) return
    const track = project.tracks[selectedClip.trackIndex]
    const exists = !!track?.items.some(item => item.id === selectedClip.itemId)
    if (!exists) {
      setSelectedClip(null)
    }
  }, [project, selectedClip])

  const timeStr = formatTime(currentFrame, project.settings.fps)

  useEffect(() => {
    pluginManager.loadAll().then(() => {
      setPluginsLoaded(true)
      console.log(`[App] ${pluginManager.getVideoEffects().length} effects loaded`)
    })
    return () => pluginManager.destroyAll()
  }, [])

  useEffect(() => {
    return () => voiceEngine.dispose()
  }, [])

  useEffect(() => {
    voiceEngine.getAvailableEngines().then(setVoiceEngines)
    const interval = setInterval(() => {
      voiceEngine.getAvailableEngines().then(setVoiceEngines)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleSaveProject = useCallback(async (explicitPath?: string) => {
    const json = serializeYmmp(projectRef.current)

    if (window.electronAPI) {
      if (explicitPath) {
        savePathRef.current = explicitPath
        await window.electronAPI.writeFile(explicitPath, json)
        return
      }

      if (savePathRef.current) {
        await window.electronAPI.writeFile(savePathRef.current, json)
        return
      }

      const result = await window.electronAPI.showSaveDialog()
      if (!result.canceled && result.filePath) {
        savePathRef.current = result.filePath
        await window.electronAPI.writeFile(result.filePath, json)
      }
      return
    }

    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectRef.current.name}.ymmp`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  const getSelectedItem = useCallback(() => {
    if (!selectedClip) return null
    const track = projectRef.current.tracks[selectedClip.trackIndex]
    if (!track) return null
    const item = track.items.find(candidate => candidate.id === selectedClip.itemId)
    if (!item) return null
    return { trackIndex: selectedClip.trackIndex, item }
  }, [selectedClip])

  const handleMoveItem = useCallback((trackIndex: number, itemId: string, newStartFrame: number) => {
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => {
        if (i !== trackIndex || track.locked) return track
        return {
          ...track,
          items: track.items.map(item => item.id === itemId ? {
            ...item,
            startFrame: newStartFrame,
            endFrame: item.endFrame + (newStartFrame - item.startFrame),
          } : item),
        }
      }),
    }))
  }, [applyProjectUpdate])

  const handleDeleteSelectedClip = useCallback(() => {
    if (!selectedClip) return
    let deleted = false
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => {
        if (i !== selectedClip.trackIndex || track.locked) return track
        const nextItems = track.items.filter(item => item.id !== selectedClip.itemId)
        deleted = nextItems.length !== track.items.length
        return deleted ? { ...track, items: nextItems } : track
      }),
    }))
    if (deleted) setSelectedClip(null)
  }, [applyProjectUpdate, selectedClip])

  const handleNudgeSelectedClip = useCallback((deltaFrames: number) => {
    if (!selectedClip) return
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => {
        if (i !== selectedClip.trackIndex || track.locked) return track
        return {
          ...track,
          items: track.items.map(item => {
            if (item.id !== selectedClip.itemId) return item
            const duration = item.endFrame - item.startFrame
            const maxStart = Math.max(0, prev.settings.totalFrames - duration)
            const startFrame = Math.max(0, Math.min(maxStart, item.startFrame + deltaFrames))
            const moved = startFrame - item.startFrame
            return moved === 0 ? item : { ...item, startFrame, endFrame: item.endFrame + moved }
          }),
        }
      }),
    }))
  }, [applyProjectUpdate, selectedClip])

  const handleDuplicateSelectedClip = useCallback(() => {
    if (!selectedClip) return
    let nextSelection: SelectedClip | null = null
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => {
        if (i !== selectedClip.trackIndex || track.locked) return track
        const source = track.items.find(item => item.id === selectedClip.itemId)
        if (!source) return track
        const duration = source.endFrame - source.startFrame
        const gap = Math.max(1, Math.round(prev.settings.fps / 6))
        const maxStart = Math.max(0, prev.settings.totalFrames - duration)
        const startFrame = Math.max(0, Math.min(maxStart, source.endFrame + gap))
        const duplicate = {
          ...cloneTimelineItem(source),
          id: generateId(),
          name: `${source.name} コピー`,
          startFrame,
          endFrame: startFrame + duration,
        }
        nextSelection = { trackIndex: i, itemId: duplicate.id }
        return { ...track, items: [...track.items, duplicate] }
      }),
    }))
    if (nextSelection) setSelectedClip(nextSelection)
  }, [applyProjectUpdate, selectedClip])

  const handleCopySelectedClip = useCallback(() => {
    const selected = getSelectedItem()
    if (!selected) return
    clipClipboardRef.current = cloneTimelineItem(selected.item)
  }, [getSelectedItem])

  const handleCutSelectedClip = useCallback(() => {
    const selected = getSelectedItem()
    if (!selected) return
    clipClipboardRef.current = cloneTimelineItem(selected.item)
    handleDeleteSelectedClip()
  }, [getSelectedItem, handleDeleteSelectedClip])

  const handlePasteClip = useCallback(() => {
    const clipboardItem = clipClipboardRef.current
    if (!clipboardItem) return

    const copied = cloneTimelineItem(clipboardItem)
    let nextSelection: SelectedClip | null = null

    applyProjectUpdate(prev => {
      const desiredTrackType = trackTypeForItem(copied)
      const selectedTrack = selectedClip ? prev.tracks[selectedClip.trackIndex] : null
      let targetTrackIndex = -1

      if (
        selectedClip &&
        selectedTrack &&
        !selectedTrack.locked &&
        selectedTrack.type === desiredTrackType
      ) {
        targetTrackIndex = selectedClip.trackIndex
      } else {
        targetTrackIndex = prev.tracks.findIndex(track => !track.locked && track.type === desiredTrackType)
      }

      if (targetTrackIndex < 0) {
        targetTrackIndex = prev.tracks.findIndex(track => !track.locked)
      }
      if (targetTrackIndex < 0) return prev

      const duration = copied.endFrame - copied.startFrame
      const maxStart = Math.max(0, prev.settings.totalFrames - duration)
      const startFrame = Math.max(0, Math.min(maxStart, currentFrame))
      const pasted: TimelineItem = {
        ...copied,
        id: generateId(),
        startFrame,
        endFrame: startFrame + duration,
      }

      nextSelection = { trackIndex: targetTrackIndex, itemId: pasted.id }
      return {
        ...prev,
        tracks: prev.tracks.map((track, i) =>
          i === targetTrackIndex ? { ...track, items: [...track.items, pasted] } : track
        ),
      }
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
      tracks: prev.tracks.map((track, i) => {
        if (i !== selectedClip.trackIndex || track.locked) return track
        const target = track.items.find(item => item.id === selectedClip.itemId)
        if (!target) return track
        const duration = target.endFrame - target.startFrame
        const items = track.items
          .filter(item => item.id !== selectedClip.itemId)
          .map(item => item.startFrame >= target.endFrame
            ? {
              ...item,
              startFrame: Math.max(0, item.startFrame - duration),
              endFrame: Math.max(0, item.endFrame - duration),
            }
            : item)
        return { ...track, items }
      }),
    }))
    setSelectedClip(null)
  }, [applyProjectUpdate, selectedClip])

  const handleSplitSelectedClip = useCallback(() => {
    const selected = getSelectedItem()
    if (!selected) return
    const { trackIndex, item } = selected
    if (currentFrame <= item.startFrame || currentFrame >= item.endFrame) return

    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => {
        if (i !== trackIndex || track.locked) return track
        return {
          ...track,
          items: track.items.flatMap(existing => {
            if (existing.id !== item.id) return [existing]
            const left: TimelineItem = { ...existing, endFrame: currentFrame }
            const right: TimelineItem = {
              ...cloneTimelineItem(existing),
              id: generateId(),
              name: `${existing.name} B`,
              startFrame: currentFrame,
            }
            return [left, right]
          }),
        }
      }),
    }))
  }, [applyProjectUpdate, currentFrame, getSelectedItem])

  const handleToggleMarkerAtCurrentFrame = useCallback(() => {
    setMarkers(prev => prev.includes(currentFrame)
      ? prev.filter(marker => marker !== currentFrame)
      : [...prev, currentFrame].sort((a, b) => a - b))
  }, [currentFrame])

  const jumpToMarker = useCallback((direction: 1 | -1) => {
    if (markers.length === 0) return
    if (direction > 0) {
      const next = markers.find(marker => marker > currentFrame)
      setCurrentFrame(next ?? markers[0])
      return
    }
    const prevMarkers = markers.filter(marker => marker < currentFrame)
    setCurrentFrame(prevMarkers.length > 0 ? prevMarkers[prevMarkers.length - 1] : markers[markers.length - 1])
  }, [currentFrame, markers])

  const selectAdjacentClip = useCallback((direction: 1 | -1) => {
    const tracks = projectRef.current.tracks
    if (tracks.length === 0) return

    if (!selectedClip) {
      for (let ti = 0; ti < tracks.length; ti += 1) {
        if (tracks[ti].items.length > 0) {
          setSelectedClip({ trackIndex: ti, itemId: tracks[ti].items[0].id })
          return
        }
      }
      return
    }

    const track = tracks[selectedClip.trackIndex]
    if (!track || track.items.length === 0) return
    const sorted = [...track.items].sort((a, b) => a.startFrame - b.startFrame)
    const index = sorted.findIndex(item => item.id === selectedClip.itemId)
    if (index < 0) return
    const nextIndex = Math.max(0, Math.min(sorted.length - 1, index + direction))
    const nextItem = sorted[nextIndex]
    setSelectedClip({ trackIndex: selectedClip.trackIndex, itemId: nextItem.id })
    setCurrentFrame(nextItem.startFrame)
  }, [selectedClip])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (isMeta && key === 's') {
        e.preventDefault()
        void handleSaveProject()
        return
      }

      if (isEditableTarget(e.target)) return

      if (isMeta && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
        return
      }

      if (isMeta && key === 'y') {
        e.preventDefault()
        handleRedo()
        return
      }

      if (isMeta && key === 'c') {
        const selected = getSelectedItem()
        if (!selected) return
        e.preventDefault()
        handleCopySelectedClip()
        return
      }

      if (isMeta && key === 'x') {
        const selected = getSelectedItem()
        if (!selected) return
        e.preventDefault()
        handleCutSelectedClip()
        return
      }

      if (isMeta && key === 'v') {
        e.preventDefault()
        handlePasteClip()
        return
      }

      if (isMeta && key === 'd') {
        e.preventDefault()
        handleDuplicateSelectedClip()
        return
      }

      if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        handleRippleDeleteSelectedClip()
        return
      }

      if (isMeta && e.key === 'ArrowLeft') {
        e.preventDefault()
        handleNudgeSelectedClip(e.shiftKey ? -10 : -1)
        return
      }

      if (isMeta && e.key === 'ArrowRight') {
        e.preventDefault()
        handleNudgeSelectedClip(e.shiftKey ? 10 : 1)
        return
      }

      if (key === 'n') {
        e.preventDefault()
        cycleSnapFrames()
        return
      }

      if (key === 's') {
        e.preventDefault()
        handleSplitSelectedClip()
        return
      }

      if (key === 'm') {
        e.preventDefault()
        handleToggleMarkerAtCurrentFrame()
        return
      }

      if (key === ',') {
        e.preventDefault()
        jumpToMarker(-1)
        return
      }

      if (key === '.') {
        e.preventDefault()
        jumpToMarker(1)
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        handleDeleteSelectedClip()
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        setIsPlaying(prev => !prev)
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentFrame(prev => clampFrame(prev - (e.shiftKey ? 10 : 1)))
        return
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setCurrentFrame(prev => clampFrame(prev + (e.shiftKey ? 10 : 1)))
        return
      }

      if (e.key === 'PageUp') {
        e.preventDefault()
        setCurrentFrame(prev => clampFrame(prev - projectRef.current.settings.fps))
        return
      }

      if (e.key === 'PageDown') {
        e.preventDefault()
        setCurrentFrame(prev => clampFrame(prev + projectRef.current.settings.fps))
        return
      }

      if (e.key === '[') {
        e.preventDefault()
        selectAdjacentClip(-1)
        return
      }

      if (e.key === ']') {
        e.preventDefault()
        selectAdjacentClip(1)
        return
      }

      if (e.key === 'Home') {
        e.preventDefault()
        setCurrentFrame(0)
        return
      }

      if (e.key === 'End') {
        e.preventDefault()
        setCurrentFrame(projectRef.current.settings.totalFrames - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    clampFrame,
    cycleSnapFrames,
    getSelectedItem,
    handleCopySelectedClip,
    handleCutSelectedClip,
    handleDeleteSelectedClip,
    handleDuplicateSelectedClip,
    handleNudgeSelectedClip,
    handlePasteClip,
    handleRippleDeleteSelectedClip,
    handleSplitSelectedClip,
    handleToggleMarkerAtCurrentFrame,
    handleRedo,
    handleSaveProject,
    handleUndo,
    jumpToMarker,
    selectAdjacentClip,
  ])

  useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = 0
      return
    }
    const fps = project.settings.fps
    const interval = 1000 / fps
    lastTickRef.current = performance.now()
    const tick = (now: number) => {
      const delta = now - lastTickRef.current
      if (delta >= interval) {
        lastTickRef.current = now - (delta % interval)
        setCurrentFrame(prev => {
          const next = prev + Math.floor(delta / interval)
          if (next >= project.settings.totalFrames) {
            setIsPlaying(false)
            return 0
          }
          return next
        })
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isPlaying, project.settings.fps, project.settings.totalFrames])

  useEffect(() => {
    if (!window.electronAPI) return
    const disposeOpen = window.electronAPI.onOpenProject(async (filePath: string) => {
      const content = await window.electronAPI!.readFile(filePath)
      if (!content) return
      try {
        const loaded = parseYmmp(content)
        setProject(loaded)
        setCurrentFrame(0)
        setSelectedClip(null)
        setMarkers([])
        setIsPlaying(false)
        savePathRef.current = filePath
        clearHistory()
      } catch (e) {
        console.error(e)
      }
    })
    return disposeOpen
  }, [clearHistory])

  useEffect(() => {
    if (!window.electronAPI) return
    const disposeSave = window.electronAPI.onSaveProject(() => {
      void handleSaveProject()
    })
    const disposeSaveAs = window.electronAPI.onSaveProjectAs((filePath: string) => {
      void handleSaveProject(filePath)
    })
    return () => {
      disposeSave()
      disposeSaveAs()
    }
  }, [handleSaveProject])

  const handleAddClip = useCallback((trackIndex: number) => {
    applyProjectUpdate(prev => {
      if (!prev.tracks[trackIndex] || prev.tracks[trackIndex].locked) return prev
      return addSampleItem(prev, trackIndex)
    })
  }, [applyProjectUpdate])

  const handleAddTrack = useCallback((type: 'video' | 'audio' | 'text') => {
    applyProjectUpdate(prev => addTrack(prev, type))
  }, [applyProjectUpdate])

  const handleFrameChange = useCallback((frame: number) => {
    setCurrentFrame(clampFrame(frame))
  }, [clampFrame])

  const handlePlayPause = useCallback(() => setIsPlaying(prev => !prev), [])

  const handleToggleTrackMute = useCallback((trackIndex: number) => {
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i === trackIndex ? { ...track, mute: !track.mute } : track),
    }))
  }, [applyProjectUpdate])

  const handleToggleTrackLock = useCallback((trackIndex: number) => {
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i === trackIndex ? { ...track, locked: !track.locked } : track),
    }))
  }, [applyProjectUpdate])

  const handleToggleTrackSolo = useCallback((trackIndex: number) => {
    applyProjectUpdate(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => i === trackIndex ? { ...track, solo: !track.solo } : track),
    }))
  }, [applyProjectUpdate])

  const handleSynthesize = useCallback(async () => {
    if (!voiceText.trim()) return
    try {
      await voiceEngine.preview(selectedEngine, voiceText, selectedStyle)
    } catch (e) {
      console.error('Voice synthesis failed:', e)
    }
  }, [voiceText, selectedEngine, selectedStyle])

  const handleRunScript = useCallback(() => {
    const state = scriptRunner.evaluate('x = 100\ny = sin(frame * 10)\nalpha = 128', {
      frame: currentFrame,
      width: 1920,
      height: 1080,
    } as ScriptFrameState)
    console.log('[Script] Result:', state.x, state.y, state.alpha)
  }, [currentFrame])

  const engineInfo = voiceEngines.find(e => e.id === selectedEngine)
  const plugins = [
    ...pluginManager.getVideoEffects().map(e => ({ name: e.meta.name, id: e.meta.id, type: 'effect' })),
    ...pluginManager.getVoicePlugins().map(e => ({ name: e.meta.name, id: e.meta.id, type: 'voice' })),
  ]

  return (
    <div className="app-layout">
      <div className="toolbar">
        <div className="toolbar-title">
          <span className="brand-mark">OE</span>
          Open Yukkuri Editor
          <span className="project-name">{project.name}</span>
        </div>
        <div className="toolbar-divider" />
        <button className="toolbar-btn" onClick={() => handleAddTrack('video')}>＋ 動画</button>
        <button className="toolbar-btn" onClick={() => handleAddTrack('audio')}>＋ 音声</button>
        <button className="toolbar-btn" onClick={() => handleAddTrack('text')}>＋ テキスト</button>
        <div className="toolbar-divider" />
        <button className={`toolbar-btn ${mediaOpen ? 'primary' : ''}`} onClick={() => setMediaOpen(p => !p)}>📁 メディア</button>
        <button className={`toolbar-btn ${voicePanelOpen ? 'primary' : ''}`} onClick={() => setVoicePanelOpen(p => !p)}>🎤 VOICEVOX</button>
        <button className="toolbar-btn" onClick={() => setShowPlugins(p => !p)}>🔌 プラグイン({plugins.length})</button>
        <button className="toolbar-btn" onClick={handleUndo}>↶ Undo</button>
        <button className="toolbar-btn" onClick={handleRedo}>↷ Redo</button>
        <button className="toolbar-btn" onClick={cycleSnapFrames}>🧲 スナップ({snapFrames}f)</button>
        <div style={{ flex: 1 }} />
        <button
          className="toolbar-btn"
          onClick={() => {
            setProject(createDefaultProject())
            setCurrentFrame(0)
            setSelectedClip(null)
            setMarkers([])
            setIsPlaying(false)
            savePathRef.current = null
            clearHistory()
          }}
        >
          📄 新規
        </button>
        <button className="toolbar-btn primary" onClick={() => void handleSaveProject()}>💾 保存</button>
      </div>

      <div className="main-content">
        {voicePanelOpen && (
          <div style={{
            width: 300,
            background: 'var(--claude-canvas)',
            borderRight: '1px solid var(--claude-hairline)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--claude-hairline)', fontWeight: 600, fontSize: 13 }}>
              🎤 音声合成
            </div>

            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--claude-hairline)' }}>
              <label style={{ fontSize: 11, color: 'var(--claude-muted)', display: 'block', marginBottom: 6 }}>エンジン</label>
              <select
                value={selectedEngine}
                onChange={e => setSelectedEngine(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--claude-hairline)', background: 'var(--claude-canvas)' }}
              >
                {voiceEngines.map(e => (
                  <option key={e.id} value={e.id} disabled={!e.available}>
                    {e.name} {e.available ? '✅' : '❌'}
                  </option>
                ))}
              </select>
            </div>

            {engineInfo?.available && engineInfo.speakers.length > 0 && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--claude-hairline)' }}>
                <label style={{ fontSize: 11, color: 'var(--claude-muted)', display: 'block', marginBottom: 6 }}>話者・スタイル</label>
                <select
                  value={selectedStyle}
                  onChange={e => setSelectedStyle(Number(e.target.value))}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--claude-hairline)' }}
                >
                  {engineInfo.speakers.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.styleName})</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--claude-hairline)', flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--claude-muted)', display: 'block', marginBottom: 6 }}>テキスト</label>
              <textarea
                value={voiceText}
                onChange={e => setVoiceText(e.target.value)}
                placeholder="こんにちは、ゆっくりしていってね！"
                style={{
                  width: '100%',
                  height: 120,
                  resize: 'none',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid var(--claude-hairline)',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  background: 'var(--claude-canvas)',
                  color: 'var(--claude-ink)',
                }}
              />
              <button
                onClick={handleSynthesize}
                style={{
                  marginTop: 8,
                  width: '100%',
                  padding: '8px 16px',
                  borderRadius: 6,
                  background: 'var(--claude-primary)',
                  color: 'var(--claude-on-primary)',
                  border: 'none',
                  fontWeight: 500,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                ▶ プレビュー再生
              </button>
            </div>

            <div style={{ padding: '12px 16px' }}>
              <button
                onClick={handleRunScript}
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  borderRadius: 6,
                  background: 'transparent',
                  border: '1px solid var(--claude-hairline)',
                  color: 'var(--claude-body)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                🧪 AviUtl Script テスト実行
              </button>
            </div>
          </div>
        )}

        <div className="center-panel">
          <div className="preview-panel">
            <div className="preview-canvas">
              <span className="preview-label">{project.settings.width} × {project.settings.height}</span>
            </div>
            <div className="preview-info">{timeStr}</div>
          </div>
          <Timeline
            project={project}
            currentFrame={currentFrame}
            onFrameChange={handleFrameChange}
            onAddClip={handleAddClip}
            onMoveItem={handleMoveItem}
            isPlaying={isPlaying}
            snapFrames={snapFrames}
            markers={markers}
            selectedItemId={selectedClip?.itemId ?? null}
            onSelectItem={(trackIndex, itemId) => {
              if (!itemId) {
                setSelectedClip(null)
                return
              }
              setSelectedClip({ trackIndex, itemId })
            }}
            onToggleTrackMute={handleToggleTrackMute}
            onToggleTrackLock={handleToggleTrackLock}
            onToggleTrackSolo={handleToggleTrackSolo}
          />
        </div>

        {showPlugins && (
          <div style={{
            width: 280,
            background: 'var(--claude-canvas)',
            borderLeft: '1px solid var(--claude-hairline)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            overflow: 'auto',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--claude-hairline)', fontWeight: 600, fontSize: 13 }}>
              🔌 プラグイン ({plugins.length})
            </div>
            {plugins.length === 0 && !pluginsLoaded && (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--claude-muted)' }}>
                プラグインをロード中...
              </div>
            )}
            {plugins.map(p => (
              <div key={p.id} style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--claude-hairline)',
                fontSize: 12,
                color: 'var(--claude-body)',
              }}>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--claude-muted)' }}>{p.id} · {p.type}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bottom-bar">
        <div className="bottom-bar-left">
          <div className="playback-controls">
            <button className="playback-btn" onClick={() => setCurrentFrame(0)}>⏮</button>
            <button className={`playback-btn play ${isPlaying ? 'active' : ''}`} onClick={handlePlayPause}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="playback-btn" onClick={() => setCurrentFrame(prev => Math.max(0, prev - project.settings.fps))}>⏪</button>
            <button className="playback-btn" onClick={() => setCurrentFrame(prev => Math.min(project.settings.totalFrames - 1, prev + project.settings.fps))}>⏩</button>
          </div>
        </div>
        <div className="bottom-bar-right">
          <span className="bottom-bar-item">フレーム: <span className="highlight">{currentFrame}</span></span>
          <span className="bottom-bar-item">時間: <span className="highlight">{timeStr}</span></span>
          <span className="bottom-bar-item">FPS: <span className="highlight">{project.settings.fps}</span></span>
          <span className="bottom-bar-item">スナップ: <span className="highlight">{snapFrames}f</span></span>
          <span className="bottom-bar-item">マーカー: <span className="highlight">{markers.length}</span></span>
          <span className="bottom-bar-item">解像度: <span className="highlight">{project.settings.width}×{project.settings.height}</span></span>
        </div>
      </div>

      <div className={`media-panel ${mediaOpen ? 'open' : ''}`}>
        <div className="media-panel-header">
          <span>メディアライブラリ</span>
          <button className="toolbar-btn" style={{ padding: '2px 8px', fontSize: 11 }}>＋ メディアを追加</button>
        </div>
        <div className="media-panel-body">
          <div className="media-item">🎬 サンプル動画</div>
          <div className="media-item">🎵 サンプル音声</div>
          <div className="media-item">🖼 サンプル画像</div>
        </div>
      </div>
    </div>
  )
}
