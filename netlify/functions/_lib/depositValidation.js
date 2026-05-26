// depositValidation.js
// Pure validation helpers extracted from etherfuse-deposit.js
// Zero dependencies — testable in isolation.

const MONTO_MINIMO_MXN = 40
const MONTO_MAXIMO_MXN = 100_000

/**
 * Validate deposit amount is a valid number within [40, 100000] MXN.
 * @param {unknown} amount
 * @returns {number} validated amount
 * @throws {Error}
 */
export function validateAmount(amount) {
  const n = Number(amount)
  if (!n || isNaN(n)) {
    throw new Error('montoMxn requerido y debe ser numérico')
  }
  if (n < MONTO_MINIMO_MXN) {
    throw new Error(`Monto mínimo: $${MONTO_MINIMO_MXN} MXN`)
  }
  if (n > MONTO_MAXIMO_MXN) {
    throw new Error(`Monto máximo: $${MONTO_MAXIMO_MXN.toLocaleString('es-MX')} MXN`)
  }
  return n
}

/**
 * Validate KYC status is 'approved'.
 * @param {string|undefined|null} kycStatus
 * @throws {Error}
 */
export function validateKyc(kycStatus) {
  if (kycStatus !== 'approved') {
    throw new Error('KYC pendiente')
  }
}

/**
 * Validate userId is present and non-empty.
 * @param {unknown} userId
 * @throws {Error}
 */
export function validateUserId(userId) {
  if (!userId) {
    throw new Error('usuarioId requerido')
  }
}

// Constants re-exported for consumers that need them
export { MONTO_MINIMO_MXN, MONTO_MAXIMO_MXN }
