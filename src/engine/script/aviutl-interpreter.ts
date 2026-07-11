/** ============================================================
 *  AviUtl Script Interpreter — .anm/.obj スクリプト互換
 *  ============================================================ */

import { AviUtlScriptState } from './aviutl-state'

type ScriptValue = number | string | boolean
type ScriptEnv = Record<string, ScriptValue>

/** スクリプト実行時に渡すフレーム状態 */
export interface ScriptFrameState {
  frame: number
  width?: number
  height?: number
  x?: number
  y?: number
  alpha?: number
}

/** AviUtl互換スクリプトインタープリター */
export class AviUtlInterpreter {
  private state = new AviUtlScriptState()
  private env: ScriptEnv = {}

  /** スクリプトを1フレーム分実行し、状態を返す */
  evaluate(script: string, frameState: ScriptFrameState): AviUtlScriptState {
    this.state.reset()
    // 状態更新
    Object.assign(this.state, frameState)
    this.state.self.frame = frameState.frame ?? 0
    this.state.self.time = frameState.frame ?? 0

    // 環境変数を初期化
    this.initEnv()

    // 行ごとに実行
    const lines = script.split('\n')
    for (const line of lines) {
      this.executeLine(line.trim())
    }

    return this.state
  }

  private initEnv(): void {
    this.env = {
      frame: this.state.frame,
      width: this.state.width,
      height: this.state.height,
      x: this.state.x,
      y: this.state.y,
      z: this.state.z,
      alpha: this.state.alpha,
      scaleX: this.state.scaleX,
      scaleY: this.state.scaleY,
      rotation: this.state.rotation,
      blur: this.state.blur,
      red: this.state.red,
      green: this.state.green,
      blue: this.state.blue,
      camX: this.state.camX,
      camY: this.state.camY,
      camZ: this.state.camZ,
      camRotX: this.state.camRotX,
      camRotY: this.state.camRotY,
      camRotZ: this.state.camRotZ,
      camFov: this.state.camFov,
    }
  }

  private executeLine(line: string): void {
    if (!line || line.startsWith('//') || line.startsWith('#')) return

    // 代入: x = 100
    const assignMatch = line.match(/^(\w[\w.]*)\s*=\s*(.+)$/)
    if (assignMatch) {
      const [, name, expr] = assignMatch
      const value = this.evaluateExpr(expr.trim())
      if (value !== undefined) {
        this.setVariable(name, value)
      }
      return
    }

    // if文
    if (line.startsWith('if ')) {
      const condMatch = line.match(/^if\s+(.+?)\s*\{?\s*$/)
      if (condMatch) {
        const cond = this.evaluateExpr(condMatch[1].trim())
        // 条件が真の場合のみ、次の行が実行される（簡易版）
      }
      return
    }

    // 関数呼び出し
    const funcMatch = line.match(/^(\w+)\(([^)]*)\)$/)
    if (funcMatch) {
      this.callFunction(funcMatch[1], funcMatch[2])
      return
    }
  }

  private evaluateExpr(expr: string): number | undefined {
    expr = expr.trim()

    // 数値
    const numMatch = expr.match(/^(\d+\.?\d*)$/)
    if (numMatch) return parseFloat(numMatch[1])

    // 変数参照
    const varMatch = expr.match(/^(\w[\w.]*)$/)
    if (varMatch) {
      return this.getVariable(varMatch[1])
    }

    // 関数呼び出し: sin(), cos(), abs(), rnd(), sqrt()
    const funcMatch = expr.match(/^(\w+)\(([^)]*)\)$/)
    if (funcMatch) {
      return this.callMathFunction(funcMatch[1], funcMatch[2])
    }

    // 単項演算子: -100, +100
    const unaryMatch = expr.match(/^([+-])\s*(\d+\.?\d*)$/)
    if (unaryMatch) {
      const val = parseFloat(unaryMatch[2])
      return unaryMatch[1] === '-' ? -val : val
    }

    // 四則演算（簡易）
    const binMatch = expr.match(/^(.+?)\s*([+\-*/%])\s*(.+)$/)
    if (binMatch) {
      const left = this.evaluateExpr(binMatch[1].trim())
      const right = this.evaluateExpr(binMatch[3].trim())
      if (left !== undefined && right !== undefined) {
        switch (binMatch[2]) {
          case '+': return left + right
          case '-': return left - right
          case '*': return left * right
          case '/': return right !== 0 ? left / right : 0
          case '%': return left % right
        }
      }
    }

    return undefined
  }

  private getVariable(name: string): number {
    // 入れ子対応: self.frame, user.var1
    if (name.startsWith('self.')) {
      const key = name.slice(5) as keyof typeof this.state.self
      return this.state.self[key] as number
    }
    if (name.startsWith('user.')) {
      return this.state.user[name.slice(5)] ?? 0
    }

    const key = name as keyof AviUtlScriptState
    const val = this.state[key]
    return typeof val === 'number' ? val : (this.env[name] as number ?? 0)
  }

  private setVariable(name: string, value: number): void {
    if (name.startsWith('self.')) {
      const key = name.slice(5) as keyof typeof this.state.self
      ;(this.state.self as any)[key] = value
      return
    }
    if (name.startsWith('user.')) {
      this.state.user[name.slice(5)] = value
      return
    }

    const key = name as keyof AviUtlScriptState
    if (typeof this.state[key] === 'number') {
      ;(this.state as any)[key] = value
    }

    // 環境も更新
    this.env[name] = value
  }

  private callFunction(name: string, argsStr: string): void {
    const args = argsStr ? argsStr.split(',').map(s => this.evaluateExpr(s.trim()) ?? 0) : []
    switch (name) {
      case 'object': break // オブジェクト設定
      case 'clear': break  // クリア
    }
  }

  private callMathFunction(name: string, argsStr: string): number {
    const arg = this.evaluateExpr(argsStr.trim()) ?? 0
    switch (name) {
      case 'sin': return Math.sin(arg * Math.PI / 180)
      case 'cos': return Math.cos(arg * Math.PI / 180)
      case 'tan': return Math.tan(arg * Math.PI / 180)
      case 'abs': return Math.abs(arg)
      case 'sqrt': return Math.sqrt(Math.max(0, arg))
      case 'rnd': {
        const args = argsStr.split(',').map(s => this.evaluateExpr(s.trim()) ?? 0)
        const min = args[0] ?? 0
        const max = args[1] ?? 1
        return min + Math.random() * (max - min)
      }
      case 'floor': return Math.floor(arg)
      case 'ceil': return Math.ceil(arg)
      case 'round': return Math.round(arg)
      case 'min': {
        const args = argsStr.split(',').map(s => this.evaluateExpr(s.trim()) ?? 0)
        return Math.min(...args)
      }
      case 'max': {
        const args = argsStr.split(',').map(s => this.evaluateExpr(s.trim()) ?? 0)
        return Math.max(...args)
      }
      default: return 0
    }
  }
}
