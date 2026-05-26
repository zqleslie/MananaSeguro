import { describe, it, expect } from 'vitest'
import { validateAmount, validateKyc, validateUserId, MONTO_MINIMO_MXN, MONTO_MAXIMO_MXN } from './depositValidation.js'

// ─── validateAmount ───────────────────────────────────────────────────────────

describe('validateAmount', () => {
  it('accepts a valid number at the minimum boundary (40)', () => {
    expect(validateAmount(40)).toBe(40)
  })

  it('accepts a valid number at the maximum boundary (100000)', () => {
    expect(validateAmount(100_000)).toBe(100_000)
  })

  it('accepts a valid number within range', () => {
    expect(validateAmount(500)).toBe(500)
    expect(validateAmount(1000)).toBe(1000)
    expect(validateAmount(99999)).toBe(99999)
  })

  it('accepts numeric strings (Number coercion)', () => {
    expect(validateAmount('100')).toBe(100)
    expect(validateAmount('40')).toBe(40)
  })

  it('rejects amount below minimum', () => {
    expect(() => validateAmount(39)).toThrow('Monto mínimo: $40 MXN')
    expect(() => validateAmount(1)).toThrow('Monto mínimo: $40 MXN')
    expect(() => validateAmount(0)).toThrow('montoMxn requerido y debe ser numérico')
    expect(() => validateAmount(-1)).toThrow('Monto mínimo: $40 MXN')
  })

  it('rejects amount above maximum', () => {
    expect(() => validateAmount(100_001)).toThrow('Monto máximo: $100,000 MXN')
    expect(() => validateAmount(999_999)).toThrow('Monto máximo: $100,000 MXN')
  })

  it('rejects NaN', () => {
    expect(() => validateAmount(NaN)).toThrow('montoMxn requerido y debe ser numérico')
  })

  it('rejects non-numeric strings', () => {
    expect(() => validateAmount('abc')).toThrow('montoMxn requerido y debe ser numérico')
    expect(() => validateAmount('')).toThrow('montoMxn requerido y debe ser numérico')
  })

  it('rejects null and undefined', () => {
    expect(() => validateAmount(null)).toThrow('montoMxn requerido y debe ser numérico')
    expect(() => validateAmount(undefined)).toThrow('montoMxn requerido y debe ser numérico')
  })

  it('rejects boolean values', () => {
    // Number(true) = 1 → below minimum
    expect(() => validateAmount(true)).toThrow('Monto mínimo: $40 MXN')
    // Number(false) = 0 → falsy, caught by !n
    expect(() => validateAmount(false)).toThrow('montoMxn requerido y debe ser numérico')
  })
})

// ─── validateKyc ──────────────────────────────────────────────────────────────

describe('validateKyc', () => {
  it('passes when kycStatus is "approved"', () => {
    expect(validateKyc('approved')).toBeUndefined()
  })

  it('throws for "pending"', () => {
    expect(() => validateKyc('pending')).toThrow('KYC pendiente')
  })

  it('throws for "rejected"', () => {
    expect(() => validateKyc('rejected')).toThrow('KYC pendiente')
  })

  it('throws for undefined', () => {
    expect(() => validateKyc(undefined)).toThrow('KYC pendiente')
  })

  it('throws for null', () => {
    expect(() => validateKyc(null)).toThrow('KYC pendiente')
  })

  it('throws for empty string', () => {
    expect(() => validateKyc('')).toThrow('KYC pendiente')
  })

  it('throws for any other value', () => {
    expect(() => validateKyc('something')).toThrow('KYC pendiente')
  })
})

// ─── validateUserId ───────────────────────────────────────────────────────────

describe('validateUserId', () => {
  it('passes for a valid string userId', () => {
    expect(validateUserId('user-123')).toBeUndefined()
    expect(validateUserId('abc')).toBeUndefined()
  })

  it('throws for undefined', () => {
    expect(() => validateUserId(undefined)).toThrow('usuarioId requerido')
  })

  it('throws for null', () => {
    expect(() => validateUserId(null)).toThrow('usuarioId requerido')
  })

  it('throws for empty string', () => {
    expect(() => validateUserId('')).toThrow('usuarioId requerido')
  })

  it('throws for 0', () => {
    expect(() => validateUserId(0)).toThrow('usuarioId requerido')
  })
})

// ─── constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('exports MONTO_MINIMO_MXN as 40', () => {
    expect(MONTO_MINIMO_MXN).toBe(40)
  })

  it('exports MONTO_MAXIMO_MXN as 100000', () => {
    expect(MONTO_MAXIMO_MXN).toBe(100_000)
  })
})
