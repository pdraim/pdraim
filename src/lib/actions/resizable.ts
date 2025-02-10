import type { Action } from 'svelte/action';

interface ResizableParameters {
  enabled?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

interface ResizableAttributes {
  onresizestart?: (e: CustomEvent<{ width: number; height: number }>) => void;
  onresizemove?: (e: CustomEvent<{ width: number; height: number }>) => void;
  onresizeend?: (e: CustomEvent<{ width: number; height: number }>) => void;
}

export const resizable: Action<HTMLElement, ResizableParameters, ResizableAttributes> = (node, params = {}) => {
  let isResizing = false;
  let startWidth = 0;
  let startHeight = 0;
  let startX = 0;
  let startY = 0;
  
  const {
    enabled = true,
    minWidth = 200,
    minHeight = 200,
    maxWidth = window.innerWidth,
    maxHeight = window.innerHeight
  } = params;

  // Create and append resize handle
  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  Object.assign(handle.style, {
    position: 'absolute',
    bottom: '0',
    right: '0',
    width: '15px',
    height: '15px',
    cursor: 'se-resize',
    zIndex: '1000'
  });
  node.appendChild(handle);

  // Ensure parent element has position
  if (getComputedStyle(node).position === 'static') {
    node.style.position = 'relative';
  }

  function onMouseDown(event: MouseEvent) {
    if (!enabled) return;
    
    isResizing = true;
    startX = event.clientX;
    startY = event.clientY;
    startWidth = node.offsetWidth;
    startHeight = node.offsetHeight;
    
    node.dispatchEvent(new CustomEvent('resizestart', {
      detail: { width: startWidth, height: startHeight }
    }));
    
    event.preventDefault();
  }

  function onMouseMove(event: MouseEvent) {
    if (!isResizing || !enabled) return;

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    
    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + deltaX));
    const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + deltaY));
    
    node.style.width = `${newWidth}px`;
    node.style.height = `${newHeight}px`;
    
    node.dispatchEvent(new CustomEvent('resizemove', {
      detail: { width: newWidth, height: newHeight }
    }));
  }

  function onMouseUp() {
    if (!isResizing) return;
    
    isResizing = false;
    node.dispatchEvent(new CustomEvent('resizeend', {
      detail: { 
        width: node.offsetWidth, 
        height: node.offsetHeight 
      }
    }));
  }

  handle.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return {
    update(newParams: ResizableParameters) {
      Object.assign(params, newParams);
    },
    destroy() {
      handle.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      node.removeChild(handle);
    }
  };
}; 