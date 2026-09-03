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
}

void object
