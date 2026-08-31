/** A second module role declaring the same name from a genuinely different source. */
/* eslint-disable vars-on-top -- `var` is the behavior under test: it is what permits identical-type redeclaration across declarations. */
declare global {
  var shared: (n: number) => number
}
export {}
