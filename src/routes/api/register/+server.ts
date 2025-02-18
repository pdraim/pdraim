import type { RequestHandler } from '@sveltejs/kit';
import type { RegisterResponseSuccess, RegisterResponseError } from '$lib/types/payloads';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { hashPassword } from '$lib/utils/password';
import { validateTurnstileToken } from '$lib/utils/turnstile.server';
import { createLogger } from '$lib/utils/logger.server';
import { eq } from 'drizzle-orm/sql';

const log = createLogger('register-server');

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
		turnstileToken: string 
	};

	if (!suUsername || !suPassword || !suConfirmPassword || !captchaAnswer || !turnstileToken) {
		log.warn('Missing required fields', { 
			hasUsername: Boolean(suUsername),
			hasPassword: Boolean(suPassword),
			hasConfirmPassword: Boolean(suConfirmPassword),
			hasCaptcha: Boolean(captchaAnswer),
			hasTurnstileToken: Boolean(turnstileToken)
		});
		return new Response(JSON.stringify({ error: 'All fields are required' } as RegisterResponseError), { status: 400 });
	}

	// Validate Turnstile token
	const isValidTurnstile = await validateTurnstileToken(turnstileToken, ip);
	if (!isValidTurnstile) {
		log.warn('Invalid Turnstile token', { maskedIp });
		return new Response(JSON.stringify({ error: 'Security check failed. Please try again.' } as RegisterResponseError), { status: 400 });
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

	// Destructure and validate required fields from the payload.
	if (typeof suUsername !== 'string' || typeof suPassword !== 'string' ||
	    typeof suConfirmPassword !== 'string') {
		log.warn('Missing or invalid input fields');
		return new Response(JSON.stringify({ error: 'Missing or invalid input fields' } as RegisterResponseError), { status: 400 });
	}

	// Trim input values.
	const username = suUsername.trim();
	const password = suPassword.trim();
	const confirmPassword = suConfirmPassword.trim();

	// Basic validations.
	if (!username || !password || !confirmPassword) {
		log.warn('All fields must be filled');
		return new Response(JSON.stringify({ error: 'All fields must be filled' } as RegisterResponseError), { status: 400 });
	}

	if (username.length < 3) {
		log.warn('Username must be at least 3 characters');
		return new Response(JSON.stringify({ error: 'Username must be at least 3 characters' } as RegisterResponseError), { status: 400 });
	}

	if (username.length > 32) {
		log.warn('Username must be at most 32 characters');
		return new Response(JSON.stringify({ error: 'Username must be at most 32 characters' } as RegisterResponseError), { status: 400 });
	}
	// Only allow letters, numbers, underscores, and dashes in the username.
	const usernameRegex = /^[a-zA-Z0-9_-]+$/;
	if (!usernameRegex.test(username)) {
		log.warn('Invalid username. Only letters, numbers, underscores, and dashes are allowed.');
		return new Response(JSON.stringify({ error: 'Invalid username. Only letters, numbers, underscores, and dashes are allowed.' } as RegisterResponseError), { status: 400 });
	}

	if (password !== confirmPassword) {
		log.warn('Passwords do not match');
		return new Response(JSON.stringify({ error: 'Passwords do not match' } as RegisterResponseError), { status: 400 });
	}

	if (password.length < 8 || password.length > 64) {
		log.warn('Password must be between 8 and 64 characters');
		return new Response(JSON.stringify({ error: 'Password must be between 8 and 64 characters' } as RegisterResponseError), { status: 400 });
	}

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
