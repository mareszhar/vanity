import { ds } from './system.ts'

process.stdout.write(JSON.stringify({
  buildPlaneMarker: ds.buildPlaneMarker(),
  compatibilityId: ds.identities.compatibility,
  cssId: ds.identities.css,
  docsId: ds.identities.docs,
  hasBuildClosure: typeof ds.style === 'function',
  tokenNames: Object.values(ds.introspect().tokens).map(token => token.name),
}))
