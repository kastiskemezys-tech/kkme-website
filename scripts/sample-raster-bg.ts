import sharp from 'sharp'

async function sampleCorner(filepath: string): Promise<string> {
  const img = sharp(filepath)
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })

  // Average the top-left 10x10 pixel corner
  let r = 0, g = 0, b = 0, n = 0
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const idx = (y * info.width + x) * info.channels
      r += data[idx]
      g += data[idx + 1]
      b += data[idx + 2]
      n++
    }
  }
  r = Math.round(r / n)
  g = Math.round(g / n)
  b = Math.round(b / n)

  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

async function main() {
  const dark = await sampleCorner('public/hero/kkme-interconnect-dark.png')
  const light = await sampleCorner('public/hero/kkme-interconnect-light.png')
  console.log('Dark hero bg:', dark)
  console.log('Light hero bg:', light)
}

main().catch(console.error)
