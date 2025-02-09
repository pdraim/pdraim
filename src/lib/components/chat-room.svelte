<script lang="ts">
import { chatState } from '../states/chat.svelte';
import type { ChatMessage, User } from '../types/chat';
import { onMount } from 'svelte';

let windowWidth = $state(800);
let windowHeight = $state(600);
let windowX = $state(0);
let windowY = $state(0);
let currentMessage = $state('');

// Reactive state using derived values
let messages = $derived(chatState.getMessages());
let onlineUsers = $derived(chatState.getOnlineUsers());
let currentUser = $derived(chatState.getCurrentUser());

onMount(() => {
  const centerWindow = () => {
    windowX = Math.max(0, (window.innerWidth - windowWidth) / 2);
    windowY = Math.max(0, (window.innerHeight - windowHeight) / 2);
  };
  centerWindow();
  window.addEventListener('resize', centerWindow);
  return () => window.removeEventListener('resize', centerWindow);
});

function handleSubmit() {
  if (currentMessage.trim()) {
    chatState.sendMessage(currentMessage);
    currentMessage = '';
  }
}

function formatTimestamp(date: Date) {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

function getStatusIcon(status: User['status']) {
  switch (status) {
    case 'online': return '🟢';
    case 'away': return '🌙';
    case 'busy': return '🔴';
    default: return '⚫';
  }
}
</script>

<div 
  class="window"
  style:width="{windowWidth}px"
  style:height="{windowHeight}px"
  style:position="absolute"
  style:left="{windowX}px"
  style:top="{windowY}px"
>
  <div class="title-bar">
    <div class="title-bar-text">AIM Chat Room - {currentUser?.nickname}</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>

  <div class="window-body" style="display: flex; height: calc(100% - 32px); margin: 0; padding: 8px;">
    <!-- Chat content area -->
    <div style="flex: 1; display: flex; flex-direction: column; margin-right: 8px;">
      <div 
        class="sunken-panel chat-area"
        style="flex: 1; margin-bottom: 8px; padding: 8px; overflow-y: auto;"
      >
        {#each messages as message}
          <div class="message {message.type} text">
            {#if message.type === 'emote'}
              <span class="timestamp">{formatTimestamp(message.timestamp)}</span>
              <span class="emote-text">{chatState.getUserById(message.userId)?.nickname} {message.content}</span>
            {:else}
              <span class="timestamp">{formatTimestamp(message.timestamp)}</span>
              <span class="nickname">{chatState.getUserById(message.userId)?.nickname}:</span>
              <span class="content">{message.content}</span>
            {/if}
          </div>
        {/each}
      </div>
      
      <div class="field-row" style="margin: 0;">
        <input 
          type="text" 
          bind:value={currentMessage}
          style="flex: 1;"
          onkeydown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Type a message..."
        />
        <button onclick={handleSubmit}>Send</button>
      </div>
    </div>

    <!-- Online users list -->
    <div 
      class="sunken-panel users-list"
      style="width: 150px; padding: 8px; overflow-y: auto;"
    >
      <p style="margin: 0 0 8px 0;"><strong>Buddy List</strong></p>
      {#each onlineUsers as user}
        <div class="user">
          <span class="status-icon">{getStatusIcon(user.status)}</span>
          <div class="user-info">
            <div class="nickname">{user.nickname}</div>
            {#if user.statusMessage}
              <div class="status-message">{user.statusMessage}</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>

  
  .title-bar {
    height: 30px;
  }

  .chat-area {
    font-family: 'Tahoma', sans-serif;
    line-height: 1.4;
  }

  .message {
    margin-bottom: 8px;
    word-break: break-word;
  }

  .message .timestamp {
    color: #666;
    font-size: 0.8em;
    margin-right: 8px;
  }

  .message .nickname {
    font-weight: bold;
    color: #2d31a6;
    margin-right: 8px;
  }

  .message.emote {
    color: #666;
    font-style: italic;
  }

  .user {
    display: flex;
    align-items: flex-start;
    margin-bottom: 12px;
    gap: 6px;
  }

  .status-icon {
    font-size: 0.8em;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user .nickname {
    font-weight: bold;
    margin-bottom: 2px;
  }

  .user .status-message {
    font-size: 0.8em;
    color: #666;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sunken-panel {
    background: white;
    border: 2px inset #dfdfdf;
  }

  input[type="text"] {
    font-size: 1rem;
    margin-right: 4px;
  }
</style>