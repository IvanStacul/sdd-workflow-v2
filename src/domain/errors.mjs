export class SddError extends Error {
  constructor(code, message, details = {}, options = {}) {
    super(message, options);
    this.name = 'SddError';
    this.code = code;
    this.details = details;
  }
}

export function sddError(code, message, details = {}, cause) {
  return new SddError(
    code,
    message,
    details,
    cause === undefined ? {} : { cause },
  );
}

export function invalidInput(message, details = {}, cause) {
  return sddError('invalid_input', message, details, cause);
}

export function invalidState(message, details = {}, cause) {
  return sddError('invalid_state', message, details, cause);
}

export function closureRejected(message, details = {}, cause) {
  return sddError('closure_rejected', message, details, cause);
}

export function relationInvalid(message, details = {}, cause) {
  return sddError('relation_invalid', message, details, cause);
}
