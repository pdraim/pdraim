<script lang="ts">
    import ChatRoom from '$lib/components/chat-room.svelte';
    import DesktopIcons from '$lib/components/desktop-icons.svelte';
    import AimLogin from '$lib/components/aim-login.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    
    let showChatRoom = $state(true);
    let showAuth = $state(false);

    function handleLoginSuccess() {
        showAuth = false;
    }
</script>
    
<div class="desktop content-wrapper">
    <DesktopIcons bind:showChatRoom bind:showAuth />
	
	{#if showChatRoom}
		<ChatRoom bind:showChatRoom initialTextStyle={data.lastTextStyle} />
	{/if}

	{#if showAuth}
		<AimLogin 
			bind:showAuth 
			onLoginSuccess={handleLoginSuccess}
		/>
	{/if}
</div>
    
<style>
    .content-wrapper {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
    }

</style>