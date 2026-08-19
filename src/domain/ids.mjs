import { randomBytes } from 'node:crypto';

import { invalidInput, invalidState } from './errors.mjs';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIXES = Object.freeze({
  change: 'CHG',
  decision: 'DEC',
  evidence: 'EVD',
  knowledge: 'KNW',
});

const ULID_BODY_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function prefixForKind(kind) {
  const prefix = PREFIXES[kind];
  if (!prefix) {
    throw invalidState(`Unsupported SDD record kind: ${String(kind)}`);
  }
  return prefix;
}

export function validateId(id, kind) {
  const prefix = prefixForKind(kind);

  if (typeof id !== 'string') {
    throw invalidInput(`${kind} id must be a string`);
  }

  const expectedPrefix = `${prefix}-`;
  if (
    !id.startsWith(expectedPrefix)
    || !ULID_BODY_RE.test(id.slice(expectedPrefix.length))
  ) {
    throw invalidInput(`${kind} id must match ${prefix}-<ULID>`, { id });
  }

  return id;
}


export function createId(kind, now = Date.now()) {
  return `${prefixForKind(kind)}-${createUlidBody(now)}`;
}

export function createIdFactory() {
  return (kind) => createId(kind);
}

function createUlidBody(now) {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw invalidState('ULID timestamp must be a non-negative safe integer');
  }

  let time = BigInt(now);
  let timePart = '';
  for (let index = 0; index < 10; index += 1) {
    timePart = ALPHABET[Number(time & 31n)] + timePart;
    time >>= 5n;
  }

  const bytes = randomBytes(10);
  let randomValue = 0n;
  for (const byte of bytes) {
    randomValue = (randomValue << 8n) | BigInt(byte);
  }

  let randomPart = '';
  for (let index = 0; index < 16; index += 1) {
    randomPart = ALPHABET[Number(randomValue & 31n)] + randomPart;
    randomValue >>= 5n;
  }

  return `${timePart}${randomPart}`;
}
