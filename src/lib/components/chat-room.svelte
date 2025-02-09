<script lang="ts">
import { chatState } from '../states/chat.svelte';
import type { ChatMessage, User } from '../types/chat';
import { onMount } from 'svelte';
import { browser } from '$app/environment';

// Initialize with default values for SSR
let windowWidth = $state(800);
let windowHeight = $state(600);
let windowX = $state(0);
let windowY = $state(0);
let isMobile = $state(false);
let currentMessage = $state('');
let showUserList = $state(false);

// Reactive state using derived values
let messages = $derived(chatState.getMessages());
let onlineUsers = $derived(chatState.getOnlineUsers());
let currentUser = $derived(chatState.getCurrentUser());

onMount(() => {
  if (!browser) return;

  const handleResize = () => {
    isMobile = window.innerWidth <= 768;
    if (isMobile) {
      windowWidth = window.innerWidth;
      windowHeight = window.innerHeight;
      windowX = 0;
      windowY = 0;
    } else {
      windowWidth = Math.min(800, window.innerWidth * 0.8);
      windowHeight = Math.min(600, window.innerHeight * 0.8);
      windowX = Math.max(0, (window.innerWidth - windowWidth) / 2);
      windowY = Math.max(0, (window.innerHeight - windowHeight) / 2);
    }
  };
  
  // Initial resize
  handleResize();
  
  // Add resize listener
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
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
      {#if !isMobile}
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      {:else}
        <button 
          aria-label="Toggle Buddy List"
          onclick={() => showUserList = !showUserList}
        >👥</button>
      {/if}
    </div>
  </div>

  <div class="window-body" style="display: flex; height: calc(100% - 2rem); margin: 0; padding: 0.5rem;">
    <!-- Chat content area -->
    <div class="chat-container" style="flex: 1; display: flex; flex-direction: column; margin-right: 0.5rem;">
      <div 
        class="sunken-panel chat-area"
        style="flex: 1; margin-bottom: 0.5rem; padding: 0.5rem; overflow-y: auto;"
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
      
      <div class="field-row input-container" style="margin: 0;">
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
      class:mobile={isMobile}
      class:hidden={isMobile && !showUserList}
      style="width: {isMobile ? '100%' : '9.375rem'}; padding: 0.5rem; overflow-y: auto;"
    >
      <p style="margin: 0 0 0.5rem 0;"><strong>Buddy List</strong></p>
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
  :global(*) {
    font-size: 1rem;
  }

  .title-bar {
    height: 2rem;
  }

  .chat-area {
    font-family: 'Tahoma', sans-serif;
    line-height: 1.4;
  }

  .message {
    margin-bottom: 0.5rem;
    word-break: break-word;
  }

  .message .timestamp {
    color: #666;
    font-size: 0.875rem;
    margin-right: 0.5rem;
  }

  .message .nickname {
    font-weight: bold;
    color: #2d31a6;
    margin-right: 0.5rem;
  }

  .message.emote {
    color: #666;
    font-style: italic;
  }

  .user {
    display: flex;
    align-items: flex-start;
    margin-bottom: 0.75rem;
    gap: 0.375rem;
  }

  .status-icon {
    font-size: 0.875rem;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user .nickname {
    font-weight: bold;
    margin-bottom: 0.125rem;
  }

  .user .status-message {
    font-size: 0.875rem;
    color: #666;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sunken-panel {
    background: white;
    border: 0.125rem inset #dfdfdf;
  }

  input[type="text"] {
    font-size: 1rem;
    margin-right: 0.25rem;
  }

  button {
    font-size: 1rem;
  }

  .chat-container {
    position: relative;
    z-index: 1;
  }

  .input-container {
    position: relative;
    z-index: 2;
  }

  .hidden {
    display: none !important;
  }

  @media (max-width: 768px) {
    .window {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      height: 100% !important;
    }

    .window-body {
      flex-direction: column;
    }

    .chat-container {
      margin-right: 0 !important;
      margin-bottom: 0 !important;
      height: 100%;
    }

    .users-list.mobile {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: auto;
      max-height: 30vh;
      z-index: 1000;
      border-top: 0.125rem solid #dfdfdf;
      background: white;
    }

    .input-container {
      padding: 0.5rem;
      border-top: 0.125rem solid #dfdfdf;
    }
  }
</style>