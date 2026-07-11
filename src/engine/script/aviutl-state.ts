/** ============================================================
 *  AviUtl Script State — 互換変数定義
 *  ============================================================ */

export class AviUtlScriptState {
  // 基本オブジェクト情報
  frame: number = 0
  width: number = 0
  height: number = 0
  x: number = 0
  y: number = 0
  z: number = 0

  // 表示属性
  alpha: number = 255
  scaleX: number = 1.0
  scaleY: number = 1.0
  rotation: number = 0
  blur: number = 0

  // 色
  red: number = 255
  green: number = 255
  blue: number = 255

  // カメラ
  camX: number = 0
  camY: number = 0
  camZ: number = 0
  camRotX: number = 0
  camRotY: number = 0
  camRotZ: number = 0
  camFov: number = 30

  // 描画設定
  blendMode: string = 'normal'

  // ユーザー定義変数
  user: Record<string, number> = {}

  // オブジェクト内状態
  self: {
    frame: number
    time: number
    duration: number
    index: number
  } = { frame: 0, time: 0, duration: 0, index: 0 }

  /** 状態をリセット */
  reset(): void {
    this.frame = 0
    this.width = 0
    this.height = 0
    this.x = 0
    this.y = 0
    this.z = 0
    this.alpha = 255
    this.scaleX = 1.0
    this.scaleY = 1.0
    this.rotation = 0
    this.blur = 0
    this.red = 255
    this.green = 255
    this.blue = 255
    this.camX = 0
    this.camY = 0
    this.camZ = 0
    this.camRotX = 0
    this.camRotY = 0
    this.camRotZ = 0
    this.camFov = 30
    this.blendMode = 'normal'
    this.user = {}
    this.self = { frame: 0, time: 0, duration: 0, index: 0 }
  }
}
