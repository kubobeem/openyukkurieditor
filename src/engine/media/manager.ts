export class MediaManager {
  private videoCache = new Map<string, HTMLVideoElement>()
  private imageCache = new Map<string, HTMLImageElement>()
  private audioContext: AudioContext | null = null
  private audioBuffers = new Map<string, AudioBuffer>()
  private activeSources = new Set<AudioBufferSourceNode>()
  private gainNode: GainNode | null = null

  getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
      this.gainNode = this.audioContext.createGain()
      this.gainNode.connect(this.audioContext.destination)
    }
    return this.audioContext
  }

  async loadAudio(src: string): Promise<AudioBuffer | null> {
    if (this.audioBuffers.has(src)) return this.audioBuffers.get(src)!
    try {
      const ctx = this.getAudioContext()
      const res = await fetch(src.startsWith('file://') || src.includes(':\\') ? `file://${src}` : src)
      if (!res.ok) return null
      const arrayBuffer = await res.arrayBuffer()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      this.audioBuffers.set(src, audioBuffer)
      return audioBuffer
    } catch { return null }
  }

  playAudio(src: string, startTimeSec: number, durationSec: number, volume: number): void {
    const ctx = this.getAudioContext()
    this.loadAudio(src).then(buf => {
      if (!buf) return
      const source = ctx.createBufferSource()
      source.buffer = buf
      const gain = ctx.createGain()
      gain.gain.value = volume
      source.connect(gain)
      gain.connect(this.gainNode!)
      const offset = Math.max(0, Math.min(startTimeSec, buf.duration))
      const dur = Math.min(durationSec, buf.duration - offset)
      source.start(0, offset, dur)
      this.activeSources.add(source)
      source.onended = () => this.activeSources.delete(source)
    })
  }

  stopAllAudio(): void {
    for (const src of this.activeSources) {
      try { src.stop() } catch { /* already stopped */ }
    }
    this.activeSources.clear()
  }

  getVideo(src: string): HTMLVideoElement {
    let vid = this.videoCache.get(src)
    if (!vid) {
      vid = document.createElement('video')
      vid.crossOrigin = 'anonymous'
      vid.preload = 'auto'
      vid.muted = true
      vid.playsInline = true
      const source = src.startsWith('file://') || src.startsWith('http') ? src : `file:///${src.replace(/\\/g, '/')}`
      vid.src = source
      vid.load()
      this.videoCache.set(src, vid)
    }
    return vid
  }

  seekVideo(video: HTMLVideoElement, frame: number, fps: number): Promise<void> {
    const time = frame / fps
    if (Math.abs(video.currentTime - time) < 0.5 / fps) return Promise.resolve()
    video.currentTime = time
    if (video.readyState >= 2) return Promise.resolve()
    return new Promise(resolve => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve() }
      const onCanPlay = () => { video.removeEventListener('canplay', onCanPlay); resolve() }
      video.addEventListener('seeked', onSeeked)
      video.addEventListener('canplay', onCanPlay)
      setTimeout(resolve, 500)
    })
  }

  getImage(src: string): HTMLImageElement | null {
    let img = this.imageCache.get(src)
    if (!img) {
      img = new Image()
      img.crossOrigin = 'anonymous'
      const source = src.startsWith('file://') || src.startsWith('http') ? src : `file:///${src.replace(/\\/g, '/')}`
      img.src = source
      this.imageCache.set(src, img)
    }
    return img
  }

  isImageLoaded(src: string): boolean {
    const img = this.imageCache.get(src)
    return !!img && img.complete && img.naturalWidth > 0
  }

  isVideoReady(video: HTMLVideoElement): boolean {
    return video.readyState >= 2 && !video.paused
  }

  dispose(): void {
    this.stopAllAudio()
    for (const vid of this.videoCache.values()) {
      vid.pause()
      vid.removeAttribute('src')
      vid.load()
    }
    this.videoCache.clear()
    this.imageCache.clear()
    this.audioBuffers.clear()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

export const mediaManager = new MediaManager()
