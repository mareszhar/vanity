export interface BenchmarkScale {
  axes: number
  consumers: number
  modules: number
  name: 'small' | 'medium' | 'large'
  tokens: number
}

export const benchmarkScales: readonly BenchmarkScale[] = [
  { name: 'small', tokens: 50, modules: 2, consumers: 5, axes: 2 },
  { name: 'medium', tokens: 500, modules: 10, consumers: 30, axes: 3 },
  { name: 'large', tokens: 5_000, modules: 50, consumers: 150, axes: 4 },
]
