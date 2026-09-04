function localThing(): string {
  return 'local'
}

const thingCallable = (): string => localThing()

class InvalidOperations {
  methodThing(): string {
    return thingCallable()
  }
}

const object = {
  objectMethodThing(): string {
    return new InvalidOperations().methodThing()
  },
  propertyThing: () => 'property',
}

interface InvalidSurface {
  readonly propertyTypeThing: () => string
}

declare const invalidSurface: InvalidSurface
void invalidSurface
void object
