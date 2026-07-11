import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { Project } from './models/timeline'
import { addSampleItem, addTrack, createDefaultProject, formatTime } from './models/timeline'
import { parseYmmp, serializeYmmp } from './parsers/ymmp'
import Timeline from './components/Timeline'
import { pluginManager } from './plugin/manager'
import { registerBuiltinEffects } from './engine/effect/effects/effects-index'
import { VoiceEngineManager } from './engine/voice/manager'
import { AviUtlInterpreter, ScriptFrameState } from './engine/script/aviutl-interpreter'
import { EffectPipeline } from './engine/effect/pipeline'

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
  const savePathRef = useRef<string | null>(null)
  const animFrameRef = useRef<number>(0)
  const lastTickRef = useRef(0)

  const timeStr = formatTime(currentFrame, project.settings.fps)

  // プラグインロード
  useEffect(() => {
    pluginManager.loadAll().then(() => {
      setPluginsLoaded(true)
      console.log(`[App] ${pluginManager.getVideoEffects().length} effects loaded`)
    })
  }, [])

  // 音声エンジン検出
  useEffect(() => {
    voiceEngine.getAvailableEngines().then(setVoiceEngines)
    const interval = setInterval(() => {
      voiceEngine.getAvailableEngines().then(setVoiceEngines)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault()
        setIsPlaying(prev => !prev)
      }
      if (e.key === 'Home') { e.preventDefault(); setCurrentFrame(0) }
      if (e.key === 'End') { e.preventDefault(); setCurrentFrame(project.settings.totalFrames - 1) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [project.settings.totalFrames])

  // Playback
  useEffect(() => {
    if (!isPlaying) { lastTickRef.current = 0; return }
    const fps = project.settings.fps
    const interval = 1000 / fps
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

  // Electron IPC
  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.onOpenProject(async (filePath: string) => {
      const content = await window.electronAPI!.readFile(filePath)
      if (content) {
        try {
          const loaded = parseYmmp(content)
          setProject(loaded); setCurrentFrame(0); savePathRef.current = filePath
        } catch (e) { console.error(e) }
      }
    })
  }, [])

  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.onSaveProject(async () => {
      const json = serializeYmmp(project)
      if (savePathRef.current) { await window.electronAPI!.writeFile(savePathRef.current, json) }
      else {
        const r = await window.electronAPI!.showSaveDialog()
        if (!r.canceled && r.filePath) { savePathRef.current = r.filePath; await window.electronAPI!.writeFile(r.filePath, json) }
      }
    })
    window.electronAPI.onSaveProjectAs(async (filePath: string) => {
      const json = serializeYmmp(project); savePathRef.current = filePath
      await window.electronAPI!.writeFile(filePath, json)
    })
  }, [project])

  const handleAddClip = useCallback((trackIndex: number) => setProject(prev => addSampleItem(prev, trackIndex)), [])
  const handleAddTrack = useCallback((type: 'video' | 'audio' | 'text') => setProject(prev => addTrack(prev, type)), [])
  const handleFrameChange = useCallback((frame: number) => setCurrentFrame(frame), [])
  const handlePlayPause = useCallback(() => setIsPlaying(prev => !prev), [])

  const handleMoveItem = useCallback((trackIndex: number, itemId: string, newStartFrame: number) => {
    setProject(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => i === trackIndex ? {
        ...t, items: t.items.map(item => item.id === itemId ? {
          ...item, startFrame: newStartFrame, endFrame: item.endFrame + (newStartFrame - item.startFrame)
        } : item)
      } : t),
    }))
  }, [])

  const handleExport = useCallback(() => {
    const json = serializeYmmp(project)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `${project.name}.ymmp`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }, [project])

  // 音声合成
  const handleSynthesize = useCallback(async () => {
    if (!voiceText.trim()) return
    try {
      await voiceEngine.preview(selectedEngine, voiceText, selectedStyle)
    } catch (e) {
      console.error('Voice synthesis failed:', e)
    }
  }, [voiceText, selectedEngine, selectedStyle])

  // AviUtl Script テスト実行
  const handleRunScript = useCallback(() => {
    const state = scriptRunner.evaluate('x = 100\ny = sin(frame * 10)\nalpha = 128', {
      frame: currentFrame, width: 1920, height: 1080,
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
      {/* Toolbar */}
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
        <div style={{ flex: 1 }} />
        <button className="toolbar-btn" onClick={() => { setProject(createDefaultProject()); savePathRef.current = null }}>📄 新規</button>
        <button className="toolbar-btn primary" onClick={handleExport}>💾 保存</button>
      </div>

      {/* Main content */}
      <div className="main-content">
        {/* Left Sidebar — Voice Plugin Panel */}
        {voicePanelOpen && (
          <div style={{
            width: 300, background: 'var(--claude-canvas)',
            borderRight: '1px solid var(--claude-hairline)', display: 'flex', flexDirection: 'column',
            flexShrink: 0, overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--claude-hairline)', fontWeight: 600, fontSize: 13 }}>
              🎤 音声合成
            </div>

            {/* Engine Selection */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--claude-hairline)' }}>
              <label style={{ fontSize: 11, color: 'var(--claude-muted)', display: 'block', marginBottom: 6 }}>エンジン</label>
              <select value={selectedEngine} onChange={e => setSelectedEngine(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--claude-hairline)', background: 'var(--claude-canvas)' }}>
                {voiceEngines.map(e => (
                  <option key={e.id} value={e.id} disabled={!e.available}>
                    {e.name} {e.available ? '✅' : '❌'}
                  </option>
                ))}
              </select>
            </div>

            {/* Speaker/Style Selection */}
            {engineInfo?.available && engineInfo.speakers.length > 0 && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--claude-hairline)' }}>
                <label style={{ fontSize: 11, color: 'var(--claude-muted)', display: 'block', marginBottom: 6 }}>話者・スタイル</label>
                <select value={selectedStyle} onChange={e => setSelectedStyle(Number(e.target.value))}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--claude-hairline)' }}>
                  {engineInfo.speakers.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.styleName})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Text Input */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--claude-hairline)', flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--claude-muted)', display: 'block', marginBottom: 6 }}>テキスト</label>
              <textarea value={voiceText} onChange={e => setVoiceText(e.target.value)}
                placeholder="こんにちは、ゆっくりしていってね！"
                style={{
                  width: '100%', height: 120, resize: 'none', padding: 8, borderRadius: 6,
                  border: '1px solid var(--claude-hairline)', fontFamily: 'inherit', fontSize: 13,
                  background: 'var(--claude-canvas)', color: 'var(--claude-ink)',
                }}
              />
              <button onClick={handleSynthesize}
                style={{
                  marginTop: 8, width: '100%', padding: '8px 16px', borderRadius: 6,
                  background: 'var(--claude-primary)', color: 'var(--claude-on-primary)',
                  border: 'none', fontWeight: 500, fontSize: 13, cursor: 'pointer',
                }}>
                ▶ プレビュー再生
              </button>
            </div>

            {/* Script Test */}
            <div style={{ padding: '12px 16px' }}>
              <button onClick={handleRunScript}
                style={{
                  width: '100%', padding: '6px 12px', borderRadius: 6,
                  background: 'transparent', border: '1px solid var(--claude-hairline)',
                  color: 'var(--claude-body)', fontSize: 12, cursor: 'pointer',
                }}>
                🧪 AviUtl Script テスト実行
              </button>
            </div>
          </div>
        )}

        {/* Center Panel */}
        <div className="center-panel">
          <div className="preview-panel">
            <div className="preview-canvas">
              <span className="preview-label">{project.settings.width} × {project.settings.height}</span>
            </div>
            <div className="preview-info">{timeStr}</div>
          </div>
          <Timeline project={project} currentFrame={currentFrame}
            onFrameChange={handleFrameChange} onAddClip={handleAddClip}
            onMoveItem={handleMoveItem} isPlaying={isPlaying} />
        </div>

        {/* Right Sidebar — Plugin Info / Effects */}
        {showPlugins && (
          <div style={{
            width: 280, background: 'var(--claude-canvas)',
            borderLeft: '1px solid var(--claude-hairline)', display: 'flex', flexDirection: 'column',
            flexShrink: 0, overflow: 'auto',
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
                padding: '10px 16px', borderBottom: '1px solid var(--claude-hairline)',
                fontSize: 12, color: 'var(--claude-body)',
              }}>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--claude-muted)' }}>{p.id} · {p.type}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
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
          <span className="bottom-bar-item">解像度: <span className="highlight">{project.settings.width}×{project.settings.height}</span></span>
        </div>
      </div>

      {/* Media Panel */}
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
