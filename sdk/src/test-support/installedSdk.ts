/** Give an isolated consumer fixture the package-name resolution of an installed SDK. */
import { copyFile, mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function installTestSdk(root: string): Promise<void> {
  const sdk = fileURLToPath(new URL('../../', import.meta.url))
  await mkdir(join(root, 'node_modules/@mszr'), { recursive: true })
  const installed = join(root, 'node_modules/@mszr/vanity')
  await mkdir(installed, { recursive: true })
  // Fixtures can replace package metadata or add root entries. Those writes
  // must stay in the fixture; only the compiler-built artifacts are shared.
  await copyFile(join(sdk, 'package.json'), join(installed, 'package.json'))
  await symlink(join(sdk, 'dist'), join(installed, 'dist')).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST')
      throw error
  })
}
