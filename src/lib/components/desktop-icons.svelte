<script lang="ts">
    let { showChatRoom = $bindable(), showAuth = $bindable() } = $props();

    function handleKeydown(event: KeyboardEvent, action: () => void) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            action();
        }
    }

    function handleChatRoomClick() {
        console.log('handleChatRoomClick');
        showChatRoom = true
    }

    function handleAuthClick() {
        console.log('handleAuthClick');
        showAuth = true;
    }
</script>

<div class="desktop-icons">
    <div 
        class="desktop-icon" 
        ondblclick={handleChatRoomClick}
        onkeydown={(e) => handleKeydown(e, handleChatRoomClick)}
        role="button" 
        tabindex="0"
    >
        <img src="/desktop/aim-desktop-icon.png" alt="Chat Room" />
        <span class="icon-label">Pdr Aim</span>
    </div>
    
    <div 
        class="desktop-icon" 
        ondblclick={handleAuthClick}
        onkeydown={(e) => handleKeydown(e, handleAuthClick)}
        role="button" 
        tabindex="0"
    >
        <img src="/desktop/application-x-shellscript.png" alt="Sign In" />
        <span class="icon-label">login</span>
    </div>
</div>

<style>
    .desktop-icons {
        position: fixed;
        top: 20px;
        left: 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .desktop-icon {
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        width: 75px;
        text-align: center;
        padding: 8px;
        border: 1px dotted transparent;
        border-radius: 2px;
        margin: 2px;
    }

    .desktop-icon:hover, .desktop-icon:focus {
        background: rgba(49, 106, 197, 0.2);
        border: 1px dotted rgba(255, 255, 255, 0.8);
        outline: 1px solid rgba(49, 106, 197, 0.6);
        outline-offset: -1px;
    }

    .desktop-icon:active {
        background: rgba(49, 106, 197, 0.4);
    }

    .desktop-icon img {
        width: 48px;
        height: 48px;
        margin-bottom: 5px;
        pointer-events: none; /* Prevents image from interfering with hover */
    }

    .icon-label {
        color: white;
        text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.8);
        font-size: 12px;
        user-select: none;
        pointer-events: none; /* Prevents text from interfering with hover */
        max-width: 100%;
        overflow-wrap: break-word;
    }
</style> 