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

/** キーフレーム */
export interface Keyframe {
  frame: number
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

/** プロジェクト全体 */
export interface Project {
  version: string
  name: string
  settings: ProjectSettings
  tracks: Track[]
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
  return {
    version: '1.0',
    name: '無題のプロジェクト',
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      totalFrames: 9000, // 5分
      audioSamplingRate: 48000,
      backgroundColor: '#1a1a2e',
    },
    tracks: [
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
    ],
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
    color: getRandomColor(),
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
