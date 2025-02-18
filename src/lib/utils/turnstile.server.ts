import { TURNSTILE_SECRET_KEY } from '$env/static/private';
import { createLogger } from './logger.server';

const log = createLogger('turnstile');
const isDev = process.env.NODE_ENV === 'development';

interface TurnstileVerifyResponse {
    "success": boolean;
    "error-codes"?: string[];
    "challenge_ts"?: string;
    "hostname"?: string;
    "action"?: string;
    "cdata"?: string;
}

export async function validateTurnstileToken(token: string, remoteip?: string): Promise<boolean> {
    // Always return true in development mode
    if (isDev) {
        log.debug('Development mode: bypassing Turnstile validation');
        return true;
    }

    try {
        const formData = new FormData();
        formData.append('secret', TURNSTILE_SECRET_KEY);
        formData.append('response', token);
        if (remoteip) {
            formData.append('remoteip', remoteip);
        }

        const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const result = await fetch(url, {
            body: formData,
            method: 'POST',
        });

        const outcome: TurnstileVerifyResponse = await result.json();
        
        if (!outcome.success) {
            log.warn('Turnstile validation failed', {
                errors: outcome["error-codes"],
                remoteip: remoteip ? `${remoteip.split('.')[0]}.xxx.xxx.xxx` : undefined
            });
        }
        
        return outcome.success;
    } catch (error) {
        log.error('Error validating Turnstile token', { error });
        return false;
    }
} 