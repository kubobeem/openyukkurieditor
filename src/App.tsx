import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { Project } from './models/timeline'
import { addSampleItem, addTrack, createDefaultProject, formatTime } from './models/timeline'
import { parseYmmp, serializeYmmp } from './parsers/ymmp'
import Timeline from './components/Timeline'

export default function App() {
  const [project, setProject] = useState<Project>(createDefaultProject)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const savePathRef = useRef<string | null>(null)
  const animFrameRef = useRef<number>(0)
  const lastTickRef = useRef(0)

  const timeStr = formatTime(currentFrame, project.settings.fps)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault()
        setIsPlaying(prev => !prev)
      }
      if (e.key === 'Home') {
        e.preventDefault()
        setCurrentFrame(0)
      }
      if (e.key === 'End') {
        e.preventDefault()
        setCurrentFrame(project.settings.totalFrames - 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [project.settings.totalFrames])

  // Playback using requestAnimationFrame for smooth redraws
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

  // Electron IPC: Open project
  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.onOpenProject(async (filePath: string) => {
      const content = await window.electronAPI!.readFile(filePath)
      if (content) {
        try {
          const loaded = parseYmmp(content)
          setProject(loaded)
          setCurrentFrame(0)
          savePathRef.current = filePath
        } catch (e) {
          console.error('Failed to parse project file:', e)
        }
      }
    })
  }, [])

  // Electron IPC: Save project
  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.onSaveProject(async () => {
      const json = serializeYmmp(project)
      if (savePathRef.current) {
        await window.electronAPI!.writeFile(savePathRef.current, json)
      } else {
        const result = await window.electronAPI!.showSaveDialog()
        if (!result.canceled && result.filePath) {
          savePathRef.current = result.filePath
          await window.electronAPI!.writeFile(result.filePath, json)
        }
      }
    })

    window.electronAPI.onSaveProjectAs(async (filePath: string) => {
      const json = serializeYmmp(project)
      savePathRef.current = filePath
      await window.electronAPI!.writeFile(filePath, json)
    })
  }, [project])

  const handleAddClip = useCallback((trackIndex: number) => {
    setProject(prev => addSampleItem(prev, trackIndex))
  }, [])

  const handleAddTrack = useCallback((type: 'video' | 'audio' | 'text') => {
    setProject(prev => addTrack(prev, type))
  }, [])

  const handleFrameChange = useCallback((frame: number) => {
    setCurrentFrame(frame)
  }, [])

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])

  // Move a clip item to a new start frame
  const handleMoveItem = useCallback((trackIndex: number, itemId: string, newStartFrame: number) => {
    setProject(prev => ({
      ...prev,
      tracks: prev.tracks.map((track, i) =>
        i === trackIndex
          ? {
              ...track,
              items: track.items.map(item =>
                item.id === itemId
                  ? {
                      ...item,
                      startFrame: newStartFrame,
                      endFrame: item.endFrame + (newStartFrame - item.startFrame),
                    }
                  : item
              ),
            }
          : track
      ),
    }))
  }, [])

  // Export/save project (download as .ymmp)
  const handleExport = useCallback(() => {
    const json = serializeYmmp(project)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}.ymmp`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [project])

  return (
    <div className="app-layout">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-title">
          Open Yukkuri Editor <span className="project-name">{project.name}</span>
        </div>

        <div className="toolbar-divider" />

        <button className="toolbar-btn" onClick={() => handleAddTrack('video')} title="動画トラックを追加">
          ＋ 動画
        </button>
        <button className="toolbar-btn" onClick={() => handleAddTrack('audio')} title="音声トラックを追加">
          ＋ 音声
        </button>
        <button className="toolbar-btn" onClick={() => handleAddTrack('text')} title="テキストトラックを追加">
          ＋ テキスト
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${mediaOpen ? 'primary' : ''}`}
          onClick={() => setMediaOpen(prev => !prev)}
        >
          📁 メディア
        </button>

        <div className="toolbar-spacer" style={{ flex: 1 }} />

        <button className="toolbar-btn" onClick={() => { setProject(createDefaultProject()); savePathRef.current = null }}>
          📄 新規
        </button>
        <button className="toolbar-btn primary" onClick={handleExport}>
          💾 保存
        </button>
      </div>

      {/* Main content area */}
      <div className="main-content">
        <div className="center-panel">
          {/* Preview */}
          <div className="preview-panel">
            <div className="preview-canvas">
              <span className="preview-label">
                {project.settings.width} × {project.settings.height}
              </span>
            </div>
            <div className="preview-info">
              {timeStr}
            </div>
          </div>

          {/* Timeline */}
          <Timeline
            project={project}
            currentFrame={currentFrame}
            onFrameChange={handleFrameChange}
            onAddClip={handleAddClip}
            onMoveItem={handleMoveItem}
            isPlaying={isPlaying}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="bottom-bar">
        <div className="bottom-bar-left">
          <div className="playback-controls">
            <button className="playback-btn" onClick={() => setCurrentFrame(0)} title="先頭に戻る">⏮</button>
            <button className={`playback-btn play ${isPlaying ? 'active' : ''}`} onClick={handlePlayPause}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="playback-btn" onClick={() => setCurrentFrame(prev => Math.max(0, prev - project.settings.fps))} title="1秒戻る">⏪</button>
            <button className="playback-btn" onClick={() => setCurrentFrame(prev => Math.min(project.settings.totalFrames - 1, prev + project.settings.fps))} title="1秒進む">⏩</button>
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
