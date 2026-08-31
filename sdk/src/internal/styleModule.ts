/**
 * Setup failures are diagnosed too ([spec-css.md §9]): an authoring call
 * outside a compiled style module gets one friendly error naming the missing
 * plugin and the line to add — never a raw substrate evaluation stack. The
 * TypeScript plugin catches module-role misuse at the cursor before this
 * runtime guard is reached.
 */

import { getFileScope, hasFileScope } from '@vanilla-extract/css/fileScope'
import { VanityError } from '../diagnostics'

/** Guard an authoring call; returns the evaluating style module's path for diagnostics. */
export function requireStyleModule(surface: string): string {
  if (!hasFileScope()) {
    throw new VanityError({
      code: 'VANITY_VITE_PLUGIN_MISSING',
      message: `${surface} ran outside a style-module build — the vanity plugin is not wired up`,
      detail: [
        'Style modules are evaluated at build time; nothing here can run as ordinary app code.',
      ],
      fix: 'add vanityPlugin() from \'@mszr/vanity/vite\' to vite plugins (or the \'@mszr/vanity/nuxt\' module), and keep this call inside a *.css.ts file',
    })
  }

  return getFileScope().filePath
}
