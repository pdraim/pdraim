<script lang="ts">
	import '../app.css';;
	import { chatState } from '$lib/states/chat.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	let { children, data } = $props();
	let isVisible = $state(true);
	let statusInterval = $state<number | undefined>(undefined);
	let lastUserUpdate = $state<string | null>(null);
	let updateInProgress = $state(false);
	let idleTimeout = $state<number | undefined>(undefined);

	// New throttle state variables
	let lastSentStatus = $state<string | null>(null);
	let lastStatusSentAt = $state<number>(0);
	let lastUserActivity = $state<number>(Date.now());
	const STATUS_UPDATE_INTERVAL = 15000; // 15 seconds
	const THROTTLE_TIME_MS = 10000; // 10 seconds
	const FORCE_UPDATE_INTERVAL = 5 * 60000; // 5 minutes
	const IDLE_TIMEOUT = 5 * 60000; // 5 minutes of inactivity = idle

	type UserStatus = 'online' | 'offline' | 'busy' | 'idle';

	async function updateUserStatus(status: UserStatus) {
		if (!data.user?.id || updateInProgress) return;
		
		const now = Date.now();
		const timeSinceLastUpdate = now - lastStatusSentAt;
		
		if (
			status === lastSentStatus && 
			timeSinceLastUpdate < FORCE_UPDATE_INTERVAL &&
			timeSinceLastUpdate < THROTTLE_TIME_MS
		) {
			console.debug('Skipping status update - no change and within throttle period:', {
				status,
				timeSinceLastUpdate,
				lastUpdate: new Date(lastStatusSentAt).toISOString()
			});
			return;
		}

		updateInProgress = true;
		const timestamp = new Date().toISOString();
		console.debug('Updating user status:', {
			userId: data.user.id,
			status,
			timestamp,
			reason: status !== lastSentStatus ? 'status_changed' : 'force_update',
			timeSinceLastUpdate,
			trigger: new Error().stack?.split('\n')[2]?.trim(),
			hasSession: true,
			cookiePresent: browser ? document.cookie.includes('session=') : false
		});

		try {
			if (status === 'online' && !document.cookie.includes('session=')) {
				console.debug('Waiting for session cookie before status update...');
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			const response = await fetch('/api/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ 
					status,
					lastSeen: timestamp
				})
			});
			
			if (!response.ok) {
				console.error('Failed to update user status:', await response.json());
			} else {
				lastSentStatus = status;
				lastStatusSentAt = now;
				console.debug('Status update successful:', {
					userId: data.user.id,
					status,
					cookiePresent: document.cookie.includes('session=')
				});
			}
		} catch (error) {
			console.error('Error updating user status:', error);
		} finally {
			updateInProgress = false;
		}
	}

	function resetIdleTimer() {
		if (idleTimeout) {
			window.clearTimeout(idleTimeout);
		}
		
		lastUserActivity = Date.now();
		
		if (lastSentStatus === 'idle') {
			updateUserStatus('online');
		}
		
		idleTimeout = window.setTimeout(() => {
			if (isVisible && Date.now() - lastUserActivity >= IDLE_TIMEOUT) {
				updateUserStatus('idle');
			}
		}, IDLE_TIMEOUT);
	}

	function handleUserActivity() {
		resetIdleTimer();
	}

	function startStatusTicker() {
		if (statusInterval) return;
		
		console.debug('Starting status ticker');
		const tickHandler = () => {
			if (isVisible && lastSentStatus !== 'idle') {
				updateUserStatus('online');
			}
		};

		statusInterval = window.setInterval(tickHandler, STATUS_UPDATE_INTERVAL);
	}

	function stopStatusTicker() {
		if (!statusInterval) return;
		console.debug('Stopping status ticker');
		window.clearInterval(statusInterval);
		statusInterval = undefined;
	}

	function handleVisibilityChange() {
		if (!browser) return;
		isVisible = document.visibilityState === 'visible';
		
		if (isVisible) {
			resetIdleTimer();
			updateUserStatus('online');
			startStatusTicker();
		} else {
			updateUserStatus('busy');
			stopStatusTicker();
		}
	}

	function cleanup() {
		if (!browser) return;
		console.debug('Running cleanup - Setting user status to offline');
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		window.removeEventListener('mousemove', handleUserActivity);
		window.removeEventListener('keydown', handleUserActivity);
		window.removeEventListener('click', handleUserActivity);
		if (idleTimeout) {
			window.clearTimeout(idleTimeout);
		}
		stopStatusTicker();
		updateUserStatus('offline');
	}

	onMount(() => {
		if (!browser) return;

		// Set initial online status
		updateUserStatus('online');
		
		// Start monitoring for user activity
		window.addEventListener('mousemove', handleUserActivity);
		window.addEventListener('keydown', handleUserActivity);
		window.addEventListener('click', handleUserActivity);
		
		// Initialize idle timer
		resetIdleTimer();

		// Start the status ticker
		startStatusTicker();

		// Add visibility change listener
		document.addEventListener('visibilitychange', handleVisibilityChange);
		
		// Add beforeunload listener for cleanup
		window.addEventListener('beforeunload', cleanup);

		// Cleanup on component destroy
		return () => {
			cleanup();
			window.removeEventListener('beforeunload', cleanup);
		};
	});

	$effect(() => {
		if (!browser) return;
		
		const currentUserJson = data.user ? JSON.stringify(data.user) : null;
		if (currentUserJson === lastUserUpdate) {
			console.debug('Skipping duplicate user update');
			return;
		}
		
		lastUserUpdate = currentUserJson;
		
		console.debug('Layout reactive update - Session state:', {
			timestamp: new Date().toISOString(),
			hasUser: !!data.user,
			userDetails: data.user ? {
				nickname: data.user.nickname,
				status: data.user.status,
				id: data.user.id
			} : null,
			hasSession: !!data.session,
			sessionDetails: data.session ? {
				id: data.session.id,
				expiresAt: new Date(data.session.expiresAt)
			} : null,
			cookiePresent: document.cookie.includes('session='),
			isVisible
		});
		
		if (data.session?.id) {
			console.debug('Updating global chatState with data.user:', data.user);
			chatState.setCurrentUser(data.user);
		}
	});
</script>

<svelte:head>
	<title>{data.meta.title}</title>
	<meta name="description" content={data.meta.description} />
	<meta name="keywords" content={data.meta.keywords} />
	<meta name="language" content="fr" />
	
	<!-- Open Graph / Facebook -->
	<meta property="og:locale" content={data.meta.locale} />
	<meta property="og:type" content={data.meta.type} />
	<meta property="og:url" content={data.meta.url} />
	<meta property="og:title" content={data.meta.title} />
	<meta property="og:description" content={data.meta.description} />
	<meta property="og:image" content={data.meta.ogImage} />
	
	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={data.meta.url} />
	<meta property="twitter:title" content={data.meta.title} />
	<meta property="twitter:description" content={data.meta.description} />
	<meta property="twitter:image" content={data.meta.ogImage} />
	
	<!-- Additional Meta Tags -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="theme-color" content="#2195f2" />
	<link rel="canonical" href={data.meta.url} />
	<link rel="alternate" hreflang="fr" href={data.meta.url} />
</svelte:head>

<div class="windows-xp-bg">
	{@render children()}
</div>

<style>
	.windows-xp-bg {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		overflow: hidden;
		background: linear-gradient(
			to bottom,
			#2195f2 0%,    /* Lighter blue at the top */
			#4aa6e2 25%,   /* Mid-light blue */
			#7ab8e0 50%,   /* Mid blue */
			#86c55c 75%,   /* Blue-green transition */
			#90d047 100%   /* Bright green at the bottom */
		);
	}
</style>