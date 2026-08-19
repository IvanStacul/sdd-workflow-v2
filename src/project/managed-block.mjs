export function replaceManagedBlock(
  original,
  {
    startMarker,
    endMarker,
    body,
    label,
  },
) {
  const startCount = countOccurrences(original, startMarker);
  const endCount = countOccurrences(original, endMarker);

  if (startCount !== endCount || startCount > 1) {
    throw new Error(
      `${label} has invalid managed markers; expected zero or one complete block`,
    );
  }

  const block = `${startMarker}\n${body.trim()}\n${endMarker}`;

  if (startCount === 0) {
    if (original === '') {
      return `${block}\n`;
    }

    const separator = original.endsWith('\n\n')
      ? ''
      : original.endsWith('\n')
        ? '\n'
        : '\n\n';

    return `${original}${separator}${block}\n`;
  }

  const start = original.indexOf(startMarker);
  const end = original.indexOf(endMarker, start);
  const after = end + endMarker.length;

  return `${original.slice(0, start)}${block}${original.slice(after)}`;
}

export function containsOutsideManagedBlock(
  original,
  {
    startMarker,
    endMarker,
    pattern,
  },
) {
  const start = original.indexOf(startMarker);
  const end = original.indexOf(endMarker);

  if (start >= 0 && end > start) {
    const without = `${original.slice(0, start)}${original.slice(
      end + endMarker.length,
    )}`;
    return pattern.test(without);
  }

  return pattern.test(original);
}

function countOccurrences(text, value) {
  if (value === '') return 0;
  let count = 0;
  let index = 0;

  while ((index = text.indexOf(value, index)) >= 0) {
    count += 1;
    index += value.length;
  }

  return count;
}
