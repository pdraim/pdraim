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

  // Set initial position from existing inline styles or computed styles
  const computedStyle = getComputedStyle(node);
  const existingLeft = node.style.left || computedStyle.left;
  const existingTop = node.style.top || computedStyle.top;
  
  x = parseInt(existingLeft) || 0;
  y = parseInt(existingTop) || 0;

  // Ensure the element is positioned
  const position = computedStyle.position;
  if (position !== 'relative' && position !== 'absolute' && position !== 'fixed') {
    node.style.position = 'fixed';
  }

  node.style.left = `${x}px`;
  node.style.top = `${y}px`;

  function onMouseDown(event: MouseEvent) {
    if (!isEnabled) return;
    
    // Only handle left mouse button
    if (event.button !== 0) return;
    
    isDragging = true;
    const rect = node.getBoundingClientRect();
    
    x = rect.left;
    y = rect.top;
    startX = event.clientX - x;
    startY = event.clientY - y;
    
    node.dispatchEvent(new CustomEvent('dragstart', {
      detail: { x, y }
    }));
    
    // Prevent text selection while dragging
    event.preventDefault();
  }

  function onMouseMove(event: MouseEvent) {
    if (!isDragging || !isEnabled) return;

    let newX = event.clientX - startX;
    let newY = event.clientY - startY;

    if (bounds === 'window') {
      // Keep within window bounds
      newX = Math.max(0, Math.min(newX, window.innerWidth - node.offsetWidth));
      newY = Math.max(0, Math.min(newY, window.innerHeight - node.offsetHeight));
    } else if (bounds === 'parent' && node.parentElement) {
      // Keep within parent bounds
      const parent = node.parentElement;
      newX = Math.max(0, Math.min(newX, parent.offsetWidth - node.offsetWidth));
      newY = Math.max(0, Math.min(newY, parent.offsetHeight - node.offsetHeight));
    }

    x = newX;
    y = newY;
    
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    
    node.dispatchEvent(new CustomEvent('dragmove', {
      detail: { x, y }
    }));
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    
    node.dispatchEvent(new CustomEvent('dragend', {
      detail: { x, y }
    }));
  }

  handleElement.style.cursor = isEnabled ? 'move' : 'default';
  handleElement.addEventListener('mousedown', onMouseDown as EventListener);
  window.addEventListener('mousemove', onMouseMove as EventListener);
  window.addEventListener('mouseup', onMouseUp as EventListener);

  return {
    update(newParams: DraggableParameters) {
      const newEnabled = newParams.enabled !== undefined ? newParams.enabled : true;
      isEnabled = newEnabled;
      handleElement.style.cursor = isEnabled ? 'move' : 'default';
      Object.assign(params, newParams);
    },
    destroy() {
      handleElement.removeEventListener('mousedown', onMouseDown as EventListener);
      window.removeEventListener('mousemove', onMouseMove as EventListener);
      window.removeEventListener('mouseup', onMouseUp as EventListener);
    }
  };
}; 