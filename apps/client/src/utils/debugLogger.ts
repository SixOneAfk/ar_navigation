type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

type DebugLoggerOptions = {
  enabled?: boolean;
  minLevel?: LogLevel;
  throttleMs?: number;
};

type LogEntry = {
  level: LogLevel;
  component: string;
  message: string;
  timestamp: string;
};

const DEFAULT_THROTTLE_MS = 1000;
const DEBUG_ENABLED = import.meta.env?.VITE_DEBUG_SENSORS === 'true';
const TERMINAL_LOGGING_ENABLED =
  import.meta.env?.DEV === true || import.meta.env?.VITE_NAVIGATION_TERMINAL_LOGS === 'true';

function getTimeStamp() {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getSeverityRank(level: LogLevel) {
  switch (level) {
    case 'DEBUG':
      return 10;
    case 'INFO':
      return 20;
    case 'WARN':
      return 30;
    case 'ERROR':
      return 40;
    default:
      return 20;
  }
}

function forwardNavigationLogToTerminal(entry: LogEntry) {
  if (!TERMINAL_LOGGING_ENABLED || !entry.component.startsWith('Navigation')) return;

  void fetch('/__navigation-terminal-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
    keepalive: true,
  }).catch(() => undefined);
}

class DebugLogger {
  private enabled: boolean;
  private minLevel: LogLevel;
  private throttleMs: number;
  private lastLogAt: Map<string, number>;

  constructor(options: DebugLoggerOptions = {}) {
    this.enabled = options.enabled ?? DEBUG_ENABLED;
    this.minLevel = options.minLevel ?? 'INFO';
    this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
    this.lastLogAt = new Map();
  }

  private shouldLog(level: LogLevel, component: string) {
    if (!this.enabled) {
      return false;
    }

    if (getSeverityRank(level) < getSeverityRank(this.minLevel)) {
      return false;
    }

    const now = Date.now();
    const last = this.lastLogAt.get(`${component}:${level}`) ?? 0;
    const shouldThrottle = now - last < this.throttleMs;

    if (shouldThrottle && level !== 'ERROR') {
      return false;
    }

    this.lastLogAt.set(`${component}:${level}`, now);
    return true;
  }

  private emit(level: LogLevel, component: string, message: string) {
    if (!this.shouldLog(level, component)) {
      return;
    }

    const entry: LogEntry = {
      level,
      component,
      message,
      timestamp: getTimeStamp(),
    };

    const formatted = `[${entry.timestamp}][${entry.component}][${entry.level}] ${entry.message}`;
    if (level === 'ERROR') {
      console.error(formatted);
    } else if (level === 'WARN') {
      console.warn(formatted);
    } else if (level === 'DEBUG') {
      console.debug(formatted);
    } else {
      console.info(formatted);
    }

    forwardNavigationLogToTerminal(entry);
  }

  debug(component: string, message: string) {
    this.emit('DEBUG', component, message);
  }

  info(component: string, message: string) {
    this.emit('INFO', component, message);
  }

  warn(component: string, message: string) {
    this.emit('WARN', component, message);
  }

  error(component: string, message: string) {
    this.emit('ERROR', component, message);
  }
}

export const debugLogger = new DebugLogger();

export function createDebugLogger(options?: DebugLoggerOptions) {
  return new DebugLogger(options);
}

export function isDebugEnabled() {
  return debugLogger['enabled'];
}