/** Typed linear interpolation and its viewport-fluid lowering. */

import type { VanityCalc, VanityDimensionOf, VanityMathDimension, VanitySumDimension } from './math'
import type { VanityCssInput } from './types'
import { calc, clamp } from './math'
import { length } from './units'

export type VanityInterpolationDimension<From extends VanityCssInput, To extends VanityCssInput>
  = VanitySumDimension<VanityDimensionOf<From>, VanityDimensionOf<To>>

/**
 * Interpolate two compatible CSS numeric values at a unitless progress value.
 * Progress is intentionally not clamped: extrapolation is a valid primitive;
 * higher-level helpers such as `fluid()` own bounds.
 */
export function interpolate<
  const From extends VanityCssInput,
  const To extends VanityCssInput,
  const Progress extends VanityCssInput,
>(
  from: From,
  to: To & (VanityInterpolationDimension<From, To> extends never ? never : unknown),
  progress: Progress & (VanityDimensionOf<Progress> extends 'number' ? unknown : never),
): VanityCalc<VanityInterpolationDimension<From, To> & VanityMathDimension> {
  if (typeof progress === 'number')
    validateFinite(progress, 'interpolate progress')
  return calc(from).add(calc(to).subtract(from as any).multiply(progress) as any) as never
}

export interface VanityFluidOptions {
  /** Lower value in CSS pixels. */
  readonly min: number
  /** Upper value in CSS pixels. */
  readonly max: number
  /** Viewport width at which `min` is reached; defaults to 320px. */
  readonly minVw?: number
  /** Viewport width at which `max` is reached; defaults to 1280px. */
  readonly maxVw?: number
}

/** Utopia-style bounded viewport interpolation, emitted as ordinary clamp/calc CSS. */
export function fluid(options: VanityFluidOptions): ReturnType<typeof clamp> {
  const { min, max, minVw = 320, maxVw = 1280 } = options
  validateFinite(min, 'fluid min')
  validateFinite(max, 'fluid max')
  validateFinite(minVw, 'fluid minVw')
  validateFinite(maxVw, 'fluid maxVw')
  if (max < min)
    throw new RangeError(`[vanity] fluid max must be greater than or equal to min; received ${min} → ${max}`)
  if (maxVw <= minVw)
    throw new RangeError(`[vanity] fluid maxVw must be greater than minVw; received ${minVw} → ${maxVw}`)

  const slope = (max - min) / (maxVw - minVw)
  const intercept = min - slope * minVw
  const preferred = calc(length.px(roundNumber(intercept))).add(`${roundNumber(slope * 100)}vw`)
  return clamp(length.px(min), preferred, length.px(max))
}

function validateFinite(value: number, role: string): void {
  if (!Number.isFinite(value))
    throw new RangeError(`[vanity] ${role} must be finite; received ${value}`)
}

function roundNumber(value: number): number {
  return Math.round(value * 1e6) / 1e6
}
