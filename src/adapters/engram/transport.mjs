import { spawn } from 'node:child_process';

export class EngramTransportError extends Error {
  constructor(code, message, details = {}, options = {}) {
    super(message, options);
    this.name = 'EngramTransportError';
    this.code = code;
    this.details = details;
  }
}

export class EngramHttpError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name = 'EngramHttpError';
    this.status = status;
    this.body = body;
  }
}

export function createDockerExecEngramTransport({
  container = 'sdd-engram',
  baseUrl = 'http://127.0.0.1:7437',
  token = process.env.ENGRAM_HTTP_TOKEN || '',
  timeoutMs = 10000,
  run = runProcess,
} = {}) {
  if (typeof container !== 'string' || container.trim() === '') {
    throw new TypeError('container must be a non-empty string');
  }
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new TypeError('baseUrl must be a non-empty string');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('timeoutMs must be a positive integer');
  }
  if (typeof run !== 'function') {
    throw new TypeError('run must be a function');
  }

  return Object.freeze({
    async request(method, path, body) {
      const url = new URL(path, baseUrl).toString();
      const args = [
        'exec', '-i', container,
        'curl', '-sS',
        '-X', method,
        '-H', 'Content-Type: application/json',
      ];

      if (token) {
        args.push('-H', `Authorization: Bearer ${token}`);
      }

      let input = '';
      if (body !== undefined) {
        input = JSON.stringify(body);
        args.push('--data-binary', '@-');
      }

      args.push(
        '-w', '\n__SDD_HTTP_STATUS__:%{http_code}',
        url,
      );

      let result;
      try {
        result = await run('docker', args, {
          input,
          timeoutMs,
        });
      } catch (error) {
        if (error instanceof EngramTransportError) throw error;
        throw new EngramTransportError(
          'unavailable',
          'Could not execute Docker transport for Engram',
          {},
          { cause: error },
        );
      }

      if (result.exitCode !== 0) {
        throw new EngramTransportError(
          'unavailable',
          'Docker/Engram transport command failed',
          {
            exit_code: result.exitCode,
            stderr: String(result.stderr || '').trim(),
          },
        );
      }

      return parseCurlResponse(result.stdout);
    },
  });
}

function parseCurlResponse(stdout) {
  const marker = '\n__SDD_HTTP_STATUS__:';
  const index = stdout.lastIndexOf(marker);

  if (index < 0) {
    throw new EngramTransportError(
      'invalid_response',
      'Engram transport did not return an HTTP status marker',
    );
  }

  const rawBody = stdout.slice(0, index).trim();
  const rawStatus = stdout.slice(index + marker.length).trim();
  const status = Number.parseInt(rawStatus, 10);

  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new EngramTransportError(
      'invalid_response',
      'Engram transport returned an invalid HTTP status',
      { raw_status: rawStatus },
    );
  }

  let body = null;
  if (rawBody !== '') {
    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      throw new EngramTransportError(
        'invalid_response',
        'Engram returned non-JSON content',
        { status },
        { cause: error },
      );
    }
  }

  if (status < 200 || status >= 300) {
    const message = body?.error
      || body?.message
      || `Engram HTTP ${status}`;
    throw new EngramHttpError(status, message, body);
  }

  return body;
}

export function runProcess(command, args, {
  input = '',
  timeoutMs = 10000,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      settled = true;
      reject(new EngramTransportError(
        'unavailable',
        'Docker/Engram transport timed out',
        { timeout_ms: timeoutMs },
      ));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new EngramTransportError(
        'unavailable',
        'Could not start Docker/Engram transport',
        {},
        { cause: error },
      ));
    });

    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });

    child.stdin.end(input);
  });
}
