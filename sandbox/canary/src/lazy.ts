import { lazyPanel } from './lazy.css.ts'

export function renderLazy(): string {
  return `<aside class="${lazyPanel}">lazy projection</aside>`
}
