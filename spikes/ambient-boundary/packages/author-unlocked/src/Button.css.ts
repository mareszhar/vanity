/**
 * Ships TypeScript SOURCE, authored against ambient names. The type-only import
 * is the whole subject of this spike: it resolves the generated declaration, so
 * the `declare global` block enters every program that compiles this file.
 */
import type {} from '@spike/design/vanity-style-auto-imports'

export const button = cls({ color: t.color.brand })
