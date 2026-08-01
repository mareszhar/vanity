import { ds } from './system'

export const status = ds.class({
  borderColor: ds.t.color.brand,
  borderStyle: 'solid',
  borderWidth: 1,
  conditionMatrix: {
    backgroundColor: 'rgb(4, 5, 6)',
  },
})
