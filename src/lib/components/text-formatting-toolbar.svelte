<script lang="ts">
import { 
  RETRO_FONTS, 
  CLASSIC_COLORS, 
  GRADIENT_PRESETS, 
  DEFAULT_TEXT_STYLE,
  type TextStyle, 
  type FontFamily
} from '../types/text-formatting';
import ColorPicker256 from './color-picker-256.svelte';

// Props
let { 
  style = $bindable(DEFAULT_TEXT_STYLE),
  onPreviewText,
  compact = true,
  showFontSelector = false,
  showGradients = true
} = $props<{
  style?: TextStyle;
  onPreviewText?: (text: string) => void;
  compact?: boolean;
  showFontSelector?: boolean;
  showGradients?: boolean;
}>();

// State
let currentColor = $state(style.color || '#000000');
let currentGradient = $state(style.gradient);

// Toggle functions
function toggleBold() {
  style = { ...style, bold: !style.bold };
}

function toggleItalic() {
  style = { ...style, italic: !style.italic };
}

function toggleUnderline() {
  style = { ...style, underline: !style.underline };
}

function handleColorChange(color: string) {
  currentColor = color;
  style = { ...style, color, gradient: undefined };
}

function handleGradientChange(gradient: string[]) {
  currentGradient = gradient;
  style = { ...style, gradient, color: gradient[0] };
}

function selectFont(fontFamily: FontFamily) {
  style = { ...style, fontFamily };
}

// Keyboard shortcuts handler
function handleKeydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey) {
    switch (event.key.toLowerCase()) {
      case 'b':
        event.preventDefault();
        toggleBold();
        break;
      case 'i':
        event.preventDefault();
        toggleItalic();
        break;
      case 'u':
        event.preventDefault();
        toggleUnderline();
        break;
    }
  }
}

// Preview text change
function previewTextChanged() {
  if (onPreviewText) {
    onPreviewText('Sample formatted text');
  }
}

// Update internal state when style prop changes
$effect(() => {
  currentColor = style.color || '#000000';
  currentGradient = style.gradient;
});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="text-formatting-toolbar sunken-panel" class:compact>
  
  <!-- Font selector (if enabled) -->
  {#if showFontSelector}
    <select 
      value={style.fontFamily} 
      onchange={(e) => selectFont((e.target as HTMLSelectElement).value as FontFamily)}
      title="Font Family"
    >
      {#each Object.entries(RETRO_FONTS) as [key, font]}
        <option value={key} style="font-family: {font.stack};">{font.name}</option>
      {/each}
    </select>
  {/if}

  <!-- Size slider -->
  <div class="size-control">
    <input 
      type="range" 
      min="8" 
      max="18" 
      bind:value={style.fontSize}
      class="size-slider"
      title="Font Size: {style.fontSize}px"
    />
    <span class="size-display">{style.fontSize}</span>
  </div>

  <!-- Style toggle buttons -->
  <div class="style-toggles">
    <button 
      onclick={toggleBold}
      title="Bold (Ctrl+B)"
      style="width: 20px; height: 20px; padding: 0; font-size: 10px;"
    >
      <strong>B</strong>
    </button>
    
    <button 
      onclick={toggleItalic}
      title="Italic (Ctrl+I)"
      style="width: 20px; height: 20px; padding: 0; font-size: 10px;"
    >
      <em>I</em>
    </button>
    
    <button 
      onclick={toggleUnderline}
      title="Underline (Ctrl+U)"
      style="width: 20px; height: 20px; padding: 0; font-size: 10px;"
    >
      <u>U</u>
    </button>
  </div>

  <!-- Color controls -->
  <div class="color-controls">
    <ColorPicker256 
      bind:selectedColor={currentColor}
      bind:selectedGradient={currentGradient}
      onColorChange={handleColorChange}
      onGradientChange={handleGradientChange}
      {compact}
    />
  </div>


</div>

<style>
  .text-formatting-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px;
    font-size: 11px;
    position: relative;
    flex-wrap: wrap;
  }

  .size-control {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .size-slider {
    width: 50px;
    height: 12px;
  }

  .size-display {
    font-size: 9px;
    color: #666;
    min-width: 18px;
    text-align: center;
  }

  .style-toggles {
    display: flex;
    gap: 1px;
  }

  .color-controls {
    display: flex;
    gap: 1px;
  }

  /* Fix font dropdown text alignment */
  select {
    height: 20px;
    line-height: 1;
    vertical-align: middle;
    padding: 1px 4px;
    font-size: 11px;
  }

  select option {
    padding: 2px 4px;
    line-height: normal;
  }

</style>