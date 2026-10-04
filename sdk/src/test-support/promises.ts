/** Hold a native asynchronous operation at an observable test boundary. */
export function createPromiseGate(): { promise: Promise<void>, resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
