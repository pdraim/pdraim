import { TURNSTILE_SECRET_KEY } from '$env/static/private';
import { createLogger } from './logger.server';

const log = createLogger('turnstile');

interface TurnstileVerifyResponse {
    "success": boolean;
    "error-codes"?: string[];
    "challenge_ts"?: string;
    "hostname"?: string;
    "action"?: string;
    "cdata"?: string;
}

export async function validateTurnstileToken(token: string, remoteip?: string): Promise<boolean> {
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