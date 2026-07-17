// ============================================================
// YMM4 (.ymmp) パーサー / シリアライザー
// ============================================================
//
// 実際のYMM4 .ymmp JSON形式に完全対応。
// 内部エディタモデル ↔ YMM4形式の相互変換を行う。
//
// ============================================================

import type { Project, Track, TimelineItem, TrackType, ItemType, Effect } from '../models/timeline'
import { generateId } from '../models/timeline'

// ---- YMM4 Raw JSON Structure ----
// 実際のYMM4 .ymmpファイルの構造に基づく

export interface YmmpAnimationValue {
  From: number
  To: number
  AnimationType: string
  Span: number
}

interface YmmpRawEffect {
  Name: string
  IsEnabled: boolean
  Params?: Record<string, unknown>
  [_key: string]: unknown
}

interface YmmpRawItem {
  $type: string
  Group: number
  Frame: number
  Layer: number
  Length: number
  PlaybackRate: number
  ContentOffset: string
  Remark: string
  IsLocked: boolean
  IsHidden: boolean
  FilePath: string
  X: YmmpAnimationValue
  Y: YmmpAnimationValue
  Opacity: YmmpAnimationValue
  Zoom: YmmpAnimationValue
  Rotation: YmmpAnimationValue
  FadeIn: number
  FadeOut: number
  Blend: string
  IsInverted: boolean
  IsAlwaysOnTop: boolean
  VideoEffects: YmmpRawEffect[]
  KeyFrames: unknown[]

  // VoiceItem 固有
  IsWaveformEnabled?: boolean
  CharacterName?: string
  Serif?: string
  Decorations?: unknown[]
  Hatsuon?: string
  VoiceLength?: string
  AudioFile?: string

  [_key: string]: unknown
}

interface YmmpRawTimeline {
  ID: string
  Name: string
  VideoInfo: {
    FPS: number
    Hz: number
    Width: number
    Height: number
  }
  Items: YmmpRawItem[]
  VerticalLine?: {
    IsEnabled: boolean
    StartFrame: number
    LineType: string
    Line: Record<string, unknown>
    Group: number
  }
  LayerVisibilities?: {
    HiddenLayers: number[]
  }
  CurrentFrame: number
  Length: number
  MaxLayer: number
  [_key: string]: unknown
}

export interface YmmpRawProject {
  _?: string
  FilePath: string
  SelectedTimelineIndex: number
  Timelines: YmmpRawTimeline[]
  Characters: unknown[]
  CollapsedGroups: Record<string, unknown>
  LayoutXml: string
  ToolStates: Record<string, unknown>
  [_key: string]: unknown
}

// ---- ユーティリティ ----

const YMM4_ITEM_TYPE_MAP: Record<string, ItemType> = {
  'YukkuriMovieMaker.Project.Items.VideoItem, YukkuriMovieMaker': 'video',
  'YukkuriMovieMaker.Project.Items.ImageItem, YukkuriMovieMaker': 'image',
  'YukkuriMovieMaker.Project.Items.AudioItem, YukkuriMovieMaker': 'audio',
  'YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker': 'voice',
  'YukkuriMovieMaker.Project.Items.TextItem, YukkuriMovieMaker': 'text',
}

const INTERNAL_TO_YMM4_TYPE: Record<string, string> = {
  'video': 'YukkuriMovieMaker.Project.Items.VideoItem, YukkuriMovieMaker',
  'image': 'YukkuriMovieMaker.Project.Items.ImageItem, YukkuriMovieMaker',
  'audio': 'YukkuriMovieMaker.Project.Items.AudioItem, YukkuriMovieMaker',
  'voice': 'YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker',
  'text': 'YukkuriMovieMaker.Project.Items.TextItem, YukkuriMovieMaker',
  'shape': 'YukkuriMovieMaker.Project.Items.ImageItem, YukkuriMovieMaker',
}

function detectItemType($type: string): ItemType {
  return YMM4_ITEM_TYPE_MAP[$type] || 'video'
}

function getYmmpType(itemType: ItemType): string {
  return INTERNAL_TO_YMM4_TYPE[itemType] || 'YukkuriMovieMaker.Project.Items.VideoItem, YukkuriMovieMaker'
}

function itemTypeToTrackType(type: ItemType): TrackType {
  if (type === 'audio' || type === 'voice') return 'audio'
  if (type === 'text') return 'text'
  return 'video'
}

// ---- YMM4 → 内部モデル パース ----

function parseAnimValue(val: unknown): YmmpAnimationValue {
  if (val && typeof val === 'object' && 'From' in (val as any)) {
    return val as YmmpAnimationValue
  }
  return { From: Number(val) || 0, To: 0, AnimationType: 'なし', Span: 0 }
}

function parseYmmpItem(raw: YmmpRawItem): TimelineItem {
  const itemType = detectItemType(raw.$type)
  const isVoice = itemType === 'voice'

  // YMM4のOpacityは 0-100, Zoomは 100=等倍
  const opacityVal = (parseAnimValue(raw.Opacity).From) / 100
  const zoomVal = (parseAnimValue(raw.Zoom).From) / 100

  return {
    id: generateId(),
    name: raw.Remark || raw.FilePath?.split(/[\\/]/).pop() || `アイテム`,
    type: itemType,
    sourcePath: raw.FilePath || undefined,
    startFrame: raw.Frame ?? 0,
    endFrame: (raw.Frame ?? 0) + (raw.Length ?? 150),
    layer: raw.Layer ?? 0,
    opacity: Math.max(0, Math.min(1, opacityVal)),
    volume: 1.0,
    transform: {
      x: parseAnimValue(raw.X).From,
      y: parseAnimValue(raw.Y).From,
      scaleX: zoomVal,
      scaleY: zoomVal,
      rotation: parseAnimValue(raw.Rotation).From,
    },
    effects: (raw.VideoEffects || []).map(e => ({
      name: e.Name || 'unknown',
      params: { ...(e.Params || {}), enabled: e.IsEnabled !== false },
    })),
    keyframes: [],
    text: raw.Serif || (itemType === 'text' ? undefined : undefined),
    voicePreset: isVoice ? raw.CharacterName || undefined : undefined,
    color: undefined,
    appearAnimation: raw.FadeIn && raw.FadeIn > 0 ? 'fadeIn' : undefined,
    disappearAnimation: raw.FadeOut && raw.FadeOut > 0 ? 'fadeOut' : undefined,
    // 生データを保存（ラウンドトリップ用）
    _rawYmmpItem: raw as unknown as Record<string, unknown>,
  }
}

function groupItemsIntoTracks(items: TimelineItem[]): Track[] {
  const videoItems = items.filter(i => itemTypeToTrackType(i.type) === 'video').sort((a, b) => a.startFrame - b.startFrame || a.layer - b.layer)
  const audioItems = items.filter(i => itemTypeToTrackType(i.type) === 'audio').sort((a, b) => a.startFrame - b.startFrame || a.layer - b.layer)
  const textItems = items.filter(i => itemTypeToTrackType(i.type) === 'text').sort((a, b) => a.startFrame - b.startFrame || a.layer - b.layer)

  const tracks: Track[] = []

  if (videoItems.length > 0) {
    tracks.push({
      id: generateId(),
      name: '動画トラック',
      type: 'video',
      index: tracks.length,
      mute: false,
      solo: false,
      locked: false,
      visible: true,
      volume: 1.0,
      items: videoItems,
    })
  }

  if (audioItems.length > 0) {
    tracks.push({
      id: generateId(),
      name: '音声トラック',
      type: 'audio',
      index: tracks.length,
      mute: false,
      solo: false,
      locked: false,
      visible: true,
      volume: 1.0,
      items: audioItems,
    })
  }

  if (textItems.length > 0) {
    tracks.push({
      id: generateId(),
      name: 'テキストトラック',
      type: 'text',
      index: tracks.length,
      mute: false,
      solo: false,
      locked: false,
      visible: true,
      volume: 1.0,
      items: textItems,
    })
  }

  if (tracks.length === 0) {
    tracks.push({
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
    })
  }

  return tracks
}

export function parseYmmp(jsonString: string): Project {
  try {
    const raw: YmmpRawProject = JSON.parse(jsonString)
    const projectName = raw.FilePath?.split(/[\\/]/).pop()?.replace(/\.ymmp$/, '') || 'プロジェクト'

    const timeline = raw.Timelines?.[0]
    const videoInfo = timeline?.VideoInfo || { FPS: 30, Hz: 48000, Width: 1920, Height: 1080 }

    const allTimelines = (raw.Timelines || []).map((tl: YmmpRawTimeline) => {
      const items = (tl.Items || []).map(parseYmmpItem)
      return { id: tl.ID || generateId(), name: tl.Name || 'シーン', items }
    })

    const scenes = allTimelines.map((tl, i) => {
      const tracks = groupItemsIntoTracks(tl.items)
      return { id: tl.id, name: tl.name || `シーン ${i + 1}`, tracks }
    })

    const firstTracks = scenes.length > 0 ? scenes[0].tracks : groupItemsIntoTracks([])

    const project: Project = {
      version: '4.0',
      name: projectName,
      settings: {
        width: videoInfo.Width ?? 1920,
        height: videoInfo.Height ?? 1080,
        fps: videoInfo.FPS ?? 30,
        totalFrames: timeline?.Length ?? 9000,
        audioSamplingRate: videoInfo.Hz ?? 48000,
        backgroundColor: '#000000',
      },
      tracks: firstTracks,
      scenes,
      activeSceneId: scenes.length > 0 ? scenes[0].id : generateId(),
      // 生データを保存（ラウンドトリップ用）
      _rawYmmp: raw as unknown as Record<string, unknown>,
      _layoutXml: raw.LayoutXml || undefined,
      _toolStates: raw.ToolStates || undefined,
      _characters: raw.Characters || undefined,
      _collapsedGroups: raw.CollapsedGroups || undefined,
    }

    return project
  } catch (e) {
    throw new Error(`YMM4ファイルの解析に失敗しました: ${e}`)
  }
}

export async function readYmmpFile(filePath: string): Promise<Project> {
  throw new Error('ファイルの読み込みはElectronのIPC経由で行います')
}

// ---- 内部モデル → YMM4 シリアライズ ----

function serializeTransformValue(value: number, raw?: Record<string, unknown>): YmmpAnimationValue {
  if (raw && 'From' in raw && 'To' in raw) {
    return {
      From: value,
      To: (raw.To as number) ?? value,
      AnimationType: (raw.AnimationType as string) || 'なし',
      Span: (raw.Span as number) || 0,
    }
  }
  return { From: value, To: value, AnimationType: 'なし', Span: 0 }
}

function serializeItem(item: TimelineItem): YmmpRawItem {
  const $type = getYmmpType(item.type)
  const length = Math.max(1, item.endFrame - item.startFrame)

  // 生データがあればそれをベースに上書き（ラウンドトリップ）
  const raw = item._rawYmmpItem as Record<string, unknown> | undefined

  const base: YmmpRawItem = {
    $type,
    Group: (raw?.Group as number) ?? 0,
    Frame: item.startFrame,
    Layer: item.layer,
    Length: length,
    PlaybackRate: (raw?.PlaybackRate as number) ?? 100.0,
    ContentOffset: (raw?.ContentOffset as string) ?? '00:00:00',
    Remark: item.name,
    IsLocked: (raw?.IsLocked as boolean) ?? false,
    IsHidden: (raw?.IsHidden as boolean) ?? false,
    FilePath: item.sourcePath || '',
    X: serializeTransformValue(item.transform.x, raw?.X as Record<string, unknown> | undefined),
    Y: serializeTransformValue(item.transform.y, raw?.Y as Record<string, unknown> | undefined),
    Opacity: serializeTransformValue(item.opacity * 100, raw?.Opacity as Record<string, unknown> | undefined),
    Zoom: serializeTransformValue(item.transform.scaleX * 100, raw?.Zoom as Record<string, unknown> | undefined),
    Rotation: serializeTransformValue(item.transform.rotation, raw?.Rotation as Record<string, unknown> | undefined),
    FadeIn: item.appearAnimation === 'fadeIn' ? 15 : 0,
    FadeOut: item.disappearAnimation === 'fadeOut' ? 15 : 0,
    Blend: (raw?.Blend as string) || 'Normal',
    IsInverted: (raw?.IsInverted as boolean) ?? false,
    IsAlwaysOnTop: (raw?.IsAlwaysOnTop as boolean) ?? false,
    VideoEffects: item.effects.map(e => ({
      Name: e.name,
      IsEnabled: e.params.enabled !== false,
      Params: Object.fromEntries(Object.entries(e.params).filter(([k]) => k !== 'enabled')),
    })),
    KeyFrames: (raw?.KeyFrames as unknown[]) || [],
  }

  if (item.type === 'voice') {
    base.IsWaveformEnabled = (raw?.IsWaveformEnabled as boolean) ?? false
    base.CharacterName = item.voicePreset || ''
    base.Serif = item.text || ''
    base.Decorations = (raw?.Decorations as unknown[]) || []
    base.Hatsuon = (raw?.Hatsuon as string) || ''
    base.VoiceLength = (raw?.VoiceLength as string) || '00:00:00'
    base.AudioFile = (raw?.AudioFile as string) || ''
  }

  // ラウンドトリップ: 生データにあってマッピングされていないフィールドを維持
  if (raw) {
    const mappedKeys = new Set([
      '$type', 'Group', 'Frame', 'Layer', 'Length', 'PlaybackRate', 'ContentOffset',
      'Remark', 'IsLocked', 'IsHidden', 'FilePath', 'X', 'Y', 'Opacity', 'Zoom', 'Rotation',
      'FadeIn', 'FadeOut', 'Blend', 'IsInverted', 'IsAlwaysOnTop', 'VideoEffects', 'KeyFrames',
      'IsWaveformEnabled', 'CharacterName', 'Serif', 'Decorations', 'Hatsuon', 'VoiceLength', 'AudioFile',
    ])
    for (const [key, val] of Object.entries(raw)) {
      if (!mappedKeys.has(key)) {
        (base as any)[key] = val
      }
    }
  }

  return base
}

function serializeTimeline(scene: { id: string; name: string; tracks: Track[] }, timelineIndex: number, projectSettings: Project['settings']): YmmpRawTimeline {
  const allItems: TimelineItem[] = []
  for (const track of scene.tracks) {
    for (const item of track.items) {
      allItems.push(item)
    }
  }

  allItems.sort((a, b) => {
    if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame
    return a.layer - b.layer
  })

  let maxLayer = 0
  for (const item of allItems) {
    if (item.layer > maxLayer) maxLayer = item.layer
  }

  let maxEnd = 0
  for (const item of allItems) {
    if (item.endFrame > maxEnd) maxEnd = item.endFrame
  }

  return {
    ID: scene.id,
    Name: scene.name,
    VideoInfo: {
      FPS: projectSettings.fps,
      Hz: projectSettings.audioSamplingRate,
      Width: projectSettings.width,
      Height: projectSettings.height,
    },
    Items: allItems.map(serializeItem),
    LayerVisibilities: {
      HiddenLayers: [],
    },
    CurrentFrame: 0,
    Length: Math.max(projectSettings.totalFrames, maxEnd),
    MaxLayer: maxLayer,
  }
}

export function serializeYmmp(project: Project): string {
  const settings = project.settings

  // ラウンドトリップ: 生データがあればそれをベースに上書き
  const raw = project._rawYmmp as Record<string, unknown> | undefined

  const baseProject: YmmpRawProject = {
    _: (raw?._ as string) || undefined,
    FilePath: (raw?.FilePath as string) || '',
    SelectedTimelineIndex: (raw?.SelectedTimelineIndex as number) || 1,
    Timelines: project.scenes.map((scene, i) =>
      serializeTimeline(scene, i, settings)
    ),
    Characters: (raw?.Characters as unknown[]) || (project._characters as unknown[]) || [],
    CollapsedGroups: (raw?.CollapsedGroups as Record<string, unknown>) || project._collapsedGroups || {},
    LayoutXml: (raw?.LayoutXml as string) || project._layoutXml || '',
    ToolStates: (raw?.ToolStates as Record<string, unknown>) || project._toolStates || {},
  }

  // ラウンドトリップ: 生データにあってマッピングされていないフィールドを維持
  if (raw) {
    const mappedKeys = new Set([
      '_', 'FilePath', 'SelectedTimelineIndex', 'Timelines',
      'Characters', 'CollapsedGroups', 'LayoutXml', 'ToolStates',
    ])
    for (const [key, val] of Object.entries(raw)) {
      if (!mappedKeys.has(key)) {
        (baseProject as any)[key] = val
      }
    }
  }

  return JSON.stringify(baseProject, null, 2)
}

export function saveYmmpFile(project: Project, filePath: string): void {
  const json = serializeYmmp(project)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.name}.ymmp`
  a.click()
  URL.revokeObjectURL(url)
}
