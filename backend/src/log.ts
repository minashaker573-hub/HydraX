/**
 * HYDRAX backend logging.
 *
 * Same level vocabulary as the firmware, so device and server logs read the
 * same way when they sit side by side during an incident.
 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

const ORDER: Record<LogLevel, number> = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

let threshold: LogLevel = (process.env.HYDRAX_LOG_LEVEL as LogLevel | undefined) ?? 'INFO';
let silent = false;

export function setLogLevel(level: LogLevel): void {
  threshold = level;
}

/** Used by tests so a passing run stays readable. */
export function setLogSilent(value: boolean): void {
  silent = value;
}

function write(level: LogLevel, tag: string, message: string): void {
  if (silent || ORDER[level] > ORDER[threshold]) return;
  const line = `[${new Date().toISOString()}][${level}][${tag}] ${message}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

export const log = {
  error: (tag: string, message: string): void => write('ERROR', tag, message),
  warn: (tag: string, message: string): void => write('WARN', tag, message),
  info: (tag: string, message: string): void => write('INFO', tag, message),
  debug: (tag: string, message: string): void => write('DEBUG', tag, message),
};
