import { expect, test } from '@playwright/test'

test('an explicit scheme pin beats the opposing OS preference for non-color tokens', async ({ page }) => {
  // The paired output assertion in tokens.axes.out.test.ts proves these are
  // the selectors emitted by the compiler. This browser fixture proves their
  // opposing-preference cascade semantics without loading the build plane.
  const css = `
    #fixture { --vanity-signal: light-value; }
    @media (prefers-color-scheme: dark) {
      #fixture:where(:not([data-scheme='light'], [data-scheme='light'] *)) {
        --vanity-signal: dark-value;
      }
    }
    #fixture:where([data-scheme='dark'], [data-scheme='dark'] *) {
      --vanity-signal: dark-value;
    }
  `

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setContent(`<style>${css}</style><div id="fixture"></div>`)
  const fixture = page.locator('#fixture')
  const signal = () => fixture.evaluate(element =>
    getComputedStyle(element).getPropertyValue('--vanity-signal').trim())

  await expect.poll(signal).toBe('dark-value')
  await fixture.evaluate(element => element.setAttribute('data-scheme', 'light'))
  await expect.poll(signal).toBe('light-value')

  await page.emulateMedia({ colorScheme: 'light' })
  await fixture.evaluate(element => element.removeAttribute('data-scheme'))
  await expect.poll(signal).toBe('light-value')
  await fixture.evaluate(element => element.setAttribute('data-scheme', 'dark'))
  await expect.poll(signal).toBe('dark-value')
})
