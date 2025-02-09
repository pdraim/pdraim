<script lang="ts">
    import ChatRoom from '$lib/components/chat-room.svelte';
</script>
    
<div class="content-wrapper">
    <ChatRoom />
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