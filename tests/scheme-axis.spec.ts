import { expect, test } from '@playwright/test'

test('an explicit scheme pin beats the opposing OS preference for non-color tokens', async ({ page }) => {
  // The paired output assertion in tokens.axes.out.test.ts proves these are
  // the selectors emitted by the compiler. This browser fixture proves their
  // opposing-preference cascade semantics without loading the build plane.
  const css = `
    #fixture {
      --vanity-signal: light-value;
      --vanity-surface: white;
      --vanity-on-surface: black;
      color: var(--vanity-on-surface);
      background: var(--vanity-surface);
    }
    @media (prefers-color-scheme: dark) {
      #fixture:where(:not([data-scheme='light'], [data-scheme='light'] *)) {
        --vanity-signal: dark-value;
        --vanity-surface: black;
        --vanity-on-surface: white;
      }
    }
    #fixture:where([data-scheme='dark'], [data-scheme='dark'] *) {
      --vanity-signal: dark-value;
      --vanity-surface: black;
      --vanity-on-surface: white;
    }
  `

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setContent(`<style>${css}</style><div id="fixture"></div>`)
  const fixture = page.locator('#fixture')
  const signal = () => fixture.evaluate(element =>
    getComputedStyle(element).getPropertyValue('--vanity-signal').trim())
  const pair = () => fixture.evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, color: style.color }
  })

  await expect.poll(signal).toBe('dark-value')
  await expect.poll(pair).toEqual({ background: 'rgb(0, 0, 0)', color: 'rgb(255, 255, 255)' })
  await fixture.evaluate(element => element.setAttribute('data-scheme', 'light'))
  await expect.poll(signal).toBe('light-value')
  await expect.poll(pair).toEqual({ background: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)' })

  await page.emulateMedia({ colorScheme: 'light' })
  await fixture.evaluate(element => element.removeAttribute('data-scheme'))
  await expect.poll(signal).toBe('light-value')
  await fixture.evaluate(element => element.setAttribute('data-scheme', 'dark'))
  await expect.poll(signal).toBe('dark-value')
})

test('a named scheme mount uses its own explicit pin attribute', async ({ page }) => {
  const css = `
    #appearance {
      --vanity-signal: light-value;
    }
    @media (prefers-color-scheme: dark) {
      #appearance:where(:not([data-appearance='light'], [data-appearance='light'] *)) {
        --vanity-signal: dark-value;
      }
    }
    #appearance:where([data-appearance='dark'], [data-appearance='dark'] *) {
      --vanity-signal: dark-value;
    }
  `

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setContent(`<style>${css}</style><div id="appearance"></div>`)
  const fixture = page.locator('#appearance')
  const signal = () => fixture.evaluate(element =>
    getComputedStyle(element).getPropertyValue('--vanity-signal').trim())

  await expect.poll(signal).toBe('dark-value')
  await fixture.evaluate(element => element.setAttribute('data-appearance', 'light'))
  await expect.poll(signal).toBe('light-value')
})

test('multi-axis folded pairings follow the composed source state', async ({ page }) => {
  const css = `
    #fixture {
      --two-color-base: light-dark(#ffffff, #000000);
      --two-color-on-base: black;
      background: var(--two-color-base);
      color: var(--two-color-on-base);
    }
    #fixture:where([data-scheme='dark'], [data-scheme='dark'] *) {
      --two-color-base: #000000;
      --two-color-on-base: white;
    }
    #fixture[data-density='cozy'] {
      --two-color-base: #ffffff;
    }
    #fixture[data-density='compact'] {
      --two-color-base: #101010;
      --two-color-on-base: white;
    }
    #fixture[data-scheme='dark'][data-density='cozy'] {
      --two-color-on-base: black;
    }
    @media (prefers-color-scheme: dark) {
      #fixture:where(:not([data-scheme='light'], [data-scheme='light'] *)) {
        --two-color-on-base: white;
      }
      #fixture:where(:not([data-scheme='light'], [data-scheme='light'] *))[data-density='cozy'] {
        --two-color-on-base: black;
      }
    }
  `

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setContent(`<style>${css}</style><div id="fixture" data-scheme="dark" data-density="cozy"></div>`)
  const fixture = page.locator('#fixture')
  const pair = () => fixture.evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, color: style.color }
  })

  await expect.poll(pair).toEqual({ background: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)' })

  await fixture.evaluate(element => element.setAttribute('data-density', 'compact'))
  await expect.poll(pair).toEqual({ background: 'rgb(16, 16, 16)', color: 'rgb(255, 255, 255)' })
})

test('a fallback axis arm stays exact when a derived case is in a later layer', async ({ page }) => {
  const css = `
    @layer fixture.tokens.axes.scheme {
      #fixture:where([data-scheme='dark'], [data-scheme='dark'] *) {
        --fixture-base: #000000;
        --fixture-on-base: white;
      }
      @media (prefers-color-scheme: dark) {
        #fixture:where(:not([data-scheme='light'], [data-scheme='light'] *)) {
          --fixture-base: #000000;
          --fixture-on-base: white;
        }
      }
    }
    @layer fixture.tokens.axes.density {
      #fixture {
        --fixture-base: #ffffff;
      }
      #fixture[data-density='compact'] {
        --fixture-base: #101010;
        --fixture-on-base: white;
      }
    }
    @layer fixture.tokens.cases {
      #fixture:where([data-scheme='dark'], [data-scheme='dark'] *):not([data-density='compact']) {
        --fixture-on-base: black;
      }
      @media (prefers-color-scheme: dark) {
        #fixture:where(:not([data-scheme='light'], [data-scheme='light'] *)):not([data-density='compact']) {
          --fixture-on-base: black;
        }
      }
    }
  `

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setContent(`<style>${css}</style><div id="fixture" data-scheme="dark" data-density="compact"></div>`)
  const fixture = page.locator('#fixture')
  const pair = () => fixture.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      background: style.getPropertyValue('--fixture-base').trim(),
      color: style.getPropertyValue('--fixture-on-base').trim(),
    }
  })

  await expect.poll(pair).toEqual({ background: '#101010', color: 'white' })
  await fixture.evaluate(element => element.removeAttribute('data-density'))
  await expect.poll(pair).toEqual({ background: '#ffffff', color: 'black' })
})
