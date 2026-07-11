/**
 * アイコン生成スクリプト
 * SVGからアイコン用のPNGを生成します。
 * 使用法: node scripts/generate-icon.mjs
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buildResources = path.resolve(__dirname, '..', 'buildResources')
const svgPath = path.join(buildResources, 'icon.svg')

async function generate() {
  // SVG を読み込み
  const svg = fs.readFileSync(svgPath, 'utf-8')

  // 各種サイズの PNG を生成
  const sizes = [256, 512]

  for (const size of sizes) {
    const pngPath = path.join(buildResources, `icon${size}.png`)
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(pngPath)
    console.log(`✅ Generated: ${path.relative(process.cwd(), pngPath)} (${size}x${size})`)
  }

  // プライマリ用 icon.png (256x256)
  const primaryPath = path.join(buildResources, 'icon.png')
  await sharp(Buffer.from(svg))
    .resize(256, 256)
    .png()
    .toFile(primaryPath)
  console.log(`✅ Generated: ${path.relative(process.cwd(), primaryPath)} (256x256)`)

  // ico も macOS の icns は不要だが、
  // 必要なら .ico も生成できる (Windows向け)
  // Windows electron-builder は PNG も受け付ける
}

generate().catch(err => {
  console.error('アイコン生成エラー:', err)
  process.exit(1)
})
