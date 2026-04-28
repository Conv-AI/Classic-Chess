export function debugLog(scope: string, message: string, ...args: unknown[]) {
  console.info(`[${scope}] ${message}`, ...args);
}
