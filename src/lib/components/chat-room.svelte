<script lang="ts">
import { chatState } from '../states/chat.svelte';
import type { MessageType, User, ChatRoom, Message, UserStatus } from '../types/chat';
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import { draggable } from '$lib/actions/draggable';
import { resizable } from '$lib/actions/resizable';
import { maximizable } from '$lib/actions/maximizable';

// Initialize with default values for SSR
let windowWidth = $state(400);
let windowHeight = $state(500);
let windowX = $state(0);
let windowY = $state(0);
let isMobile = $state(false);
let currentMessage = $state('');
let showUserList = $state(false);
let isMaximized = $state(false);


// 	let { value = $bindable(), ...props } = $props();
let { showChatRoom = $bindable() } = $props();

function handleClose() {
  showChatRoom = false;
}

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
      windowWidth = Math.min(800, Math.max(400, window.innerWidth * 0.8));
      windowHeight = Math.min(600, Math.max(500, window.innerHeight * 0.8));
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

function handleDragMove(event: CustomEvent<{ x: number; y: number }>) {
  windowX = event.detail.x;
  windowY = event.detail.y;
}

interface MaximizableNode extends HTMLElement {
  toggleMaximize: () => void;
}

function handleMaximize(event: MouseEvent) {
  const node = (event.currentTarget as HTMLElement).closest('.window') as MaximizableNode;
  if (node) {
    node.toggleMaximize();
  }
}

function handleMaximizeEvent(event: CustomEvent<{ 
  isMaximized: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
}>) {
  isMaximized = event.detail.isMaximized;
  windowWidth = event.detail.width;
  windowHeight = event.detail.height;
  windowX = event.detail.x;
  windowY = event.detail.y;
}
</script>

{#if showChatRoom}
<div 
  class="chat-window window" 
  style="width: {windowWidth}px; height: {windowHeight}px; left: {windowX}px; top: {windowY}px;"
  use:draggable={{ handle: '.title-bar', enabled: !isMobile && !isMaximized }}
  use:resizable={{
    enabled: !isMobile && !isMaximized,
    minWidth: 400,
    minHeight: 500,
    maxWidth: window.innerWidth - 40,
    maxHeight: window.innerHeight - 40
  }}
  use:maximizable={{ enabled: !isMobile, padding: 4 }}
  onmaximize={handleMaximizeEvent}
  onresizemove={(e) => {
    windowWidth = Math.max(400, e.detail.width);
    windowHeight = Math.max(500, e.detail.height);
  }}
  ondragmove={handleDragMove}
>
  <div class="title-bar">
    <div class="title-bar-text">Pdr Aim - {currentUser?.nickname}</div>
    <div class="title-bar-controls">
      {#if !isMobile}
        <button aria-label="Minimize"></button>
        <button 
          aria-label="Maximize" 
          class:maximized={isMaximized}
          onclick={handleMaximize}
        ></button>
        <button onclick={handleClose} aria-label="Close"></button>
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
            {#if user.status === 'away'}
              <div class="status-message">Away</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
{/if}

<style>
  :global(*) {
    font-size: 1rem;
          font-family: 'Microsoft Sans Serif', 'Segoe UI', Tahoma, sans-serif;
  }

  .title-bar {
    height: 2rem;
    position: relative;
    cursor: move;
    user-select: none;
  }

  .chat-window {
    position: fixed;
    box-sizing: border-box;
  }

  .chat-area {
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

  :global(.resize-handle) {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 15px !important;
    height: 15px !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15'%3E%3Cpath d='M11 11v-2h2v2h-2zm0-4h2v2h-2V7zm-2 2V7h2v2H9zm0 2v-2h2v2H9zm-2 0v-2h2v2H7z' fill='%23000'/%3E%3C/svg%3E");
    background-position: bottom right;
    background-repeat: no-repeat;
    cursor: se-resize !important;
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

    :global(.resize-handle) {
      display: none;
    }
  }
</style>