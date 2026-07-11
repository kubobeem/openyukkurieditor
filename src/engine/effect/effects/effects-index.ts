/** ============================================================
 *  Effects Index — 標準エフェクトの登録
 *  ============================================================ */

import { pluginManager } from '../../../plugin/manager'
import { BrightnessContrastEffect } from './brightness-contrast'
import { GaussianBlurEffect } from './gaussian-blur'

/** 全ての標準エフェクトをプラグインマネージャーに登録 */
export function registerBuiltinEffects(): void {
  pluginManager.register('open-yukkuri/effect/brightness-contrast', BrightnessContrastEffect)
  pluginManager.register('open-yukkuri/effect/gaussian-blur', GaussianBlurEffect)
  // 将来的にここに追加
}
