import { expect, test } from '@playwright/test'

test('the projected condition, scope, root, and color-scheme contracts agree in a browser', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')

  const app = page.locator('#app')
  const status = page.locator('[data-ready]')
  const panel = page.locator('#panel')
  const color = () => app.evaluate(element => getComputedStyle(element).color)
  const scheme = () => page.locator('html').evaluate(element => getComputedStyle(element).colorScheme)

  await page.evaluate(() => {
    const canary = (globalThis as any).__vanityCanary
    const runtime = canary.ds.runtime()
    runtime.t.color.brand.$unset()
    runtime.axes.scheme.dark.$activate()
  })
  await expect.poll(color).toBe('rgb(168, 156, 255)')

  await page.evaluate(() => {
    const canary = (globalThis as any).__vanityCanary
    canary.ds.runtime().axes.scheme.$switchTo('light')
  })
  await expect.poll(color).toBe('rgb(99, 91, 255)')
  await expect.poll(scheme).toBe('light')

  await page.emulateMedia({ colorScheme: 'light' })
  await page.evaluate(() => {
    const canary = (globalThis as any).__vanityCanary
    canary.ds.runtime().axes.scheme.$switchTo('light')
  })
  await expect.poll(color).toBe('rgb(99, 91, 255)')

  await page.evaluate(() => {
    const canary = (globalThis as any).__vanityCanary
    canary.ds.runtime().axes.scheme.$switchTo('dark')
  })
  await expect.poll(color).toBe('rgb(168, 156, 255)')
  await expect.poll(scheme).toBe('dark')
  await expect(panel).toHaveAttribute('data-scheme', 'dark')

  await expect(status).toHaveCSS('background-color', 'rgb(4, 5, 6)')

  const relativeColors = await page.locator('[data-relative-colors]').evaluate((element) => {
    const style = getComputedStyle(element)
    return [
      style.color,
      style.backgroundColor,
      style.borderTopColor,
      style.borderRightColor,
      style.borderBottomColor,
      style.borderLeftColor,
      style.outlineColor,
      style.textDecorationColor,
    ]
  })
  expect(relativeColors).toHaveLength(8)
  expect(relativeColors.every(color => color !== '' && color !== 'rgba(0, 0, 0, 0)')).toBe(true)
})

test('numeric keyframes use property units in standards mode', async ({ page }) => {
  await page.goto('/')
  expect(await page.evaluate(() => document.compatMode)).toBe('CSS1Compat')
  const animation = page.locator('[data-numeric-animation]')
  await expect(animation).toHaveCSS('padding', '1px')
  await expect(animation).toHaveCSS('opacity', '1')
  expect(await animation.evaluate(element => getComputedStyle(element).getPropertyValue('--canary-count').trim())).toBe('1')
})
