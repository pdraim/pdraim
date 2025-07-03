<script lang="ts">
import { 
  RETRO_FONTS, 
  CLASSIC_COLORS, 
  DEFAULT_TEXT_STYLE,
  type TextStyle, 
  type FontFamily,
  generateCSSStyle
} from '../types/text-formatting';
import ColorPicker256 from './color-picker-256.svelte';
import { formatText, createGradientText } from '../utils/text-formatter';

// Props
let { 
  style = $bindable(DEFAULT_TEXT_STYLE),
  previewText = "Sample text preview",
  showPreview = true,
  compact = false 
} = $props<{
  style?: TextStyle;
  previewText?: string;
  showPreview?: boolean;
  compact?: boolean;
}>();

// Local state
let currentColor = $state(style.color || '#000000');
let currentGradient = $state(style.gradient);
let formattedPreview = $state('');
let isProcessing = $state(false);

// Update preview when style changes
$effect(() => {
  if (!showPreview) return;
  
  async function updatePreview() {
    isProcessing = true;
    try {
      if (style.gradient && Array.isArray(style.gradient) && style.gradient.length > 1) {
        formattedPreview = createGradientText(previewText, style.gradient, 'preview-gradient');
      } else {
        formattedPreview = await formatText(previewText, style, false);
      }
    } catch (error) {
      console.error('Preview formatting error:', error);
      formattedPreview = previewText;
    } finally {
      isProcessing = false;
    }
  }
  
  updatePreview();
});

// Font family selection
function selectFont(fontFamily: FontFamily) {
  style = { ...style, fontFamily };
}

// Color selection
function handleColorChange(color: string) {
  currentColor = color;
  style = { ...style, color, gradient: undefined };
}

// Gradient selection
function handleGradientChange(gradient: string[]) {
  currentGradient = gradient;
  style = { ...style, gradient, color: gradient[0] };
}

// Update internal state when style prop changes
$effect(() => {
  currentColor = style.color || '#000000';
  currentGradient = style.gradient;
});

// Toggle style options
function toggleBold() {
  style = { ...style, bold: !style.bold };
}

function toggleItalic() {
  style = { ...style, italic: !style.italic };
}

function toggleUnderline() {
  style = { ...style, underline: !style.underline };
}

function toggleStrikethrough() {
  style = { ...style, strikethrough: !style.strikethrough };
}

// Font size adjustment
function updateFontSize(size: number) {
  style = { ...style, fontSize: Math.max(8, Math.min(18, size)) };
}

</script>

<div class="text-style-selector" class:compact>
  <!-- Font Family Selection -->
  <div class="style-group">
    <label>Font:</label>
    <select 
      bind:value={style.fontFamily} 
      onchange={(e) => selectFont((e.target as HTMLSelectElement).value as FontFamily)}
    >
      {#each Object.entries(RETRO_FONTS) as [key, font]}
        <option value={key} style="font-family: {font.stack}">
          {font.name}
        </option>
      {/each}
    </select>
  </div>

  <!-- Font Size -->
  <div class="style-group">
    <label>Size:</label>
    <input 
      type="range" 
      min="8" 
      max="18" 
      bind:value={style.fontSize}
      oninput={(e) => updateFontSize(parseInt((e.target as HTMLInputElement).value))}
    />
    <span class="size-display">{style.fontSize}px</span>
  </div>

  <!-- Style Toggles -->
  <div class="style-group toggles">
    <button 
      class="style-toggle" 
      class:active={style.bold}
      onclick={toggleBold}
      title="Bold (Ctrl+B)"
    >
      <strong>B</strong>
    </button>
    <button 
      class="style-toggle" 
      class:active={style.italic}
      onclick={toggleItalic}
      title="Italic (Ctrl+I)"
    >
      <em>I</em>
    </button>
    <button 
      class="style-toggle" 
      class:active={style.underline}
      onclick={toggleUnderline}
      title="Underline (Ctrl+U)"
    >
      <u>U</u>
    </button>
    <button 
      class="style-toggle" 
      class:active={style.strikethrough}
      onclick={toggleStrikethrough}
      title="Strikethrough"
    >
      <s>S</s>
    </button>
  </div>

  <!-- Color & Gradient Selection -->
  <div class="style-group">
    <label>Color:</label>
    <div class="color-controls">
      <ColorPicker256 
        bind:selectedColor={currentColor}
        bind:selectedGradient={currentGradient}
        onColorChange={handleColorChange}
        onGradientChange={handleGradientChange}
        compact={false}
      />
    </div>
  </div>


  <!-- Preview -->
  {#if showPreview}
    <div class="preview-section">
      <label>Preview:</label>
      <div 
        class="preview-text" 
        style={generateCSSStyle(style)}
      >
        {#if isProcessing}
          <span class="loading">Processing...</span>
        {:else}
          {@html formattedPreview}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .text-style-selector {
    background: #f0f0f0;
    border: 2px inset #dfdfdf;
    padding: 8px;
    font-family: 'MS Sans Serif', sans-serif;
    font-size: 11px;
  }

  .text-style-selector.compact {
    padding: 4px;
  }

  .style-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .style-group label {
    font-weight: bold;
    min-width: 50px;
  }

  .style-group select {
    flex: 1;
    padding: 2px;
    border: 1px inset #dfdfdf;
    background: white;
  }

  .style-group input[type="range"] {
    flex: 1;
  }

  .size-display {
    min-width: 35px;
    font-size: 10px;
    color: #666;
  }

  .toggles {
    gap: 4px;
  }

  .style-toggle {
    width: 24px;
    height: 24px;
    border: 1px outset #dfdfdf;
    background: #f0f0f0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
  }

  .style-toggle:hover {
    background: #e0e0e0;
  }

  .style-toggle.active {
    border: 1px inset #dfdfdf;
    background: #d0d0d0;
  }

  .color-controls {
    display: flex;
    gap: 4px;
  }

  .preview-section {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #ccc;
  }

  .preview-section label {
    display: block;
    margin-bottom: 4px;
    font-weight: bold;
  }

  .preview-text {
    padding: 8px;
    border: 1px inset #dfdfdf;
    background: white;
    min-height: 24px;
    line-height: 1.4;
  }

  .loading {
    color: #666;
    font-style: italic;
  }

  /* Gradient text support */
  :global(.preview-gradient) {
    display: inline;
  }

  /* Compact mode adjustments */
  .compact .style-group {
    margin-bottom: 4px;
  }

  .compact .style-group label {
    min-width: 40px;
    font-size: 10px;
  }

  .compact .style-toggle {
    width: 20px;
    height: 20px;
    font-size: 10px;
  }

  .compact .color-button, .compact .gradient-button {
    font-size: 9px;
    padding: 1px 4px;
  }
</style>