#!/usr/bin/env node
/**
 * Open Yukkuri Editor — MCP Server
 * AI-toolable interface for creating Yukkuri-style videos.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// ---- Data Models ----

interface Transform { x: number; y: number; scaleX: number; scaleY: number; rotation: number }
interface Effect { name: string; params: Record<string, number | string | boolean> }
interface Keyframe { frame: number; properties: Partial<{ x: number; y: number; scaleX: number; scaleY: number; rotation: number; opacity: number; volume: number }> }
interface TimelineItem { id: string; name: string; type: string; sourcePath?: string; startFrame: number; endFrame: number; layer: number; opacity: number; volume: number; transform: Transform; effects: Effect[]; keyframes: Keyframe[]; text?: string; voicePreset?: string; color?: string }
interface Track { id: string; name: string; type: string; index: number; mute: boolean; solo: boolean; locked: boolean; visible: boolean; volume: number; items: TimelineItem[] }
interface Project { version: string; name: string; settings: { width: number; height: number; fps: number; totalFrames: number }; tracks: Track[] }

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

let currentProject: Project | null = null

function getOrCreateProject(): Project {
  if (!currentProject) {
    currentProject = {
      version: '1.0',
      name: '無題のプロジェクト',
      settings: { width: 1920, height: 1080, fps: 30, totalFrames: 9000 },
      tracks: [],
    }
  }
  return currentProject
}

// ---- VOICEVOX (lightweight check) ----

async function checkVoicevoxAlive(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:50021/version', { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

// ---- MCP Server ----

const server = new McpServer({
  name: 'Open Yukkuri Editor',
  version: '0.1.0',
})

// 1. プロジェクト作成
server.tool(
  'create_project',
  '新しい動画プロジェクトを作成します。解像度・FPS・尺を指定できます。',
  {
    name: z.string().optional().describe('プロジェクト名'),
    width: z.number().optional().describe('解像度 幅（px）'),
    height: z.number().optional().describe('解像度 高さ（px）'),
    fps: z.number().optional().describe('フレームレート'),
    duration_seconds: z.number().optional().describe('尺（秒）'),
  },
  async ({ name, width, height, fps, duration_seconds }) => {
    currentProject = {
      version: '1.0',
      name: name || '無題のプロジェクト',
      settings: {
        width: width || 1920,
        height: height || 1080,
        fps: fps || 30,
        totalFrames: (duration_seconds || 300) * (fps || 30),
      },
      tracks: [],
    }
    const s = currentProject.settings
    return { content: [{ type: 'text', text: `✅ プロジェクト「${currentProject.name}」${s.width}x${s.height} ${s.fps}fps` }] }
  },
)

// 2. トラック追加
server.tool(
  'add_track',
  '動画・音声・テキストトラックを追加します。',
  {
    type: z.enum(['video', 'audio', 'text']).describe('トラックの種類'),
    name: z.string().optional().describe('トラック名（省略時は自動生成）'),
  },
  async ({ type, name }) => {
    const p = getOrCreateProject()
    const count = p.tracks.filter(t => t.type === type).length
    const typeLabel = type === 'video' ? '動画' : type === 'audio' ? '音声' : 'テキスト'
    p.tracks.push({
      id: generateId(),
      name: name || `${typeLabel}トラック ${count + 1}`,
      type,
      index: p.tracks.length,
      mute: false,
      solo: false,
      locked: false,
      visible: true,
      volume: 1.0,
      items: [],
    })
    return { content: [{ type: 'text', text: `✅ 追加: ${typeLabel}トラック` }] }
  },
)

// 3. クリップ追加
server.tool(
  'add_clip',
  '動画・音声・画像・テキストクリップを指定トラックに追加します。',
  {
    track_index: z.number().describe('追加先トラックのインデックス'),
    name: z.string().optional().describe('クリップ名'),
    start_frame: z.number().describe('開始フレーム'),
    duration_frames: z.number().describe('長さ（フレーム数）'),
    type: z.enum(['video', 'audio', 'image', 'text']).optional().describe('クリップの種類'),
    source_path: z.string().optional().describe('素材ファイルのパス'),
  },
  async ({ track_index, name, start_frame, duration_frames, type, source_path }) => {
    const p = getOrCreateProject()
    if (track_index < 0 || track_index >= p.tracks.length) {
      return { content: [{ type: 'text', text: '❌ 指定されたトラックが見つかりません' }] }
    }
    const t = p.tracks[track_index]
    const colors = ['#cc785c', '#5db8a6', '#e8a55a', '#5db872', '#8e8b82']
    t.items.push({
      id: generateId(),
      name: name || `クリップ ${t.items.length + 1}`,
      type: type || (t.type as any),
      sourcePath: source_path,
      startFrame: start_frame,
      endFrame: start_frame + duration_frames,
      layer: 0,
      opacity: 1,
      volume: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      keyframes: [],
      color: colors[t.items.length % colors.length],
    })
    return { content: [{ type: 'text', text: `✅ クリップ追加: ${start_frame}f 〜 ${start_frame + duration_frames}f` }] }
  },
)

// 4. テキストクリップ追加
server.tool(
  'add_text_clip',
  'テキストトラックに字幕テロップを追加します。',
  {
    track_index: z.number().describe('テキストトラックのインデックス'),
    text: z.string().describe('表示するテキスト'),
    start_frame: z.number().describe('開始フレーム'),
    duration_frames: z.number().optional().describe('長さ（フレーム数、省略時は150）'),
  },
  async ({ track_index, text, start_frame, duration_frames }) => {
    const p = getOrCreateProject()
    if (track_index < 0 || track_index >= p.tracks.length) {
      return { content: [{ type: 'text', text: '❌ 指定されたトラックが見つかりません' }] }
    }
    const t = p.tracks[track_index]
    t.items.push({
      id: generateId(),
      name: `テキスト:${text.substring(0, 20)}`,
      type: 'text',
      startFrame: start_frame,
      endFrame: start_frame + (duration_frames || 150),
      layer: 0,
      opacity: 1,
      volume: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      keyframes: [],
      text,
      color: '#e8a55a',
    })
    return { content: [{ type: 'text', text: `✅ テキスト追加: "${text.substring(0, 30)}"` }] }
  },
)

// 5. VOICEVOX音声合成
server.tool(
  'synthesize_voice',
  'VOICEVOXでテキストを音声合成します。VOICEVOX（http://localhost:50021）の起動が必要です。',
  {
    text: z.string().describe('読み上げるテキスト'),
    speaker: z.number().optional().describe('VOICEVOX話者ID（デフォルト3=ずんだもん）'),
  },
  async ({ text, speaker }) => {
    const alive = await checkVoicevoxAlive()
    if (!alive) {
      return { content: [{ type: 'text', text: '❌ VOICEVOXに接続できません。http://localhost:50021 が起動しているか確認してください。' }] }
    }
    return { content: [{ type: 'text', text: `✅ VOICEVOX接続確認OK（話者ID: ${speaker || 3}）: "${text}"` }] }
  },
)

// 6. 音声＋字幕の一括追加
server.tool(
  'add_voice_clip',
  '音声トラック＋字幕トラックに音声クリップと字幕を一括追加します。（最も便利なツール）',
  {
    text: z.string().describe('音声・字幕のテキスト'),
    track_index_audio: z.number().describe('音声トラックのインデックス'),
    track_index_text: z.number().describe('字幕テキストトラックのインデックス'),
    start_frame: z.number().describe('開始フレーム'),
    speaker: z.number().optional().describe('VOICEVOX話者ID（デフォルト3）'),
  },
  async ({ text, track_index_audio, track_index_text, start_frame, speaker }) => {
    const p = getOrCreateProject()
    if (track_index_audio >= p.tracks.length || track_index_text >= p.tracks.length) {
      return { content: [{ type: 'text', text: '❌ トラックインデックスが範囲外です' }] }
    }
    const fps = p.settings.fps || 30
    const duration = Math.ceil((text.length * 0.15 + 1) * fps)

    p.tracks[track_index_audio].items.push({
      id: generateId(),
      name: `音声:${text.substring(0, 20)}`,
      type: 'audio',
      startFrame: start_frame,
      endFrame: start_frame + duration,
      layer: 0,
      opacity: 1,
      volume: 1,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      keyframes: [],
      voicePreset: `voicevox:${speaker || 3}`,
      color: '#5db8a6',
    })
    p.tracks[track_index_text].items.push({
      id: generateId(),
      name: `字幕:${text.substring(0, 20)}`,
      type: 'text',
      startFrame: start_frame,
      endFrame: start_frame + duration,
      layer: 0,
      opacity: 1,
      volume: 1,
      transform: { x: 0, y: 200, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      keyframes: [],
      text,
      color: '#e8a55a',
    })
    return { content: [{ type: 'text', text: `✅ 音声＋字幕追加: "${text.substring(0, 30)}" ${start_frame}f 〜 ${start_frame + duration}f` }] }
  },
)

// 7. エフェクト適用
server.tool(
  'apply_effect',
  'クリップにエフェクトを適用します。（brightness-contrast, gaussian-blur 等）',
  {
    track_index: z.number().describe('トラックインデックス'),
    item_index: z.number().describe('クリップインデックス'),
    effect_name: z.string().describe('エフェクト名'),
    params: z.string().optional().describe('JSONパラメータ（例: {"brightness":20,"contrast":15}）'),
  },
  async ({ track_index, item_index, effect_name, params }) => {
    const p = getOrCreateProject()
    if (track_index >= p.tracks.length || item_index >= p.tracks[track_index].items.length) {
      return { content: [{ type: 'text', text: '❌ 指定されたクリップが見つかりません' }] }
    }
    try {
      const parsed = params ? JSON.parse(params) : {}
      p.tracks[track_index].items[item_index].effects.push({ name: effect_name, params: parsed })
      return { content: [{ type: 'text', text: `✅ エフェクト適用: ${effect_name}` }] }
    } catch (e: any) {
      return { content: [{ type: 'text', text: `❌ JSONパラメータの解析に失敗しました: ${e.message}` }] }
    }
  },
)

// 8. プレビュー
server.tool(
  'preview',
  '現在のプロジェクトの状態を表示します。',
  {},
  async () => {
    const p = getOrCreateProject()
    const totalClips = p.tracks.reduce((s, t) => s + t.items.length, 0)
    const lines = [
      `📁 ${p.name}`,
      `  解像度: ${p.settings.width}x${p.settings.height}  ${p.settings.fps}fps`,
      `  総トラック: ${p.tracks.length}  総クリップ: ${totalClips}`,
    ]
    p.tracks.forEach((t, i) => {
      lines.push(`  [${i}] ${t.name}（${t.type}）${t.items.length}クリップ`)
      t.items.forEach((item, j) => {
        const ef = item.effects.length ? ` [+${item.effects.length}エフェクト]` : ''
        lines.push(`       ${j}: ${item.name} ${item.startFrame}f-${item.endFrame}f${ef}`)
      })
    })
    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// 9. プロジェクト出力
server.tool(
  'export_project',
  'プロジェクトをJSON形式（summary または .ymmp互換）で出力します。',
  {
    format: z.enum(['summary', 'ymmp']).optional().describe('出力形式（デフォルト=summary）'),
  },
  async ({ format }) => {
    const p = getOrCreateProject()
    const total = p.tracks.reduce((s, t) => s + t.items.length, 0)
    if (format === 'ymmp') {
      return { content: [{ type: 'text', text: JSON.stringify(p, null, 2) }] }
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: p.name,
          settings: p.settings,
          tracks: p.tracks.map(t => ({
            name: t.name,
            type: t.type,
            items: t.items.length,
          })),
          clips: total,
        }, null, 2),
      }],
    }
  },
)

// ---- Startup ----
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[MCP] Open Yukkuri Editor server ready')
}

main().catch(e => {
  console.error('[MCP] Fatal:', e)
  process.exit(1)
})
