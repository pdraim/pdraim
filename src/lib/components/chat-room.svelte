<script lang="ts">
import { chatState } from '../states/chat.svelte';
import type { MessageType, User, ChatRoom, Message, EnrichedMessage, SafeUser } from '../types/chat';
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import { draggable } from '$lib/actions/draggable';
import { resizable } from '$lib/actions/resizable';
import { maximizable } from '$lib/actions/maximizable';
import LoadingButton from './ui/button-loading.svelte';
import Tooltip from './ui/tooltip.svelte';
import LoadingDots from './ui/loading-dots.svelte';
import AimLogin from './aim-login.svelte';
import { formatFrenchDateTime, formatFrenchRelativeTimeSafe } from '$lib/utils/date-format';

// Initialize with default values for SSR
let windowWidth = $state(400);
let windowHeight = $state(500);
let windowX = $state(0);
let windowY = $state(0);
let isMobile = $state(false);
let currentMessage = $state('');
let showUserList = $state(false);
let isMaximized = $state(false);
let isInitialLoading = $state(true);
let showAuth = $state(false);

// Rate limiting state
let cooldownEndTime = $state<number | null>(null);
let cooldownProgress = $state(0);
let cooldownInterval: ReturnType<typeof setInterval> | null = null;
let rateLimitWarning = $state<string | null>(null);

// At the top along with other variable declarations, add:
let roomPollInterval: ReturnType<typeof setInterval> | null = null;

function updateCooldownProgress() {
  if (!cooldownEndTime) return;
  
  const now = Date.now();
  if (now >= cooldownEndTime) {
    cooldownEndTime = null;
    cooldownProgress = 0;
    rateLimitWarning = null;
    if (cooldownInterval) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
    }
    return;
  }
  
  cooldownProgress = ((cooldownEndTime - now) / 1000);
}

function startCooldownTimer(retryAfter: number) {
  cooldownEndTime = Date.now() + retryAfter;
  if (cooldownInterval) clearInterval(cooldownInterval);
  cooldownInterval = setInterval(updateCooldownProgress, 100);
  updateCooldownProgress();
}

let { showChatRoom = $bindable() } = $props();

function handleClose() {
  showChatRoom = false;
}

// Reactive state using derived values
let messages = $state<EnrichedMessage[]>([]);
let onlineUsers = $state<SafeUser[]>([]);
let currentUser = $state<SafeUser | null>(null);
let isLoadingMore = $state(false);
let hasMoreMessages = $state(true);
let oldestMessageTimestamp = $state<number | null>(null);
let currentRoomId = $state('');

// Compute visible messages based on login status
let visibleMessages = $derived((() => {
  const isLoggedIn = Boolean(currentUser);
  const messageCount = messages.length;
  const result: EnrichedMessage[] = isLoggedIn 
    ? messages 
    : messages.slice(Math.max(0, messageCount - 50));
  return result;
})());

// Add a derived state to check if we're showing the registration prompt
let showRegistrationPrompt = $derived(!currentUser && messages.length > 50);

// Add SSE error state
let sseError = $state<string | null>(null);
let sseRetryAfter = $state<number | null>(null);

// Update the effect to check for SSE errors
$effect(() => {
  const user = chatState.getCurrentUser();
  if (user?.id !== currentUser?.id) {
    currentUser = user;
    hasMoreMessages = true; // Reset when user changes
  }
  
  // Check for SSE errors
  const { error, retryAfter } = chatState.getSSEError();
  sseError = error;
  sseRetryAfter = retryAfter;
  
  // Update messages if there's any difference
  const stateMessages = chatState.getMessages();
  if (JSON.stringify(stateMessages) !== JSON.stringify(messages)) {
    messages = stateMessages;
    
    // Update oldest message timestamp
    if (messages.length > 0) {
      oldestMessageTimestamp = Math.min(...messages.map(m => m.timestamp));
    }
    
    // Scroll to bottom when new messages arrive
    const chatArea = document.querySelector('.chat-area');
    if (chatArea) {
      setTimeout(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
      }, 0);
    }
  }
  
  // Update online users
  const stateOnlineUsers = chatState.getOnlineUsers();
  if (JSON.stringify(stateOnlineUsers) !== JSON.stringify(onlineUsers)) {
    onlineUsers = stateOnlineUsers;
  }
});

// Fetch public messages only once when needed
let fetchedPublicMessages = false;
let fetchedPublicRoom = false;

$effect(() => {
  if (!currentUser) {
    // Fetch both public room data and messages in parallel but handle them in sequence
    if (!fetchedPublicRoom && !fetchedPublicMessages) {
      fetchedPublicRoom = true;
      fetchedPublicMessages = true;

      // Get the default chat room id
      const defaultRoomId = chatState.getDefaultChatRoomId();

      // Fetch both in parallel
      Promise.all([
        fetch(`/api/rooms/${defaultRoomId}?public=true`).then(r => r.json()),
        fetch('/api/chat/messages?public=true').then(r => r.json())
      ])
      .then(([roomData, messagesData]) => {
        if (roomData.success) {
          // Update both the chat state and local state with the buddy list
          chatState.updateOnlineUsers(roomData.buddyList);
          onlineUsers = roomData.buddyList;
          console.debug('Updated public buddy list:', roomData.buddyList);
        }
        
        // Then update messages after buddy list is cached
        if (messagesData.success && messagesData.messages) {
          chatState.updateMessages(messagesData.messages);
          messages = chatState.enrichMessages(messagesData.messages);
          console.debug('Updated public messages:', messages);
        }
      })
      .catch(error => {
        console.error("Error fetching public data:", error);
        onlineUsers = [];
        messages = [];
      });
    }
  }
});

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

  // ---- New: Polling for public buddy list updates ----
  if (!currentUser) {
    const fetchPublicRoom = async () => {
      const defaultRoomId = chatState.getDefaultChatRoomId();
      try {
        const response = await fetch(`/api/rooms/${defaultRoomId}?public=true`);
        if (response.ok) {
          const roomData = await response.json();
          if (roomData.success && roomData.buddyList) {
            // Update both chat state and local onlineUsers list
            chatState.updateOnlineUsers(roomData.buddyList);
            onlineUsers = roomData.buddyList;
            console.debug('Public polling updated buddy list:', roomData.buddyList);
          }
        }
      } catch (error) {
        console.error('Error fetching public buddy list:', error);
      }
    };

    // Initial fetch then poll every 30 seconds
    fetchPublicRoom();
    roomPollInterval = setInterval(fetchPublicRoom, 30000);
  }
  // -------------------------------------------------------

  return () => {
    window.removeEventListener('resize', handleResize);
    if (cooldownInterval) clearInterval(cooldownInterval);
    if (roomPollInterval) clearInterval(roomPollInterval);
  };
});

// New reactive state to track when a message is being sent
let isSendingMessage = $state(false);

async function handleSubmit() {
  if (!currentMessage.trim() || !currentUser || cooldownEndTime) return;
  
  isSendingMessage = true;
  try {
    const response = await chatState.sendMessage(currentMessage);
    if (!response.success && response.isRateLimited && response.retryAfter) {
      startCooldownTimer(response.retryAfter);
      rateLimitWarning = 'Whoa there! You\'re sending messages too quickly. Take a breather...';
    } else if (!response.success) {
      rateLimitWarning = response.error || 'Failed to send message. Please try again.';
      setTimeout(() => rateLimitWarning = null, 3000);
    } else {
      currentMessage = '';
      rateLimitWarning = null;
    }
  } catch (error) {
    console.error('Failed to send message:', error);
    rateLimitWarning = 'Failed to send message. Please try again.';
    setTimeout(() => rateLimitWarning = null, 3000);
  } finally {
    isSendingMessage = false;
  }
}

function getStatusIcon(status: User['status']) {
  switch (status) {
    case 'online': return '🟢';
    case 'away': return '🌙';
    case 'busy': return '🔴';
    default: return '⚫';
  }
}

function formatLastSeen(lastSeen: number | null | undefined) {
  if (!lastSeen) return 'Never';
  
  const now = Date.now();
  const diff = now - lastSeen;
  
  // Less than a minute
  if (diff < 60000) {
    return 'Just now';
  }
  
  // Less than an hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  
  // Less than a day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  
  // Less than a week
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  
  // More than a week
  return new Date(lastSeen).toLocaleDateString();
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

async function handleScroll(event: Event) {
    const chatArea = event.target as HTMLElement;
    const { scrollTop } = chatArea;
    
    // Check if we've scrolled near the top (within 100px) and not already loading
    if (scrollTop < 100 && !isLoadingMore && hasMoreMessages) {
        isLoadingMore = true;
        
        // Store the scroll height and position before loading
        const scrollHeight = chatArea.scrollHeight;
        const currentScrollTop = chatArea.scrollTop;
        
        console.debug('Loading more messages...', { 
            oldestMessageTimestamp,
            scrollHeight,
            currentScrollTop 
        });
        
        try {
            const response = await fetch(`/api/chat/messages?${new URLSearchParams({
                before: oldestMessageTimestamp?.toString() || '',
                roomId: currentRoomId,
                ...(currentUser ? {} : { public: 'true' })
            })}`);
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    if (data.messages.length === 0) {
                        hasMoreMessages = false;
                    } else {
                        // Update messages through chat state
                        chatState.prependMessages(data.messages, data.hasMore);
                        
                        // Use requestAnimationFrame to ensure DOM has updated
                        requestAnimationFrame(() => {
                            // Calculate how much the content height has increased
                            const newScrollHeight = chatArea.scrollHeight;
                            const heightDifference = newScrollHeight - scrollHeight;
                            
                            // Adjust scroll position to maintain relative position
                            chatArea.scrollTop = currentScrollTop + heightDifference;
                            
                            console.debug('Scroll position adjusted:', {
                                heightDifference,
                                newScrollTop: chatArea.scrollTop,
                                newScrollHeight
                            });
                        });
                        
                        // Update oldest timestamp
                        const newOldest = Math.min(...data.messages.map((m: Message) => m.timestamp));
                        oldestMessageTimestamp = newOldest;
                        
                        // Update hasMoreMessages from response
                        hasMoreMessages = data.hasMore;
                    }
                }
            }
        } catch (error) {
            console.error('Error loading more messages:', error);
            hasMoreMessages = false;
        } finally {
            isLoadingMore = false;
        }
    }
}

// Add effect to track initial loading state
$effect(() => {
    const stateMessages = chatState.getMessages();
    if (stateMessages.length > 0 && isInitialLoading) {
        isInitialLoading = false;
    }
});

// Add derived state for total users count
let totalUsers = $derived(onlineUsers.length);

function openSignup() {
    showAuth = true;
}

function handleLoginSuccess() {
    showAuth = false;
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
    <div class="title-bar-text">
      Pdr Aim {#if currentUser} - {currentUser.nickname}{:else} - {totalUsers} membre{totalUsers > 1 ? 's' : ''}{/if}
      {#if sseError}
        <span class="connection-error">⚠️ Erreur de connexion</span>
      {/if}
    </div>
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
          aria-label="Afficher/Masquer la liste des contacts"
          onclick={() => showUserList = !showUserList}
        >👥</button>
      {/if}
    </div>
  </div>

  <div class="window-body" style="display: flex; height: calc(100% - 2rem); margin: 0; padding: 0.5rem;">
    {#if sseError}
      <div class="error-banner">
        {sseError}
        {#if sseRetryAfter}
          <br>
          <small>Nouvelle tentative dans {Math.ceil(sseRetryAfter)}s...</small>
        {/if}
      </div>
    {/if}
    
    <div class="chat-container" style="flex: 1; display: flex; flex-direction: column; margin-right: 0.5rem;">
      {#if rateLimitWarning}
        <div class="rate-limit-warning" class:with-progress={cooldownEndTime}>
          <span>{rateLimitWarning}</span>
          {#if cooldownEndTime}
            <small>Vous pourrez envoyer un autre message dans {cooldownProgress.toFixed(1)}s</small>
          {/if}
        </div>
      {/if}

      <div 
        class="sunken-panel chat-area"
        style="flex: 1; margin-bottom: 0.5rem; padding: 0.5rem; overflow-y: auto;"
        onscroll={(e) => handleScroll(e)}
      >
        {#if isInitialLoading}
          <div class="initial-loading">
            <LoadingDots text="Chargement des messages" />
          </div>
        {:else if isLoadingMore}
          <div class="loading-messages">
            <LoadingDots text="Chargement" />
          </div>
        {/if}
        {#if showRegistrationPrompt}
          <div class="registration-prompt">
            <p>👋 <button class="link-button" onclick={openSignup}>Inscris-toi</button> pour lire le reste du chat !</p>
          </div>
        {/if}
        {#each visibleMessages as message (message.id)}
          <div class="message {message.type} text">
            {#if message.type === 'emote'}
              <span class="emote-text">
                <Tooltip data={{ text: formatFrenchDateTime(new Date(message.timestamp)), direction: "right" }}>
                  <span class="nickname">{message.user.nickname}</span>
                </Tooltip>
                {message.content}
              </span>
            {:else}
              <Tooltip data={{ text: formatFrenchDateTime(new Date(message.timestamp)), direction: "right" }}>
                <span class="nickname">{message.user.nickname}:</span>
              </Tooltip>
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
          placeholder={cooldownEndTime ? `Patientez ${cooldownProgress.toFixed(1)}s...` : "Écrivez un message..."}
          disabled={!currentUser || Boolean(cooldownEndTime)}
        />
        <LoadingButton 
          onclick={handleSubmit} 
          disabled={!currentUser || Boolean(cooldownEndTime)} 
          loading={isSendingMessage}
          text={cooldownEndTime ? `${cooldownProgress.toFixed(1)}s` : "Envoyer"}
        />
      </div>
      {#if cooldownEndTime}
        <div class="cooldown-progress" style="width: {100 - (cooldownProgress * 100 / (cooldownEndTime - Date.now()) * 1000)}%"></div>
      {/if}
    </div>

    <!-- Online users list -->
    <div 
      class="sunken-panel users-list"
      class:mobile={isMobile}
      class:hidden={isMobile && !showUserList}
      style="width: {isMobile ? '100%' : '9.375rem'}; padding: 0.5rem; overflow-y: auto;"
    >
      <p style="margin: 0 0 0.3rem 0;"><strong>{totalUsers} membre{totalUsers > 1 ? 's' : ''}</strong></p>
      {#each onlineUsers as user}
        <div class="user" class:offline={user.status === 'offline'}>
          <span class="status-icon">{getStatusIcon(user.status)}</span>
          <div class="user-info">
            {#if user.status === 'offline'}
              <Tooltip data={{ text: "Dernière connexion: " + formatFrenchRelativeTimeSafe(user.lastSeen), direction: "bottom" }}>
                <div class="nickname select-none">{user.nickname}</div>
              </Tooltip>
            {:else}
              <div class="nickname select-none">{user.nickname}</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
{/if}

{#if showAuth}
    <AimLogin 
        bind:showAuth
        activeTab={'signup' as const}
        onLoginSuccess={handleLoginSuccess}
    />
{/if}

<style>
  .chat-area, .users-list, input {
    font-size: 1rem;
    font-family: Arial, Verdana, Tahoma, sans-serif;
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
    margin-bottom: 0.25rem;
    word-break: break-word;
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .message .nickname {
    font-weight: bold;
    color: #2d31a6;
    cursor: help;
  }

  .message .content {
    flex: 1;
  }

  .message.emote {
    color: #666;
    font-style: italic;
  }

  .message.emote .nickname {
    color: #666;
  }

  .user {
    display: flex;
    align-items: flex-start;
    margin-bottom: 0.25rem;
    gap: 0.375rem;
    transition: opacity 0.3s ease;
  }

  .user.offline {
    opacity: 0.6;
  }

  .status-icon {
    font-size: 0.875rem;
    transition: color 0.3s ease;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user .nickname {
    font-weight: bold;
    margin-bottom: 0.125rem;
    transition: color 0.3s ease;
  }

  .user.offline .nickname {
    color: #666;
  }

  /* .user .status-message {
    font-size: 0.875rem;
    color: #666;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  } */

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

  .input-container input:disabled,
  .input-container {
    opacity: 0.7;
    background-color: rgba(128, 128, 128, 0.1);
    cursor: not-allowed;
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

  .relative-time {
    color: #666;
    font-size: 0.75rem;
    margin-right: 0.5rem;
    font-style: italic;
  }

  .cooldown-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: #2d31a6;
    transition: width 0.1s linear;
  }

  .input-container {
    position: relative;
  }

  .connection-error {
    font-size: 0.75rem;
    color: #ff4444;
    margin-left: 0.5rem;
  }

  .error-banner {
    position: absolute;
    top: 2rem;
    left: 0;
    right: 0;
    background: #ffebee;
    color: #c62828;
    padding: 0.5rem;
    text-align: center;
    z-index: 100;
    border-bottom: 1px solid #ffcdd2;
    font-size: 0.875rem;
  }

  .error-banner small {
    color: #666;
  }

  .rate-limit-warning {
    background: #fff3e0;
    color: #e65100;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    border-radius: 4px;
    font-size: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    animation: slideIn 0.3s ease-out;
    border: 1px solid #ffe0b2;
  }

  .rate-limit-warning.with-progress {
    border-left: 4px solid #e65100;
  }

  .rate-limit-warning small {
    color: #666;
    font-size: 0.75rem;
  }

  @keyframes slideIn {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .cooldown-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: #e65100;
    transition: width 0.1s linear;
  }

  .initial-loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    font-size: 1.1rem;
    color: #666;
  }

  .loading-messages {
    text-align: center;
    padding: 1rem;
    color: #666;
    font-style: italic;
    background: rgba(0, 0, 0, 0.05);
    margin-bottom: 1rem;
    border-radius: 4px;
  }

  .registration-prompt {
    background: #fff3e0;
    color: #e65100;
    padding: 1rem;
    margin-bottom: 1rem;
    border-radius: 4px;
    text-align: center;
    font-size: 0.95rem;
    border: 1px solid #ffe0b2;
    animation: fadeIn 0.3s ease-out;
  }

  .registration-prompt p {
    margin: 0;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .registration-prompt .link-button {
    color: #e65100;
    text-decoration: underline;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
  }

  .registration-prompt .link-button:hover {
    color: #ef6c00;
    text-decoration: none;
  }
</style>