import type * as Authoring from '@spike/design/authoring'

/* eslint-disable vars-on-top -- `var` is the behavior under test: it is what permits identical-type redeclaration across declarations. */
declare global {
  var shared: typeof Authoring.cls
}
export {}
