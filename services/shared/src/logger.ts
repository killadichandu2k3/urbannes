type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, service: string, message: string, meta?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    service,
    message,
    ...meta,
  };

  console.log(JSON.stringify(line));
}

export function createLogger(service: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => emit('debug', service, message, meta),
    info: (message: string, meta?: Record<string, unknown>) => emit('info', service, message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => emit('warn', service, message, meta),
    error: (message: string, meta?: Record<string, unknown>) => emit('error', service, message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
