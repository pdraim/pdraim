import pino from 'pino';

const logLevel = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

class LoggerService {
    private static instance: LoggerService;
    private logger: pino.Logger;
    private moduleLoggers: Map<string, Logger>;

    private constructor() {
        this.logger = pino({
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'HH:MM:ss',
                    ignore: 'pid,hostname',
                },
            },
            level: logLevel,
        });
        this.moduleLoggers = new Map();
    }

    public static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService();
        }
        return LoggerService.instance;
    }

    public getLogger(module: string): Logger {
        if (!this.moduleLoggers.has(module)) {
            this.moduleLoggers.set(module, {
                debug: (msg: string, obj = {}) => this.logger.debug({ module, ...obj }, msg),
                info: (msg: string, obj = {}) => this.logger.info({ module, ...obj }, msg),
                warn: (msg: string, obj = {}) => this.logger.warn({ module, ...obj }, msg),
                error: (msg: string, obj = {}) => this.logger.error({ module, ...obj }, msg)
            });
        }
        return this.moduleLoggers.get(module)!;
    }
}

export interface Logger {
    debug: (msg: string, obj?: object) => void;
    info: (msg: string, obj?: object) => void;
    warn: (msg: string, obj?: object) => void;
    error: (msg: string, obj?: object) => void;
}

// Export a function to get a logger for a specific module
export const createLogger = (module: string): Logger => {
    return LoggerService.getInstance().getLogger(module);
}; 