<script lang="ts">
	import '../app.css';;
	import { chatState } from '$lib/states/chat.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	let { children, data } = $props();
	let isVisible = $state(true);
	let statusInterval = $state<number | undefined>(undefined);
	let lastUserUpdate = $state<string | null>(null);

	async function updateUserStatus(status: 'online' | 'offline' | 'busy') {
		if (!data.user?.id) return;
		
		const timestamp = new Date().toISOString();
		console.debug('Updating user status:', {
			userId: data.user.id,
			status,
			timestamp,
			trigger: new Error().stack?.split('\n')[2]?.trim()
		});

		try {
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
			}
		} catch (error) {
			console.error('Error updating user status:', error);
		}
	}

	function startStatusTicker() {
		if (statusInterval) return;
		
		console.debug('Starting status ticker');
		const tickHandler = () => {
			if (isVisible) {
				updateUserStatus('online');
			}
		};

		statusInterval = window.setInterval(tickHandler, 60000); // Every minute
		// Run immediately on start
		tickHandler();
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
		updateUserStatus(isVisible ? 'online' : 'busy');
		
		// Start or stop the ticker based on visibility
		if (isVisible) {
			startStatusTicker();
		} else {
			stopStatusTicker();
		}
	}

	function cleanup() {
		if (!browser) return;
		console.debug('Running cleanup - Setting user status to offline');
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		stopStatusTicker();
		updateUserStatus('offline');
	}

	onMount(() => {
		if (!browser) return;

		// Set initial online status
		updateUserStatus('online');

		// Start the status ticker
		startStatusTicker();

		// Add visibility change listener
		document.addEventListener('visibilitychange', handleVisibilityChange);

		// Cleanup on unmount
		return () => {
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
		
		// Only update chat state if we have valid session data
		if (data.session?.id) {
			console.debug('Updating global chatState with data.user:', data.user);
			chatState.setCurrentUser(data.user);
		}
	});
</script>

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