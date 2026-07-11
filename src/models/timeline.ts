// ============================================================
// YMM4互換 タイムラインデータモデル
// ============================================================

/** アイテムの種類 */
export type ItemType = 'video' | 'audio' | 'image' | 'text' | 'voice' | 'shape'

/** トラックの種類 */
export type TrackType = 'video' | 'audio' | 'text'

/** 変形情報 */
export interface Transform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
}

/** エフェクト */
export interface Effect {
  name: string
  params: Record<string, number | string | boolean>
}

export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce' | 'elastic'

/** キーフレーム */
export interface Keyframe {
  frame: number
  easing: EasingType
  properties: Partial<{
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
    opacity: number
    volume: number
  }>
}

/** タイムライン上のアイテム（クリップ） */
export interface TimelineItem {
  id: string
  groupId?: string
  name: string
  type: ItemType
  sourcePath?: string
  startFrame: number
  endFrame: number
  layer: number
  opacity: number
  volume: number
  transform: Transform
  effects: Effect[]
  keyframes: Keyframe[]
  text?: string
  voicePreset?: string
  color?: string
  appearAnimation?: string
  disappearAnimation?: string
}

/** トラック */
export interface Track {
  id: string
  name: string
  type: TrackType
  index: number
  mute: boolean
  solo: boolean
  locked: boolean
  visible: boolean
  volume: number
  items: TimelineItem[]
  color?: string
}

/** プロジェクト設定 */
export interface ProjectSettings {
  width: number
  height: number
  fps: number
  totalFrames: number
  audioSamplingRate: number
  backgroundColor: string
}

/** シーン */
export interface Scene {
  id: string
  name: string
  tracks: Track[]
}

/** プロジェクト全体 */
export interface Project {
  version: string
  name: string
  settings: ProjectSettings
  tracks: Track[]
  scenes: Scene[]
  activeSceneId: string
}

// ============================================================
// ヘルパー関数
// ============================================================

/** ユニークID生成 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/** フレーム → 秒 */
export function framesToSeconds(frame: number, fps: number): number {
  return frame / fps
}

/** 秒 → フレーム */
export function secondsToFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps)
}

/** 時間フォーマット (HH:MM:SS.FF) */
export function formatTime(frame: number, fps: number): string {
  const totalSeconds = framesToSeconds(frame, fps)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  const f = frame % fps
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${f.toString().padStart(2, '0')}`
}

/** 新規プロジェクトを作成 */
export function createDefaultProject(): Project {
  const s1Id = generateId()
  const tracks: Track[] = [
    {
      id: generateId(),
      name: '動画トラック 1',
      type: 'video',
      index: 0,
      mute: false,
      solo: false,
      locked: false,
      visible: true,
      volume: 1.0,
      items: [],
    },
    {
      id: generateId(),
      name: '音声トラック 1',
      type: 'audio',
      index: 1,
      mute: false,
      solo: false,
      locked: false,
      visible: true,
      volume: 1.0,
      items: [],
    },
    {
      id: generateId(),
      name: 'テキストトラック 1',
      type: 'text',
      index: 2,
      mute: false,
      solo: false,
      locked: false,
      visible: true,
      volume: 1.0,
      items: [],
    },
  ]
  return {
    version: '1.0',
    name: '無題のプロジェクト',
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      totalFrames: 9000,
      audioSamplingRate: 48000,
      backgroundColor: '#1a1a2e',
    },
    tracks,
    scenes: [{ id: s1Id, name: 'シーン 1', tracks: tracks.map(t => ({ ...t, items: [] })) }],
    activeSceneId: s1Id,
  }
}

/** サンプルアイテムを追加 */
export function addSampleItem(project: Project, trackIndex: number): Project {
  const track = project.tracks[trackIndex]
  if (!track) return project

  const lastFrame = track.items.reduce((max, item) => Math.max(max, item.endFrame), 0)
    const item: TimelineItem = {
    id: generateId(),
    name: `${track.name} クリップ ${track.items.length + 1}`,
    type: track.type === 'text' ? 'text' : track.type === 'audio' ? 'audio' : 'video',
    startFrame: lastFrame + 30,
    endFrame: lastFrame + 30 + 150, // 5秒
    layer: 0,
    opacity: 1.0,
    volume: 1.0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    keyframes: [],
    text: track.type === 'text' ? 'テキストサンプル' : undefined,
    color: track.color || getRandomColor(),
  }

  return {
    ...project,
    tracks: project.tracks.map((t, i) =>
      i === trackIndex ? { ...t, items: [...t.items, item] } : t
    ),
  }
}

const COLORS = [
  '#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8',
  '#4dd0e1', '#aed581', '#ffd54f', '#ff8a65', '#f06292',
]

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

/** アクティブシーンのトラックを取得 */
export function getActiveTracks(project: Project): Track[] {
  const scene = project.scenes.find(s => s.id === project.activeSceneId)
  if (scene) return scene.tracks
  return project.tracks
}

/** アクティブシーンを取得 */
export function getActiveScene(project: Project): Scene | null {
  return project.scenes.find(s => s.id === project.activeSceneId) ?? null
}

/** アクティブシーンのトラックを更新し、project.tracksも同期 */
export function updateActiveTracks(project: Project, updater: (tracks: Track[]) => Track[]): Project {
  const activeScene = project.scenes.find(s => s.id === project.activeSceneId)
  if (activeScene) {
    const newTracks = updater(activeScene.tracks)
    return {
      ...project,
      tracks: newTracks,
      scenes: project.scenes.map(s => s.id === project.activeSceneId ? { ...s, tracks: newTracks } : s),
    }
  }
  return { ...project, tracks: updater(project.tracks) }
}

/** シーンを追加 */
export function addScene(project: Project, name?: string): Project {
  const sceneTracks = project.tracks.map(t => ({
    ...t,
    items: [] as TimelineItem[],
  }))
  const scene: Scene = {
    id: generateId(),
    name: name || `シーン ${project.scenes.length + 1}`,
    tracks: sceneTracks,
  }
  return {
    ...project,
    scenes: [...project.scenes, scene],
    activeSceneId: scene.id,
    tracks: sceneTracks,
  }
}

/** シーンを削除 */
export function removeScene(project: Project, sceneId: string): Project {
  const remaining = project.scenes.filter(s => s.id !== sceneId)
  if (remaining.length === 0) return project
  const newActive = project.activeSceneId === sceneId ? remaining[remaining.length - 1].id : project.activeSceneId
  const newScene = remaining.find(s => s.id === newActive)!
  return {
    ...project,
    scenes: remaining,
    activeSceneId: newActive,
    tracks: newScene.tracks,
  }
}

/** シーン名を変更 */
export function renameScene(project: Project, sceneId: string, name: string): Project {
  return {
    ...project,
    scenes: project.scenes.map(s => s.id === sceneId ? { ...s, name } : s),
  }
}

/** シーンを複製 */
export function duplicateScene(project: Project, sceneId: string): Project {
  const source = project.scenes.find(s => s.id === sceneId)
  if (!source) return project
  const newScene: Scene = {
    id: generateId(),
    name: `${source.name} コピー`,
    tracks: JSON.parse(JSON.stringify(source.tracks)),
  }
  return {
    ...project,
    scenes: [...project.scenes, newScene],
    activeSceneId: newScene.id,
    tracks: newScene.tracks,
  }
}

/** シーンを切り替え */
export function switchScene(project: Project, sceneId: string): Project {
  if (project.activeSceneId === sceneId) return project
  const target = project.scenes.find(s => s.id === sceneId)
  if (!target) return project
  return {
    ...project,
    activeSceneId: sceneId,
    tracks: target.tracks,
  }
}

/** トラックを追加 */
export function addTrack(project: Project, type: TrackType): Project {
  const track: Track = {
    id: generateId(),
    name: `${type === 'video' ? '動画' : type === 'audio' ? '音声' : 'テキスト'}トラック ${project.tracks.filter(t => t.type === type).length + 1}`,
    type,
    index: project.tracks.length,
    mute: false,
    solo: false,
    locked: false,
    visible: true,
    volume: 1.0,
    items: [],
  }
  return { ...project, tracks: [...project.tracks, track] }
}
