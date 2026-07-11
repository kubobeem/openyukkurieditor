// ============================================================
// YMM4 (.ymmp) パーサー / シリアライザー
// ============================================================
//
// .ymmp ファイルは JSON 形式。このモジュールは YMM4 の
// プロジェクトファイルを読み込み、内部モデルに変換する。
// また、内部モデルから .ymmp フォーマットにエクスポートする。
//
// ============================================================

import type { Project, Track, TimelineItem, TrackType, ItemType } from '../models/timeline'
import { generateId } from '../models/timeline'

// ---- YMM4 Raw JSON Structure ----
// 実際の .ymmp は想定される構造にマッピング

interface YmmpRawProject {
  version?: string
  name?: string
  width?: number
  height?: number
  fps?: number
  totalFrame?: number
  samplingRate?: number
  bgColor?: string
  tracks?: YmmpRawTrack[]
  scenes?: YmmpRawScene[]
}

interface YmmpRawTrack {
  id?: string
  name?: string
  type?: string
  index?: number
  mute?: boolean
  solo?: boolean
  locked?: boolean
  visible?: boolean
  volume?: number
  items?: YmmpRawItem[]
}

interface YmmpRawItem {
  id?: string
  name?: string
  type?: string
  file?: string
  start?: number
  end?: number
  layer?: number
  opacity?: number
  volume?: number
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  effects?: YmmpRawEffect[]
  keyframes?: YmmpRawKeyframe[]
  text?: string
  voice?: string
  color?: string
}

interface YmmpRawEffect {
  name?: string
  params?: Record<string, number | string | boolean>
}

interface YmmpRawKeyframe {
  frame?: number
  easing?: string
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  opacity?: number
  volume?: number
}

interface YmmpRawScene {
  id?: string
  name?: string
  start?: number
  end?: number
}

// ---- パーサー ----

function parseTrackType(type: string | undefined): TrackType {
  switch ((type || '').toLowerCase()) {
    case 'video': return 'video'
    case 'audio': return 'audio'
    case 'text': return 'text'
    default: return 'video'
  }
}

function parseItemType(type: string | undefined): ItemType {
  switch ((type || '').toLowerCase()) {
    case 'video': return 'video'
    case 'audio': return 'audio'
    case 'image': return 'image'
    case 'text': return 'text'
    case 'voice': return 'voice'
    case 'shape': return 'shape'
    default: return 'video'
  }
}

function parseItem(raw: YmmpRawItem): TimelineItem {
  return {
    id: raw.id || generateId(),
    name: raw.name || '未命名アイテム',
    type: parseItemType(raw.type),
    sourcePath: raw.file,
    startFrame: raw.start ?? 0,
    endFrame: raw.end ?? 150,
    layer: raw.layer ?? 0,
    opacity: raw.opacity ?? 1.0,
    volume: raw.volume ?? 1.0,
    transform: {
      x: raw.x ?? 0,
      y: raw.y ?? 0,
      scaleX: raw.scaleX ?? 1,
      scaleY: raw.scaleY ?? 1,
      rotation: raw.rotation ?? 0,
    },
    effects: (raw.effects || []).map(e => ({
      name: e.name || 'unknown',
      params: e.params || {},
    })),
    keyframes: (raw.keyframes || []).map(k => ({
      frame: k.frame ?? 0,
      easing: (k.easing as any) || 'linear',
      properties: {
        x: k.x,
        y: k.y,
        scaleX: k.scaleX,
        scaleY: k.scaleY,
        rotation: k.rotation,
        opacity: k.opacity,
        volume: k.volume,
      },
    })),
    text: raw.text,
    voicePreset: raw.voice,
    color: raw.color,
  }
}

function parseTrack(raw: YmmpRawTrack, fallbackIndex: number): Track {
  return {
    id: raw.id || generateId(),
    name: raw.name || `トラック ${fallbackIndex + 1}`,
    type: parseTrackType(raw.type),
    index: raw.index ?? fallbackIndex,
    mute: raw.mute ?? false,
    solo: raw.solo ?? false,
    locked: raw.locked ?? false,
    visible: raw.visible ?? true,
    volume: raw.volume ?? 1.0,
    items: (raw.items || []).map(parseItem),
  }
}

/** .ymmp JSON文字列を内部モデルにパース */
export function parseYmmp(jsonString: string): Project {
  try {
    const raw: YmmpRawProject = JSON.parse(jsonString)

    const tracks = (raw.tracks || []).map((t, i) => parseTrack(t, i))
    const sceneId = generateId()
    const scenes = (raw.scenes && raw.scenes.length > 0)
      ? raw.scenes.map(s => ({
          id: s.id || generateId(),
          name: s.name || 'シーン',
          tracks: tracks.map(t => ({ ...t, items: [...t.items] })),
        }))
      : [{ id: sceneId, name: 'シーン 1', tracks: tracks.map(t => ({ ...t, items: [...t.items] })) }]

    return {
      version: raw.version || '1.0',
      name: raw.name || 'プロジェクト',
      settings: {
        width: raw.width ?? 1920,
        height: raw.height ?? 1080,
        fps: raw.fps ?? 30,
        totalFrames: raw.totalFrame ?? 9000,
        audioSamplingRate: raw.samplingRate ?? 48000,
        backgroundColor: raw.bgColor || '#1a1a2e',
      },
      tracks,
      scenes,
      activeSceneId: scenes[0].id,
    }
  } catch (e) {
    throw new Error(`YMM4ファイルの解析に失敗しました: ${e}`)
  }
}

/** テキストとしてファイルを読み込み */
export async function readYmmpFile(filePath: string): Promise<Project> {
  // In Electron, we use fs via IPC
  // For now, return default project
  // In a real app, we'd read the file via IPC
  throw new Error('ファイルの読み込みはElectronのIPC経由で行います')
}

// ---- シリアライザー ----

function serializeItem(item: TimelineItem): YmmpRawItem {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    file: item.sourcePath,
    start: item.startFrame,
    end: item.endFrame,
    layer: item.layer,
    opacity: item.opacity,
    volume: item.volume,
    x: item.transform.x,
    y: item.transform.y,
    scaleX: item.transform.scaleX,
    scaleY: item.transform.scaleY,
    rotation: item.transform.rotation,
    effects: item.effects.map(e => ({
      name: e.name,
      params: e.params,
    })),
    keyframes: item.keyframes.map(k => ({
      frame: k.frame,
      easing: k.easing,
      ...k.properties,
    })),
    text: item.text,
    voice: item.voicePreset,
    color: item.color,
  }
}

function serializeTrack(track: Track): YmmpRawTrack {
  return {
    id: track.id,
    name: track.name,
    type: track.type,
    index: track.index,
    mute: track.mute,
    solo: track.solo,
    locked: track.locked,
    visible: track.visible,
    volume: track.volume,
    items: track.items.map(serializeItem),
  }
}

/** 内部モデルを .ymmp JSON文字列にシリアライズ */
export function serializeYmmp(project: Project): string {
  const raw: YmmpRawProject = {
    version: project.version,
    name: project.name,
    width: project.settings.width,
    height: project.settings.height,
    fps: project.settings.fps,
    totalFrame: project.settings.totalFrames,
    samplingRate: project.settings.audioSamplingRate,
    bgColor: project.settings.backgroundColor,
    tracks: project.tracks.map(serializeTrack),
    scenes: project.scenes.map(s => ({ id: s.id, name: s.name })),
  }

  return JSON.stringify(raw, null, 2)
}

/** ファイルに保存（Electron環境） */
export function saveYmmpFile(project: Project, filePath: string): void {
  // In Electron, we'd write via IPC
  const json = serializeYmmp(project)
  // For now, trigger download in browser context
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.name}.ymmp`
  a.click()
  URL.revokeObjectURL(url)
}
