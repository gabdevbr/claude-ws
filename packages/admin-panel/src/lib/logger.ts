export function createLogger(prefix: string) {
  return {
    info: (message: string, ...args: unknown[]) => {
      console.log(`[INFO] [${prefix}]`, message, ...args);
    },
    error: (message: string, ...args: unknown[]) => {
      console.error(`[ERROR] [${prefix}]`, message, ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
      console.warn(`[WARN] [${prefix}]`, message, ...args);
    },
    debug: (message: string, ...args: unknown[]) => {
      if (process.env.DEBUG) {
        console.debug(`[DEBUG] [${prefix}]`, message, ...args);
      }
    },
  };
}
