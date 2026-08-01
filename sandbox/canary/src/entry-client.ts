import { relativeColors, shell } from './shell.css.ts'
import { status } from './status.css.ts'
import { ds } from './system'

const root = document.querySelector<HTMLElement>('#app')!
root.className = shell
root.innerHTML = `<p class="${status}" data-ready>${ds.consts.product}</p><div id="panel"></div><div class="${relativeColors}" data-relative-colors hidden></div>`

const runtime = ds.runtime()
runtime.t.color.brand.$set('#16a34a')
runtime.axes.scheme.$switchTo('dark')

Object.assign(globalThis, {
  __vanityCanary: {
    ds,
    loadLazy: async () => {
      const { renderLazy } = await import('./lazy')
      root.insertAdjacentHTML('beforeend', renderLazy())
    },
  },
})
