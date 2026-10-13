/** Build an installed Nuxt fixture through Nitro and close its configured hosts. */
import { buildNuxt, loadNuxt } from '@nuxt/kit'

export async function buildNuxtFixture(root: string): Promise<void> {
  const nuxt = await loadNuxt({ cwd: root, dev: false, ready: true })
  try {
    await buildNuxt(nuxt)
  }
  finally {
    await nuxt.close()
  }
}
