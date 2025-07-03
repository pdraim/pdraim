import type { RequestHandler } from '@sveltejs/kit';
import type { RegisterResponseSuccess, RegisterResponseError } from '$lib/types/payloads';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { hashPassword } from '$lib/utils/password';
import { createRegistrationSchema, DEFAULT_PASSWORD_CONSTRAINTS } from '$lib/validation/password';
import { createLogger } from '$lib/utils/logger.server';
import { eq } from 'drizzle-orm/sql';

const log = createLogger('register-server');
const isDev = process.env.NODE_ENV === 'development';

// In-memory map to track failed captcha attempts per IP
const captchaAttempts = new Map<string, { count: number, lastAttempt: number }>();

// Cleanup old entries every hour
setInterval(() => {
	const now = Date.now();
	const ONE_HOUR = 60 * 60 * 1000;
	for (const [ip, data] of captchaAttempts.entries()) {
		if (now - data.lastAttempt > ONE_HOUR) {
			captchaAttempts.delete(ip);
		}
	}
}, 60 * 60 * 1000);

export const POST: RequestHandler = async ({ request }) => {
	log.debug('New registration attempt received');

	if (request.method !== 'POST') {
		log.warn('Invalid method used', { method: request.method });
		return new Response(JSON.stringify({ error: 'Method Not Allowed' } as RegisterResponseError), { status: 405 });
	}

	// Get the IP address for rate limiting and Turnstile validation
	const ip = request.headers.get('x-forwarded-for') || 'unknown';
	const maskedIp = ip.split('.').map((octet, idx) => idx < 3 ? 'xxx' : octet).join('.');
	const now = Date.now();
	const attemptData = captchaAttempts.get(ip) || { count: 0, lastAttempt: 0 };

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		log.warn('Invalid JSON payload received');
		return new Response(JSON.stringify({ error: 'Invalid JSON' } as RegisterResponseError), { status: 400 });
	}

	const { suUsername, suPassword, suConfirmPassword, captchaAnswer, turnstileToken } = body as { 
		suUsername: string, 
		suPassword: string, 
		suConfirmPassword: string, 
		captchaAnswer: string,
		turnstileToken?: string 
	};

	// Validate input using Zod schema
	try {
		const registrationSchema = createRegistrationSchema(DEFAULT_PASSWORD_CONSTRAINTS);
		registrationSchema.parse({
			suUsername,
			suPassword,
			suConfirmPassword,
			captchaAnswer,
			turnstileToken
		});
	} catch (err: any) {
		const errorMessage = err.errors?.[0]?.message || 'Invalid input data';
		log.warn('Registration validation failed', { error: errorMessage });
		return new Response(JSON.stringify({ error: errorMessage } as RegisterResponseError), { status: 400 });
	}


	// Validate PDR captcha
	const normalizedAnswer = captchaAnswer.trim().toLowerCase();
	if (normalizedAnswer !== 'point de rencontre') {
		attemptData.count++;
		attemptData.lastAttempt = now;
		captchaAttempts.set(ip, attemptData);
		log.warn('Invalid captcha answer', { maskedIp, attemptCount: attemptData.count });
		return new Response(JSON.stringify({ error: 'Invalid answer to the PDR question' } as RegisterResponseError), { status: 400 });
	}

	// Reset captcha attempts on success
	captchaAttempts.delete(ip);

	// Trim input values (validation already done by Zod)
	const username = suUsername.trim();
	const password = suPassword.trim();

	// Check if nickname already exists
	const existingUser = await db.select().from(users).where(eq(users.nickname, username));
	if (existingUser.length > 0) {
		log.warn('Username already exists', { username });
		return new Response(JSON.stringify({ error: 'This username is already taken' } as RegisterResponseError), { status: 409 });
	}

	// Securely hash the user's password.
	let hashedPassword: string;
	try {
		hashedPassword = await hashPassword(password);
	} catch {
		log.error('Error hashing password');
		return new Response(JSON.stringify({ error: 'Internal Server Error' } as RegisterResponseError), { status: 500 });
	}
	// Insert the new user into the database.
	try {
		await db.insert(users).values({
			nickname: username,
			password: hashedPassword,
			createdAt: Date.now()
		});
		log.info(`User ${username} registered successfully`);
	} catch (err: unknown) {
		log.error('Database insertion error', { error: err as object });
		// Assume a duplicate user error if the email (or derived unique field) already exists.
		return new Response(JSON.stringify({ error: 'User registration failed. Possibly user already exists.' } as RegisterResponseError), { status: 409 });
	}

	return new Response(JSON.stringify({ success: true } as RegisterResponseSuccess), { status: 201 });
};
