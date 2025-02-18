import type { Action } from 'svelte/action';

interface MinimizableParameters {
  enabled?: boolean;
  onMinimize?: (isMinimized: boolean) => void;
}

interface MinimizableAttributes {
  onminimize?: (e: CustomEvent<{ isMinimized: boolean }>) => void;
}

interface StoredState {
  width: number;
  height: number;
  x: number;
  y: number;
}

export const minimizable: Action<HTMLDivElement, MinimizableParameters, MinimizableAttributes> = (node, params = {}) => {
  const {
    enabled = true,
    onMinimize
  } = params;

  let isMinimized = false;
  let storedState: StoredState | null = null;

  function calculateMinimizedWidth() {
    const titleBar = node.querySelector('.title-bar-text');
    if (!titleBar) return 200;

    // Create a temporary element to measure text width
    const temp = document.createElement('div');
    temp.style.position = 'absolute';
    temp.style.visibility = 'hidden';
    temp.style.whiteSpace = 'nowrap';
    temp.style.font = window.getComputedStyle(titleBar).font;
    temp.textContent = titleBar.textContent;
    document.body.appendChild(temp);

    // Get the width and add some padding
    const width = temp.offsetWidth + 100; // Add 100px for buttons and padding
    document.body.removeChild(temp);

    return Math.max(200, Math.min(400, width)); // Keep width between 200 and 400px
  }

  function minimize() {
    if (!enabled || isMinimized) return;

    // Store current state
    storedState = {
      width: node.offsetWidth,
      height: node.offsetHeight,
      x: parseInt(node.style.left) || 0,
      y: parseInt(node.style.top) || 0
    };

    // Check if we're in mobile mode
    const isMobile = window.innerWidth <= 768;

    if (!isMobile) {
      // Desktop minimization
      const minimizedWidth = calculateMinimizedWidth();
      const minimizedHeight = 32; // Height of title bar
      const minimizedX = 10;
      const minimizedY = window.innerHeight - minimizedHeight - 10;

      node.style.width = `${minimizedWidth}px`;
      node.style.height = `${minimizedHeight}px`;
      node.style.left = `${minimizedX}px`;
      node.style.top = `${minimizedY}px`;
    } else {
      // Mobile minimization - position at bottom of screen
      node.style.width = '100%';
      node.style.height = '100%';
      node.style.left = '0';
      node.style.top = `${window.innerHeight - 32}px`; // 32px is title bar height
    }
    
    isMinimized = true;
    node.classList.add('minimized');

    // Hide resize handle
    const resizeHandle = node.querySelector('.resize-handle');
    if (resizeHandle) {
      (resizeHandle as HTMLElement).style.display = 'none';
    }

    onMinimize?.(true);
    node.dispatchEvent(new CustomEvent('minimize', {
      detail: { isMinimized: true }
    }));
  }

  function restore() {
    if (!enabled || !isMinimized || !storedState) return;

    const isMobile = window.innerWidth <= 768;

    if (!isMobile) {
      // Desktop restoration
      node.style.width = `${storedState.width}px`;
      node.style.height = `${storedState.height}px`;
      node.style.left = `${storedState.x}px`;
      node.style.top = `${storedState.y}px`;
    } else {
      // Mobile restoration
      node.style.width = '100%';
      node.style.height = '100%';
      node.style.left = '0';
      node.style.top = '0';
    }

    isMinimized = false;
    node.classList.remove('minimized');

    // Show resize handle if not in mobile mode
    const resizeHandle = node.querySelector('.resize-handle');
    if (resizeHandle) {
      (resizeHandle as HTMLElement).style.display = !isMobile ? 'block' : 'none';
    }

    // Ensure window body is visible
    const windowBody = node.querySelector('.window-body');
    if (windowBody) {
      (windowBody as HTMLElement).style.display = 'flex';
    }

    onMinimize?.(false);
    node.dispatchEvent(new CustomEvent('minimize', {
      detail: { isMinimized: false }
    }));
  }

  function toggle() {
    if (isMinimized) {
      restore();
    } else {
      minimize();
    }
  }

  // Handle double click on title bar
  const titleBar = node.querySelector('.title-bar');
  if (titleBar) {
    titleBar.addEventListener('dblclick', toggle);
  }

  // Expose methods to the node
  Object.assign(node, {
    minimize,
    restore,
    toggleMinimize: toggle,
    isMinimized: () => isMinimized
  });

  return {
    update(newParams: MinimizableParameters) {
      Object.assign(params, newParams);
    },
    destroy() {
      if (titleBar) {
        titleBar.removeEventListener('dblclick', toggle);
      }
    }
  };
}; 