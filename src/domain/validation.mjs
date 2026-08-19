import { invalidInput } from './errors.mjs';

export function isPlainObject(value) {
  return (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

export function assertPlainObject(value, name) {
  if (!isPlainObject(value)) {
    throw invalidInput(`${name} must be an object`);
  }
  return value;
}

export function assertAllowedKeys(object, allowed, name) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw invalidInput(`${name} contains unsupported field: ${key}`, {
        field: key,
      });
    }
  }
}

export function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalidInput(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function uniqueStrings(value, name, { min = 0 } = {}) {
  if (!Array.isArray(value)) {
    throw invalidInput(`${name} must be an array`);
  }

  const normalized = value.map((entry, index) =>
    requiredString(entry, `${name}[${index}]`),
  );

  const unique = [...new Set(normalized)];
  if (unique.length < min) {
    throw invalidInput(`${name} must contain at least ${min} item(s)`);
  }

  return unique;
}

export function optionalUniqueStrings(value, name) {
  if (value === undefined) return undefined;
  const normalized = uniqueStrings(value, name);
  return normalized.length === 0 ? undefined : normalized;
}

export function clone(value) {
  return structuredClone(value);
}

export function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  );
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

