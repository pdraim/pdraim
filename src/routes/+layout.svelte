<script lang="ts">
	import '../app.css';
	import DesktopIcons from '$lib/components/desktop-icons.svelte';
	import ChatRoom from '$lib/components/chat-room.svelte';
	import { chatState } from '$lib/states/chat.svelte';

	let { children, data } = $props();

	$effect(() => {
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
			cookiePresent: document.cookie.includes('session=')
		});
	});

	$effect(() => {
		console.debug('Updating global chatState with data.user:', data.user);
		chatState.setCurrentUser(data.user);
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