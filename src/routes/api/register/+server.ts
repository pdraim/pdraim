import type { RequestHandler } from '@sveltejs/kit';
import type { RegisterResponseSuccess, RegisterResponseError } from '$lib/types/payloads';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { hashPassword } from '$lib/utils/password';

// In-memory map to track failed captcha attempts per IP
const captchaAttempts = new Map<string, { count: number, lastAttempt: number }>();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const POST: RequestHandler = async ({ request }) => {
	console.log("[Register] New registration attempt received");

	// Only allow POST
	if (request.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method Not Allowed' } as RegisterResponseError), { status: 405 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		console.log("[Register] Invalid JSON payload received");
		return new Response(JSON.stringify({ error: 'Invalid JSON' } as RegisterResponseError), { status: 400 });
	}

	const { suUsername, suPassword, suConfirmPassword, captchaAnswer } = body as { suUsername: string, suPassword: string, suConfirmPassword: string, captchaAnswer: string };

	// Destructure and validate required fields from the payload.
	if (typeof suUsername !== 'string' || typeof suPassword !== 'string' ||
	    typeof suConfirmPassword !== 'string' || typeof captchaAnswer !== 'string') {
		console.log("[Register] Missing or invalid input fields");
		return new Response(JSON.stringify({ error: 'Missing or invalid input fields' } as RegisterResponseError), { status: 400 });
	}

	// Trim input values.
	const username = suUsername.trim();
	const password = suPassword.trim();
	const confirmPassword = suConfirmPassword.trim();
	const captcha = captchaAnswer.trim().toLowerCase();

	// Basic validations.
	if (!username || !password || !confirmPassword || !captcha) {
		return new Response(JSON.stringify({ error: 'All fields must be filled' } as RegisterResponseError), { status: 400 });
	}

	if (username.length > 32) {
		return new Response(JSON.stringify({ error: 'Username must be at most 32 characters' } as RegisterResponseError), { status: 400 });
	}
	// Only allow letters, numbers, underscores, and dashes in the username.
	const usernameRegex = /^[a-zA-Z0-9_-]+$/;
	if (!usernameRegex.test(username)) {
		return new Response(JSON.stringify({ error: 'Invalid username. Only letters, numbers, underscores, and dashes are allowed.' } as RegisterResponseError), { status: 400 });
	}

	if (password !== confirmPassword) {
		return new Response(JSON.stringify({ error: 'Passwords do not match' } as RegisterResponseError), { status: 400 });
	}

	if (password.length < 8 || password.length > 64) {
		return new Response(JSON.stringify({ error: 'Password must be between 8 and 64 characters' } as RegisterResponseError), { status: 400 });
	}

	// Captcha validation logic.
	// Expected captcha answer.
	const expectedCaptcha = "point de rencontre";
	// Get the IP address for rate limiting. In production, a more reliable method should be used.
	const ip = request.headers.get('x-forwarded-for') || 'unknown';
	const maskedIp = ip.split('.').map((octet, idx) => idx < 3 ? 'xxx' : octet).join('.');
	const now = Date.now();
	const attemptData = captchaAttempts.get(ip) || { count: 0, lastAttempt: 0 };
	// If the user has failed three or more times, apply aggressive exponential backoff.
	if (attemptData.count >= 3) {
		const delay = Math.pow(2, attemptData.count - 3 + 1) * 1000; // delay in milliseconds
		console.log(`[Register] Rate limit exceeded for IP ${maskedIp} - applying ${delay}ms delay`);
		await sleep(delay);
	}
	if (captcha !== expectedCaptcha) {
		attemptData.count++;
		attemptData.lastAttempt = now;
		captchaAttempts.set(ip, attemptData);
		console.log(`[Register] Captcha failed for IP ${maskedIp}. Attempt count: ${attemptData.count}`);
		const remaining = Math.max(0, 3 - attemptData.count);
		return new Response(JSON.stringify({ error: `Incorrect captcha answer. ${remaining > 0 ? remaining + " attempt(s) remaining." : "Please wait before trying again."}` } as RegisterResponseError), { status: 400 });
	}
	// Reset captcha attempt data on success.
	if (captcha === expectedCaptcha) {
		captchaAttempts.delete(ip);
	}

	// Securely hash the user's password.
	let hashedPassword: string;
	try {
		hashedPassword = await hashPassword(password);
	} catch {
		console.log("[Register] Error hashing password");
		return new Response(JSON.stringify({ error: 'Internal Server Error' } as RegisterResponseError), { status: 500 });
	}
	// Insert the new user into the database.
	try {
		await db.insert(users).values({
			password: hashedPassword,
			nickname: username,
			createdAt: Date.now()
		});
		console.log(`[Register] User ${username} registered successfully`);
	} catch (err) {
		console.log("Database insertion error", err);
		// Assume a duplicate user error if the email (or derived unique field) already exists.
		return new Response(JSON.stringify({ error: 'User registration failed. Possibly user already exists.' } as RegisterResponseError), { status: 409 });
	}

	return new Response(JSON.stringify({ success: true } as RegisterResponseSuccess), { status: 201 });
};
