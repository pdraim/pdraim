<script lang="ts">
import { onMount } from 'svelte';
import type { EnrichedMessage } from '../types/chat';
import type { TextStyle } from '../types/text-formatting';
import { formatText, createGradientText } from '../utils/text-formatter';
import { DEFAULT_TEXT_STYLE, generateCSSStyle, RETRO_FONTS } from '../types/text-formatting';

// Props
let { 
  message,
  allowFormatting = true 
} = $props<{
  message: EnrichedMessage;
  allowFormatting?: boolean;
}>();

// State
let formattedContent = $state('');
let isProcessing = $state(false);
let hasError = $state(false);

// Process message formatting
async function processMessage() {
  if (!allowFormatting || !message.hasFormatting) {
    formattedContent = escapeHtml(message.content);
    return;
  }

  isProcessing = true;
  hasError = false;
  
  try {
    // Parse style data if available
    let style: TextStyle = DEFAULT_TEXT_STYLE;
    if (message.styleData) {
      try {
        style = JSON.parse(message.styleData);
        console.debug('Parsed message style:', style, 'for message:', message.content);
      } catch (parseError) {
        console.warn('Failed to parse message style data:', parseError);
      }
    }

    // Check if this is a gradient message
    if (style.gradient && Array.isArray(style.gradient) && style.gradient.length > 1) {
      // Use character-by-character gradient for better compatibility
      console.debug('Creating gradient text with colors:', style.gradient, 'for text:', message.content);
      formattedContent = createGradientText(message.content, style.gradient, 'gradient-text-static', style);
      console.debug('Generated gradient HTML:', formattedContent);
      return;
    }

    // Regular formatted text (no gradient)
    const styleWithoutGradient = { ...style, gradient: undefined };
    formattedContent = await formatText(message.content, styleWithoutGradient, allowFormatting);
    
  } catch (error) {
    console.error('Message formatting error:', error);
    hasError = true;
    formattedContent = escapeHtml(message.content);
  } finally {
    isProcessing = false;
  }
}

// Process message when it changes
$effect(() => {
  processMessage();
});

// Utility function to escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Generate inline styles for the message
function getMessageStyles(): string {
  if (!message.hasFormatting || !message.styleData) {
    return '';
  }
  
  try {
    const style: TextStyle = JSON.parse(message.styleData);
    // For gradient messages, we still need some styles but not font-family (use class instead)
    if (style.gradient && Array.isArray(style.gradient) && style.gradient.length > 1) {
      // Return only non-color and non-font-family styles for gradient messages
      const styles: string[] = [];
      styles.push(`font-size: ${style.fontSize}px`);
      if (style.bold) styles.push(`font-weight: bold`);
      if (style.italic) styles.push(`font-style: italic`);
      const decorations: string[] = [];
      if (style.underline) decorations.push('underline');
      if (style.strikethrough) decorations.push('line-through');
      if (decorations.length > 0) {
        styles.push(`text-decoration: ${decorations.join(' ')}`);
      }
      return styles.join('; ');
    }
    // For non-gradient messages, exclude font-family (use class instead)
    const styles: string[] = [];
    styles.push(`font-size: ${style.fontSize}px`);
    if (style.color) styles.push(`color: ${style.color}`);
    if (style.bold) styles.push(`font-weight: bold`);
    if (style.italic) styles.push(`font-style: italic`);
    const decorations: string[] = [];
    if (style.underline) decorations.push('underline');
    if (style.strikethrough) decorations.push('line-through');
    if (decorations.length > 0) {
      styles.push(`text-decoration: ${decorations.join(' ')}`);
    }
    return styles.join('; ');
  } catch (error) {
    console.warn('Failed to generate message styles:', error);
    return '';
  }
}

// Get CSS classes for the message
function getMessageClasses(): string {
  const classes = ['formatted-message'];
  
  if (!message.hasFormatting || !message.styleData) {
    return classes.join(' ');
  }
  
  try {
    const style: TextStyle = JSON.parse(message.styleData);
    
    // Add font family class
    classes.push(`retro-font-${style.fontFamily}`);
    
    // Add style classes
    if (style.bold) classes.push('style-bold');
    if (style.italic) classes.push('style-italic');
    if (style.underline) classes.push('style-underline');
    if (style.strikethrough) classes.push('style-strikethrough');
    
    // Add gradient class if applicable
    if (style.gradient && Array.isArray(style.gradient) && style.gradient.length > 1) {
      classes.push('gradient-text-static');
    }
    
  } catch (error) {
    console.warn('Failed to parse message style for classes:', error);
  }
  
  return classes.join(' ');
}
</script>

{#if isProcessing}
  <span class={getMessageClasses()} style={getMessageStyles()}>
    <span class="processing">...</span>
  </span>
{:else if hasError}
  <span class={getMessageClasses()} style={getMessageStyles()}>
    <span class="error" title="Formatting error - showing plain text">{message.content}</span>
  </span>
{:else}
  <!-- For gradient messages, render without wrapper to avoid conflicts -->
  {#if message.hasFormatting && message.styleData}
    {@const parsedStyle = (() => {
      try {
        return JSON.parse(message.styleData);
      } catch {
        return null;
      }
    })()}
    {#if parsedStyle?.gradient && Array.isArray(parsedStyle.gradient) && parsedStyle.gradient.length > 1}
      <!-- Gradient messages are already wrapped properly -->
      {@html formattedContent}
    {:else}
      <!-- Regular formatted messages -->
      <span class={getMessageClasses()} style={getMessageStyles()}>
        {@html formattedContent}
      </span>
    {/if}
  {:else}
    <!-- Plain messages -->
    <span class={getMessageClasses()}>
      {@html formattedContent}
    </span>
  {/if}
{/if}

<style>
  .processing {
    color: #666;
    font-style: italic;
    animation: pulse 1s infinite;
  }
  
  .error {
    color: #cc0000;
    border-bottom: 1px dotted #cc0000;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  /* Ensure formatted messages don't break layout */
  :global(.formatted-message) {
    word-break: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
  }
  
  /* Improve gradient text readability */
  :global(.formatted-message.gradient-text-static) {
    font-weight: bold;
  }
  
  /* Ensure gradient spans are visible and preserve their colors */
  :global(.gradient-text-static .gradient-char) {
    display: inline;
    opacity: 1 !important;
    margin: 0 !important;
    padding: 0 !important;
    letter-spacing: 0 !important;
    -webkit-text-fill-color: initial !important;
  }
  
  /* Don't override inline styles for gradient chars - removed to let inline styles work */
  
  /* Remove any blur or gray effects */
  :global(.formatted-message) {
    opacity: 1 !important;
    filter: none !important;
  }
  
  /* Don't inherit color for gradient text spans */
  :global(.formatted-message:not(.gradient-text-static)) {
    color: inherit;
  }
  
  /* Ensure accessibility for screen readers */
  :global(.formatted-message[aria-label]) {
    position: relative;
  }
  
  /* Performance optimization for complex messages */
  :global(.formatted-message) {
    contain: layout style;
  }
</style>