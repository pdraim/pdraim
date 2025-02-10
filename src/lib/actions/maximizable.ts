import type { Action } from 'svelte/action';
interface MaximizableParameters {
  enabled?: boolean;
  padding?: number;
}

interface MaximizableAttributes {
  onmaximize?: (e: CustomEvent<{ 
    isMaximized: boolean;
    width: number;
    height: number;
    x: number;
    y: number;
  }>) => void;
}

interface StoredState {
  width: number;
  height: number;
  x: number;
  y: number;
}

export const maximizable: Action<HTMLDivElement, MaximizableParameters, MaximizableAttributes> = (node, params = {}) => {
  const {
    enabled = true,
    padding = 0
  } = params;

  let isMaximized = false;
  let storedState: StoredState | null = null;

  function maximize() {
    if (!enabled || isMaximized) return;

    // Store current state
    storedState = {
      width: node.offsetWidth,
      height: node.offsetHeight,
      x: parseInt(node.style.left) || 0,
      y: parseInt(node.style.top) || 0
    };

    // Set maximized state
    const maxWidth = window.innerWidth - (padding * 2);
    const maxHeight = window.innerHeight - (padding * 2);
    
    node.style.width = `${maxWidth}px`;
    node.style.height = `${maxHeight}px`;
    node.style.left = `${padding}px`;
    node.style.top = `${padding}px`;
    
    isMaximized = true;

    node.dispatchEvent(new CustomEvent('maximize', {
      detail: { 
        isMaximized: true,
        width: maxWidth,
        height: maxHeight,
        x: padding,
        y: padding
      }
    }));
  }

  function restore() {
    if (!enabled || !isMaximized || !storedState) return;

    // Restore previous state
    node.style.width = `${storedState.width}px`;
    node.style.height = `${storedState.height}px`;
    node.style.left = `${storedState.x}px`;
    node.style.top = `${storedState.y}px`;

    isMaximized = false;

    node.dispatchEvent(new CustomEvent('maximize', {
      detail: { 
        isMaximized: false,
        ...storedState
      }
    }));
  }

  function toggle() {
    if (isMaximized) {
      restore();
    } else {
      maximize();
    }
  }

  // Expose methods to the node
  Object.assign(node, {
    maximize,
    restore,
    toggleMaximize: toggle,
    isMaximized: () => isMaximized
  });

  return {
    update(newParams: MaximizableParameters) {
      Object.assign(params, newParams);
    },
    destroy() {
      // Clean up if needed
    }
  };
}; 