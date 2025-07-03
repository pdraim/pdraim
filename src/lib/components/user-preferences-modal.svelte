<script lang="ts">
import { onMount } from 'svelte';
import TextStyleSelector from './text-style-selector.svelte';
import { 
  DEFAULT_USER_PREFERENCES, 
  DEFAULT_TEXT_STYLE,
  type UserTextPreferences,
  type TextStyle 
} from '../types/text-formatting';

// Props
let { 
  showModal = $bindable(false),
  onSave
} = $props<{
  showModal: boolean;
  onSave?: (preferences: UserTextPreferences) => void;
}>();

// State
let preferences = $state<UserTextPreferences>({ ...DEFAULT_USER_PREFERENCES });
let currentStyle = $state<TextStyle>({ ...DEFAULT_TEXT_STYLE });
let isSaving = $state(false);
let hasChanges = $state(false);

// Track changes
$effect(() => {
  hasChanges = JSON.stringify(preferences) !== JSON.stringify(DEFAULT_USER_PREFERENCES);
});

// Update preferences when style changes
$effect(() => {
  preferences.defaultStyle = { ...currentStyle };
});

// Load user preferences on mount
onMount(async () => {
  try {
    const response = await fetch('/api/user/text-preferences');
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.preferences) {
        preferences = { ...DEFAULT_USER_PREFERENCES, ...data.preferences };
        currentStyle = { ...DEFAULT_TEXT_STYLE, ...preferences.defaultStyle };
      }
    }
  } catch (error) {
    console.error('Failed to load user preferences:', error);
  }
});

// Save preferences
async function savePreferences() {
  if (!onSave) return;
  
  isSaving = true;
  try {
    await onSave(preferences);
    showModal = false;
  } catch (error) {
    console.error('Failed to save preferences:', error);
    alert('Failed to save preferences. Please try again.');
  } finally {
    isSaving = false;
  }
}

// Reset to defaults
function resetToDefaults() {
  preferences = { ...DEFAULT_USER_PREFERENCES };
  currentStyle = { ...DEFAULT_TEXT_STYLE };
}

// Cancel changes
function cancel() {
  showModal = false;
}

// Handle keyboard shortcuts
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    cancel();
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    savePreferences();
  }
}
</script>

{#if showModal}
  <!-- Modal backdrop -->
  <div 
    class="modal-backdrop" 
    onclick={cancel}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="preferences-title"
  >
    <!-- Modal content -->
    <div class="modal-window window" onclick={(e) => e.stopPropagation()}>
      <div class="title-bar">
        <div class="title-bar-text" id="preferences-title">
          Text Formatting Preferences
        </div>
        <div class="title-bar-controls">
          <button onclick={cancel} aria-label="Close"></button>
        </div>
      </div>

      <div class="window-body">
        <div class="preferences-content">
          
          <!-- Enable/Disable Formatting -->
          <div class="preference-group">
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                bind:checked={preferences.allowFormatting}
              />
              Enable text formatting in messages
            </label>
            <small class="help-text">
              When enabled, you can use formatting options like bold, italic, colors, and gradients.
            </small>
          </div>

          <!-- Default Text Style -->
          <div class="preference-group">
            <h3>Default Text Style</h3>
            <p class="description">
              These settings will be used as defaults when you send new messages.
            </p>
            
            <TextStyleSelector 
              bind:style={currentStyle}
              previewText="This is how your messages will look by default"
              showPreview={true}
              compact={false}
            />
          </div>

          <!-- Message Settings -->
          <div class="preference-group">
            <h3>Message Settings</h3>
            
            <div class="setting-row">
              <label for="max-length">Maximum message length:</label>
              <input 
                id="max-length"
                type="number" 
                min="100" 
                max="2000" 
                bind:value={preferences.maxMessageLength}
                class="length-input"
              />
              <span class="unit">characters</span>
            </div>
            
            <small class="help-text">
              Longer messages may take more time to process and display.
            </small>
          </div>

          <!-- Format Help -->
          <div class="preference-group">
            <details class="format-help">
              <summary>Formatting Guide</summary>
              <div class="format-examples">
                <h4>BBCode Style:</h4>
                <ul>
                  <li><code>[b]bold text[/b]</code> → <strong>bold text</strong></li>
                  <li><code>[i]italic text[/i]</code> → <em>italic text</em></li>
                  <li><code>[u]underlined[/u]</code> → <u>underlined</u></li>
                  <li><code>[s]strikethrough[/s]</code> → <s>strikethrough</s></li>
                  <li><code>[color=red]red text[/color]</code> → <span style="color: red">red text</span></li>
                </ul>
                
                <h4>Markdown Style:</h4>
                <ul>
                  <li><code>**bold text**</code> → <strong>bold text</strong></li>
                  <li><code>*italic text*</code> → <em>italic text</em></li>
                  <li><code>~~strikethrough~~</code> → <s>strikethrough</s></li>
                  <li><code>`code text`</code> → <code>code text</code></li>
                </ul>
              </div>
            </details>
          </div>

        </div>

        <!-- Modal buttons -->
        <div class="modal-buttons">
          <button 
            class="reset-button"
            onclick={resetToDefaults}
            disabled={isSaving}
          >
            Reset to Defaults
          </button>
          
          <div class="main-buttons">
            <button 
              onclick={cancel}
              disabled={isSaving}
            >
              Cancel
            </button>
            
            <button 
              class="save-button"
              onclick={savePreferences}
              disabled={isSaving || !hasChanges}
            >
              {#if isSaving}
                Saving...
              {:else}
                Save Changes
              {/if}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .modal-window {
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 4px 4px 10px rgba(0, 0, 0, 0.3);
  }

  .window-body {
    display: flex;
    flex-direction: column;
    height: 70vh;
    max-height: 600px;
  }

  .preferences-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .preference-group {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #ddd;
  }

  .preference-group:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }

  .preference-group h3 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: bold;
    color: #2d31a6;
  }

  .description {
    margin: 0 0 12px 0;
    font-size: 12px;
    color: #666;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    cursor: pointer;
  }

  .help-text {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: #666;
    font-style: italic;
  }

  .setting-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .setting-row label {
    font-size: 12px;
    min-width: 140px;
  }

  .length-input {
    width: 80px;
    padding: 2px 4px;
    border: 1px inset #dfdfdf;
    background: white;
    font-size: 11px;
  }

  .unit {
    font-size: 11px;
    color: #666;
  }

  .format-help {
    margin-top: 8px;
  }

  .format-help summary {
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    padding: 4px 0;
  }

  .format-examples {
    padding: 8px 0;
    font-size: 11px;
  }

  .format-examples h4 {
    margin: 12px 0 4px 0;
    font-size: 11px;
    color: #2d31a6;
  }

  .format-examples ul {
    margin: 0;
    padding-left: 16px;
  }

  .format-examples li {
    margin-bottom: 2px;
  }

  .format-examples code {
    background: #f0f0f0;
    padding: 1px 3px;
    border-radius: 2px;
    font-family: 'Courier New', monospace;
    font-size: 10px;
  }

  .modal-buttons {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid #ddd;
    background: #f8f8f8;
  }

  .main-buttons {
    display: flex;
    gap: 8px;
  }

  .reset-button {
    padding: 4px 12px;
    font-size: 11px;
    border: 1px outset #dfdfdf;
    background: #f0f0f0;
    cursor: pointer;
  }

  .reset-button:hover {
    background: #e0e0e0;
  }

  .reset-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .save-button {
    padding: 4px 16px;
    font-size: 11px;
    font-weight: bold;
    border: 1px outset #dfdfdf;
    background: #0078d4;
    color: white;
    cursor: pointer;
  }

  .save-button:hover:not(:disabled) {
    background: #106ebe;
  }

  .save-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: #999;
  }

  button {
    padding: 4px 12px;
    font-size: 11px;
    border: 1px outset #dfdfdf;
    background: #f0f0f0;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #e0e0e0;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Scrollbar styling */
  .preferences-content::-webkit-scrollbar {
    width: 12px;
  }

  .preferences-content::-webkit-scrollbar-track {
    background: #f0f0f0;
    border: 1px inset #dfdfdf;
  }

  .preferences-content::-webkit-scrollbar-thumb {
    background: #c0c0c0;
    border: 1px outset #dfdfdf;
  }

  .preferences-content::-webkit-scrollbar-thumb:hover {
    background: #a0a0a0;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .modal-backdrop {
      padding: 10px;
    }

    .modal-window {
      max-width: none;
      max-height: 95vh;
    }

    .window-body {
      height: 80vh;
    }

    .preferences-content {
      padding: 12px;
    }

    .setting-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .setting-row label {
      min-width: auto;
    }

    .modal-buttons {
      flex-direction: column;
      gap: 8px;
    }

    .main-buttons {
      order: -1;
    }
  }
</style>