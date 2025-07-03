<script lang="ts">
import { generate256Colors, CLASSIC_COLORS } from '../types/text-formatting';

// Props
let { 
  selectedColor = $bindable('#000000'),
  selectedGradient = $bindable(undefined),
  onColorChange,
  onGradientChange,
  compact = true 
} = $props<{
  selectedColor?: string;
  selectedGradient?: string[];
  onColorChange?: (color: string) => void;
  onGradientChange?: (gradient: string[]) => void;
  compact?: boolean;
}>();

// State
let showPicker = $state(false);
let gradientColors = $state<string[]>([selectedColor || '#000000']);
let activeGradientSlot = $state(0);

// Generate color palette
const colors256 = generate256Colors();
const classicColors = Object.values(CLASSIC_COLORS);

// Initialize gradient colors from props
$effect(() => {
  if (selectedGradient && selectedGradient.length > 0) {
    gradientColors = [...selectedGradient];
  } else if (selectedColor) {
    gradientColors = [selectedColor];
  }
});

// Get current display color/gradient
let displayStyle = $derived(() => {
  if (gradientColors.length > 1) {
    return `background: linear-gradient(45deg, ${gradientColors.join(', ')})`;
  }
  return `background: ${gradientColors[0] || '#000000'}`;
});

// Handle color selection
function selectColor(color: string) {
  if (activeGradientSlot < gradientColors.length) {
    gradientColors[activeGradientSlot] = color;
    gradientColors = [...gradientColors]; // Trigger reactivity
    
    if (gradientColors.length === 1) {
      // Single color mode
      selectedColor = color;
      selectedGradient = undefined;
      onColorChange?.(color);
    } else {
      // Gradient mode
      selectedGradient = [...gradientColors];
      selectedColor = gradientColors[0];
      onGradientChange?.(gradientColors);
    }
  }
}

// Gradient management
function addGradientColor() {
  if (gradientColors.length < 3) {
    const newColor = gradientColors[gradientColors.length - 1] || '#FFFFFF';
    gradientColors = [...gradientColors, newColor];
    activeGradientSlot = gradientColors.length - 1;
    selectedGradient = [...gradientColors];
    onGradientChange?.(gradientColors);
  }
}

function removeGradientColor(index: number) {
  if (gradientColors.length > 1) {
    gradientColors = gradientColors.filter((_, i) => i !== index);
    activeGradientSlot = Math.min(activeGradientSlot, gradientColors.length - 1);
    
    if (gradientColors.length === 1) {
      // Back to single color mode
      selectedColor = gradientColors[0];
      selectedGradient = undefined;
      onColorChange?.(gradientColors[0]);
    } else {
      selectedGradient = [...gradientColors];
      onGradientChange?.(gradientColors);
    }
  }
}

function setActiveSlot(index: number) {
  activeGradientSlot = index;
}

// Close picker
function closePicker() {
  showPicker = false;
}

// Handle click outside to close
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const colorPickerContainer = document.querySelector('.color-picker-container');
  
  if (showPicker && colorPickerContainer && !colorPickerContainer.contains(target)) {
    closePicker();
  }
}

// Add/remove click outside listener
$effect(() => {
  if (showPicker) {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }
});
</script>

<div class="color-picker-container">
  <!-- Color picker button -->
  <button 
    onclick={(e) => {
      e.stopPropagation();
      showPicker = !showPicker;
    }}
    title={gradientColors.length > 1 ? 'Gradient Color' : 'Text Color'}
    style="width: 20px; height: 20px; padding: 0;"
  >
    <div 
      class="color-indicator" 
      style="{displayStyle()}; width: 12px; height: 12px; border: 1px solid #000;"
    ></div>
  </button>

  <!-- Color picker dropdown -->
  {#if showPicker}
    <div class="picker-dropdown sunken-panel" onclick={(e) => e.stopPropagation()}>
      <!-- Gradient controls -->
      <div class="gradient-controls">
        <div class="gradient-slots">
          {#each gradientColors as color, index}
            <button
              class="gradient-slot"
              class:active={activeGradientSlot === index}
              style="background-color: {color} !important;"
              onclick={() => setActiveSlot(index)}
              title="Color {index + 1} - Click to select this color slot"
            >
              {#if gradientColors.length > 1}
                <span 
                  class="remove-slot"
                  onclick={(e) => {
                    e.stopPropagation();
                    removeGradientColor(index);
                  }}
                  title="Remove this color"
                  role="button"
                  tabindex="0"
                >×</span>
              {/if}
            </button>
          {/each}
          
          {#if gradientColors.length < 3}
            <button 
              class="add-slot"
              onclick={addGradientColor}
              title="Add another color to create gradient"
            >+</button>
          {/if}
        </div>
        
        {#if gradientColors.length > 1}
          <div class="gradient-preview" style="background: linear-gradient(90deg, {gradientColors.join(', ')});"></div>
        {/if}
      </div>

      <!-- Classic colors (first row) -->
      <div class="color-section">
        <div class="section-title">Classic Colors</div>
        <div class="color-row">
          {#each classicColors as color}
            <button 
              class="color-swatch classic-swatch"
              style="--swatch-color: {color}; background-color: {color} !important;"
              onclick={() => selectColor(color)}
              title={color}
            ></button>
          {/each}
        </div>
      </div>

      <!-- 256-color palette -->
      <div class="color-section">
        <div class="section-title">Full Palette</div>
        <div class="color-grid">
          {#each colors256 as color}
            <button 
              class="color-swatch"
              style="--swatch-color: {color}; background-color: {color} !important;"
              onclick={() => selectColor(color)}
              title={color}
            ></button>
          {/each}
        </div>
      </div>

      <!-- Close button -->
      <div class="picker-footer">
        <button onclick={closePicker}>Close</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .color-picker-container {
    position: relative;
    display: inline-block;
  }

  .picker-dropdown {
    position: absolute;
    top: 100%;
    right: 0; /* Changed from left: 0 to prevent cutoff */
    z-index: 1000;
    padding: 4px;
    margin-top: 2px;
    background: #ece9d8; /* Authentic XP dialog background */
    width: 420px;
    max-height: 380px;
    overflow-y: auto;
    border: 2px outset #c0c0c0;
    box-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    box-sizing: border-box;
  }

  /* Responsive positioning for mobile/small screens */
  @media (max-width: 768px) {
    .picker-dropdown {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      right: auto;
      width: 90vw;
      max-width: 420px;
      max-height: 85vh;
    }
  }

  .gradient-controls {
    margin-bottom: 6px;
    padding: 4px;
    border: 1px inset #dfdfdf;
    background: #ece9d8;
  }

  .gradient-slots {
    display: flex;
    gap: 4px;
    margin-bottom: 4px;
    align-items: center;
    flex-wrap: wrap;
  }

  .gradient-slot {
    width: 24px;
    height: 24px;
    border: 2px outset #c0c0c0 !important;
    cursor: pointer;
    position: relative;
    padding: 0 !important;
    margin: 0 !important;
    background-image: none !important;
    min-width: 24px !important;
    min-height: 24px !important;
    max-width: 24px !important;
    max-height: 24px !important;
    box-sizing: border-box !important;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .gradient-slot.active {
    border: 2px inset #c0c0c0 !important;
    box-shadow: inset 0 0 0 1px #000 !important;
  }

  .gradient-slot:hover {
    transform: scale(1.1);
  }

  .gradient-slot .remove-slot {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 12px !important;
    height: 12px !important;
    min-width: 12px !important;
    min-height: 12px !important;
    max-width: 12px !important;
    max-height: 12px !important;
    background-color: #808080 !important;
    color: white !important;
    border: 1px solid #000 !important;
    font-size: 9px !important;
    line-height: 1 !important;
    cursor: pointer !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    font-weight: normal !important;
    font-family: 'MS Sans Serif', sans-serif !important;
    z-index: 10;
    opacity: 0;
    transition: opacity 0.15s ease;
    text-align: center !important;
    box-sizing: border-box !important;
    user-select: none;
  }

  .gradient-slot:hover .remove-slot {
    opacity: 0.8;
  }

  .gradient-slot .remove-slot:hover {
    background-color: #000 !important;
    opacity: 1;
  }

  .add-slot {
    width: 24px;
    height: 24px;
    border: 2px dashed #666 !important;
    background: #f0f0f0 !important;
    cursor: pointer;
    font-weight: bold;
    padding: 0 !important;
    margin: 0 !important;
    min-width: 24px !important;
    min-height: 24px !important;
    max-width: 24px !important;
    max-height: 24px !important;
    background-image: none !important;
    box-sizing: border-box !important;
    flex-shrink: 0;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 14px !important;
    color: #666 !important;
    transition: all 0.2s ease;
  }

  .add-slot:hover {
    background: #e0e0e0 !important;
    border-color: #333 !important;
    transform: scale(1.05);
  }

  .gradient-preview {
    height: 12px;
    border: 1px inset #dfdfdf;
  }

  .color-section {
    margin-bottom: 6px;
  }

  .section-title {
    font-size: 10px;
    font-weight: bold;
    margin-bottom: 2px;
    color: #000;
  }

  .color-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-bottom: 4px;
    padding: 3px;
    background: #ece9d8;
    border: 1px inset #dfdfdf;
  }

  .classic-swatch {
    width: 18px !important;
    height: 18px !important;
    min-width: 18px !important;
    min-height: 18px !important;
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(16, 1fr);
    gap: 2px;
    width: 100%;
    padding: 3px;
    background: #ece9d8;
    border: 1px inset #dfdfdf;
    box-sizing: border-box;
  }

  .color-swatch {
    width: 18px !important;
    height: 18px !important;
    min-width: 18px !important;
    min-height: 18px !important;
    border: 1px solid #808080 !important; /* Override xp.css */
    cursor: pointer;
    padding: 0 !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    outline: none !important;
    /* Remove any xp.css button styling */
    background-image: none !important;
    background-color: var(--swatch-color, #000000) !important;
    font-size: 0 !important; /* Hide any text */
    line-height: 0 !important;
  }

  .color-swatch:hover {
    border: 2px solid #000000 !important;
    transform: scale(1.1) !important;
    z-index: 5;
    position: relative;
  }

  .color-swatch:active {
    border: 2px solid #ffffff !important;
    transform: scale(0.95) !important;
  }

  .picker-footer {
    text-align: center;
    padding-top: 4px;
    border-top: 1px solid #808080;
    margin-top: 4px;
  }

  .color-indicator {
    border-radius: 1px;
  }
</style>