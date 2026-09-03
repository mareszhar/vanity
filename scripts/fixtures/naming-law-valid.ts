function getLocalThing(): string {
  return 'local'
}

const readCallableThing = (): string => getLocalThing()

class ValidOperations {
  resolveThing(): string {
    return readCallableThing()
  }
}

const object = {
  createObjectThing(): string {
    return new ValidOperations().resolveThing()
  },
}

void object
