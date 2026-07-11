import React, { useState } from 'react'

interface MediaItem {
  id: string
  name: string
  type: 'video' | 'audio' | 'image'
  icon: string
}

interface CharacterItem {
  id: string
  name: string
  engine: string
  avatar: string
  available: boolean
}

interface SceneItem {
  id: string
  name: string
  duration: number
}

interface LeftPanelProps {
  mediaItems: MediaItem[]
  characters: CharacterItem[]
  scenes: SceneItem[]
  activeSceneId: string | null
  onSelectScene: (id: string) => void
  onAddMedia: () => void
  onSelectCharacter: (id: string) => void
}

type LeftTab = 'media' | 'characters' | 'scenes'

export default function LeftPanel({
  mediaItems,
  characters,
  scenes,
  activeSceneId,
  onSelectScene,
  onAddMedia,
  onSelectCharacter,
}: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<LeftTab>('media')

  return (
    <div className="ymm4-left-panel">
      <div className="ymm4-panel-tabs">
        <div
          className={`ymm4-panel-tab ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => setActiveTab('media')}
        >
          📁 メディア
        </div>
        <div
          className={`ymm4-panel-tab ${activeTab === 'characters' ? 'active' : ''}`}
          onClick={() => setActiveTab('characters')}
        >
          👤 キャラ
        </div>
        <div
          className={`ymm4-panel-tab ${activeTab === 'scenes' ? 'active' : ''}`}
          onClick={() => setActiveTab('scenes')}
        >
          🎬 シーン
        </div>
      </div>

      <div className="ymm4-panel-content">
        {activeTab === 'media' && (
          <div>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <button
                className="ymm4-toolbar-btn"
                style={{ width: '100%', justifyContent: 'center', border: '1px dashed var(--ymm4-border)' }}
                onClick={onAddMedia}
              >
                ＋ メディアを追加
              </button>
            </div>
            {mediaItems.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ymm4-text-muted)', fontSize: 11 }}>
                メディアがありません
              </div>
            )}
            {mediaItems.map(item => (
              <div key={item.id} className="ymm4-media-item" draggable>
                <span className="media-icon">{item.icon}</span>
                <span className="media-name">{item.name}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'characters' && (
          <div>
            {characters.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ymm4-text-muted)', fontSize: 11 }}>
                キャラクターがありません
              </div>
            )}
            {characters.map(char => (
              <div
                key={char.id}
                className="ymm4-char-item"
                onClick={() => onSelectCharacter(char.id)}
              >
                <div className="char-avatar">{char.avatar}</div>
                <div className="char-info">
                  <div className="char-name">{char.name}</div>
                  <div className="char-engine">
                    {char.engine} {char.available ? '✅' : '❌'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'scenes' && (
          <div>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <button
                className="ymm4-toolbar-btn"
                style={{ width: '100%', justifyContent: 'center', border: '1px dashed var(--ymm4-border)' }}
              >
                ＋ シーンを追加
              </button>
            </div>
            {scenes.map(scene => (
              <div
                key={scene.id}
                className={`ymm4-scene-item ${activeSceneId === scene.id ? 'active' : ''}`}
                onClick={() => onSelectScene(scene.id)}
              >
                <span>🎬</span>
                <span style={{ flex: 1 }}>{scene.name}</span>
                <span style={{ fontSize: 10, color: 'var(--ymm4-text-muted)' }}>
                  {Math.floor(scene.duration / 30)}s
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
