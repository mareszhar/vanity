import { expect, test } from '@playwright/test'

test('folded and live HSL lightness adjustments render identically', async ({ page }) => {
  await page.setContent(`
    <style>
      #folded { color: hsl(200 50% 50.1%); }
      #live {
        --vanity-seed: hsl(200 50% 50%);
        color: hsl(from var(--vanity-seed) h s calc(l + 0.1));
      }
    </style>
    <span id="folded">folded</span>
    <span id="live">live</span>
  `)

  const colors = await page.locator('#folded, #live').evaluateAll((elements) => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    return elements.map((element) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = getComputedStyle(element).color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    })
  })

  expect(colors).toEqual([colors[0], colors[0]])
})
