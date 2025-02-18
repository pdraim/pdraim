import type { Action } from 'svelte/action';

interface DraggableParameters {
  handle?: string;
  bounds?: 'parent' | 'window';
  enabled?: boolean;
}

interface DraggableAttributes {
  ondragstart?: (e: CustomEvent<{ x: number; y: number }>) => void;
  ondragmove?: (e: CustomEvent<{ x: number; y: number }>) => void;
  ondragend?: (e: CustomEvent<{ x: number; y: number }>) => void;
}

export const draggable: Action<HTMLElement, DraggableParameters, DraggableAttributes> = (node, params = {}) => {
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  
  let isEnabled = params.enabled !== undefined ? params.enabled : true;
  const handleSelector = params.handle ?? null;
  const bounds = params.bounds ?? 'window';
  
  const handleElement = handleSelector ? node.querySelector<HTMLElement>(handleSelector) : node;
  if (!handleElement) {
    console.warn('Draggable handle element not found');
    return;
  }

  // Ensure proper positioning
  if (getComputedStyle(node).position === 'static') {
    node.style.position = 'fixed';
  }

  function getNodePosition() {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top
    };
  }

  function updatePosition(newX: number, newY: number) {
    x = newX;
    y = newY;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
  }

  function onMouseDown(event: MouseEvent) {
    if (!isEnabled || event.button !== 0) return;
    
    // Check if we're clicking a button in the title bar
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }
    
    isDragging = true;
    
    // Get current position
    const pos = getNodePosition();
    x = pos.x;
    y = pos.y;
    
    startX = event.clientX - x;
    startY = event.clientY - y;
    
    node.dispatchEvent(new CustomEvent('dragstart', {
      detail: { x, y }
    }));
    
    // Add dragging class for styling
    node.classList.add('dragging');
    
    event.preventDefault();
  }

  function onMouseMove(event: MouseEvent) {
    if (!isDragging || !isEnabled) return;

    let newX = event.clientX - startX;
    let newY = event.clientY - startY;

    if (bounds === 'window') {
      newX = Math.max(0, Math.min(newX, window.innerWidth - node.offsetWidth));
      newY = Math.max(0, Math.min(newY, window.innerHeight - node.offsetHeight));
    } else if (bounds === 'parent' && node.parentElement) {
      const parent = node.parentElement;
      newX = Math.max(0, Math.min(newX, parent.offsetWidth - node.offsetWidth));
      newY = Math.max(0, Math.min(newY, parent.offsetHeight - node.offsetHeight));
    }

    requestAnimationFrame(() => {
      updatePosition(newX, newY);
      node.dispatchEvent(new CustomEvent('dragmove', {
        detail: { x: newX, y: newY }
      }));
    });
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    
    node.classList.remove('dragging');
    
    node.dispatchEvent(new CustomEvent('dragend', {
      detail: { x, y }
    }));
  }

  handleElement.style.cursor = isEnabled ? 'move' : 'default';
  handleElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mouseup', onMouseUp);

  return {
    update(newParams: DraggableParameters) {
      isEnabled = newParams.enabled !== undefined ? newParams.enabled : true;
      handleElement.style.cursor = isEnabled ? 'move' : 'default';
      Object.assign(params, newParams);
    },
    destroy() {
      handleElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
  };
}; 