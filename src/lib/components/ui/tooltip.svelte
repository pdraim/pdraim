<script lang="ts">
  type $$Props = {
    data: {
      text: string,
      direction?: 'top' | 'bottom' | 'left' | 'right'
    }
  };

  let { children, data } = $props();
  
  // Derive values from data with defaults
  let text = $derived(data.text);
  let direction = $derived(data.direction ?? 'top');

  let wrapper: HTMLDivElement;
  let tooltipDiv: HTMLDivElement | null = null;
  let coords = { x: 0, y: 0 };

  function updateCoords() {
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      if (direction === 'top') {
        coords = { x: rect.left + rect.width / 2, y: rect.top - 8 };
      } else if (direction === 'bottom') {
        coords = { x: rect.left + rect.width / 2, y: rect.bottom + 8 };
      } else if (direction === 'left') {
        coords = { x: rect.left - 8, y: rect.top + rect.height / 2 };
      } else if (direction === 'right') {
        coords = { x: rect.right + 8, y: rect.top + rect.height / 2 };
      }
    }
  }

  function showTooltip() {
    updateCoords();
    tooltipDiv = document.createElement('div');
    tooltipDiv.className = `tooltip ${direction}`;
    tooltipDiv.style.position = 'fixed';
    tooltipDiv.style.zIndex = '1000000';
    tooltipDiv.textContent = text;
    document.body.appendChild(tooltipDiv);

    const tooltipRect = tooltipDiv.getBoundingClientRect();
    let finalLeft = coords.x;
    let finalTop = coords.y;
    if (direction === 'top') {
      finalLeft = coords.x - tooltipRect.width / 2;
      finalTop = coords.y - tooltipRect.height;
    } else if (direction === 'bottom') {
      finalLeft = coords.x - tooltipRect.width / 2;
      finalTop = coords.y;
    } else if (direction === 'left') {
      finalLeft = coords.x - tooltipRect.width;
      finalTop = coords.y - tooltipRect.height / 2;
    } else if (direction === 'right') {
      finalLeft = coords.x;
      finalTop = coords.y - tooltipRect.height / 2;
    }

    if (finalLeft < 0) {
      finalLeft = 0;
    } else if (finalLeft + tooltipRect.width > window.innerWidth) {
      finalLeft = window.innerWidth - tooltipRect.width;
    }
    if (finalTop < 0) {
      finalTop = 0;
    } else if (finalTop + tooltipRect.height > window.innerHeight) {
      finalTop = window.innerHeight - tooltipRect.height;
    }

    tooltipDiv.style.left = `${finalLeft}px`;
    tooltipDiv.style.top = `${finalTop}px`;
  }

  function hideTooltip() {
    if (tooltipDiv && tooltipDiv.parentNode) {
      tooltipDiv.parentNode.removeChild(tooltipDiv);
      tooltipDiv = null;
    }
  }
</script>

<div 
  class="tooltip-wrapper" 
  bind:this={wrapper}
  onmouseover={showTooltip}
  onmouseout={hideTooltip}
  onfocus={showTooltip}
  onblur={hideTooltip}
  role="tooltip"
  tabindex="-1"
>
  {@render children()}
</div>

<style>
  .tooltip-wrapper {
    display: inline-block;
  }
  /* Use :global for styles that need to apply to elements outside the component */
  :global(.tooltip) {
    white-space: nowrap;
    padding: 0.5rem;
    background: #ECE9D8;
    color: #000;
    border: 1px solid #003C74;
    box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
    border-radius: 2px;
    font-size: 0.875rem;
    font-family: 'Microsoft Sans Serif', 'Segoe UI', Arial, Tahoma, sans-serif;
  }

  /* Direction-specific styles for the tooltip arrow */
  :global(.tooltip.top)::before {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid #003C74;
  }

  :global(.tooltip.bottom)::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid #003C74;
  }

  :global(.tooltip.left)::before {
    content: '';
    position: absolute;
    right: -6px;
    top: 50%;
    transform: translateY(-50%);
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-left: 6px solid #003C74;
  }

  :global(.tooltip.right)::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 50%;
    transform: translateY(-50%);
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-right: 6px solid #003C74;
  }
</style>