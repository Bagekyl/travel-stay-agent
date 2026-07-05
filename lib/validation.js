const MAX_LIMIT = 24;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(message) {
  return { ok: false, error: { code: 'INVALID_REQUEST', message } };
}

function optionalStringArray(input, field) {
  const value = input[field];
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) return invalid(`${field} must be an array`);
  if (!value.every((item) => typeof item === 'string')) {
    return invalid(`${field} must contain only strings`);
  }
  return { ok: true, value };
}

function optionalBoolean(input, field) {
  const value = input[field];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'boolean') return invalid(`${field} must be a boolean`);
  return { ok: true, value };
}

function optionalPositiveInteger(input, field) {
  const value = input[field];
  if (value === undefined) return { ok: true, value: undefined };
  if (!Number.isInteger(value) || value <= 0) return invalid(`${field} must be a positive integer`);
  return { ok: true, value };
}

function limitValue(input, defaultLimit = 5) {
  const result = optionalPositiveInteger(input, 'limit');
  if (!result.ok) return result;
  return { ok: true, value: Math.min(result.value || defaultLimit, MAX_LIMIT) };
}

function validateBudget(input) {
  const budget = input.budget;
  if (budget === undefined) return { ok: true, value: undefined };
  if (!isPlainObject(budget)) return invalid('budget must be an object');
  const { min, max } = budget;
  if (min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) {
    return invalid('budget.min must be a finite number');
  }
  if (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max))) {
    return invalid('budget.max must be a finite number');
  }
  if (min !== undefined && max !== undefined && min > max) {
    return invalid('budget.min must be less than or equal to budget.max');
  }
  return { ok: true, value: { min, max } };
}

function requireBody(input) {
  if (input === undefined || input === null) return {};
  if (!isPlainObject(input)) throw new Error('request body must be a JSON object');
  return input;
}

module.exports = {
  invalid,
  isPlainObject,
  limitValue,
  optionalBoolean,
  optionalPositiveInteger,
  optionalStringArray,
  requireBody,
  validateBudget,
};
