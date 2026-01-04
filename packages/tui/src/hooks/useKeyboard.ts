import { useCallback, useRef, useEffect } from 'react';
import { useInput, Key } from 'ink';

type KeyHandler = (input: string, key: Key) => void | Promise<void>;

interface KeyMap {
  [key: string]: KeyHandler;
}

interface UseKeyboardOptions {
  // Whether to enable vim-style navigation
  vimNavigation?: boolean;
  // Global shortcuts that always work
  globalShortcuts?: KeyMap;
  // Screen-specific shortcuts
  screenShortcuts?: KeyMap;
  // Whether keyboard input is enabled
  enabled?: boolean;
}

interface UseKeyboardResult {
  // Register a key handler dynamically
  registerKey: (key: string, handler: KeyHandler) => void;
  // Unregister a key handler
  unregisterKey: (key: string) => void;
}

// Normalize key combinations to a consistent format
function normalizeKey(input: string, key: Key): string {
  if (key.return) return 'enter';
  if (key.escape) return 'escape';
  if (key.upArrow) return 'up';
  if (key.downArrow) return 'down';
  if (key.leftArrow) return 'left';
  if (key.rightArrow) return 'right';
  if (key.tab) return key.shift ? 'shift+tab' : 'tab';
  if (key.backspace) return 'backspace';
  if (key.delete) return 'delete';
  if (key.ctrl && input) return `ctrl+${input.toLowerCase()}`;
  if (key.meta && input) return `meta+${input.toLowerCase()}`;
  if (key.shift && input.length === 1) return input.toUpperCase();
  return input.toLowerCase();
}

// Vim-style navigation mappings
const VIM_MAPPINGS: Record<string, string> = {
  j: 'down',
  k: 'up',
  h: 'left',
  l: 'right',
  g: 'home', // go to top
  G: 'end', // go to bottom (shift+g)
};

export function useKeyboard(options: UseKeyboardOptions = {}): UseKeyboardResult {
  const {
    vimNavigation = true,
    globalShortcuts = {},
    screenShortcuts = {},
    enabled = true,
  } = options;

  // Dynamic key handlers
  const dynamicHandlersRef = useRef<KeyMap>({});

  const registerKey = useCallback((key: string, handler: KeyHandler) => {
    dynamicHandlersRef.current[key.toLowerCase()] = handler;
  }, []);

  const unregisterKey = useCallback((key: string) => {
    delete dynamicHandlersRef.current[key.toLowerCase()];
  }, []);

  useInput(
    async (input, key) => {
      if (!enabled) return;

      const normalizedKey = normalizeKey(input, key);

      // Check dynamic handlers first
      if (dynamicHandlersRef.current[normalizedKey]) {
        await dynamicHandlersRef.current[normalizedKey](input, key);
        return;
      }

      // Check screen-specific shortcuts
      if (screenShortcuts[normalizedKey]) {
        await screenShortcuts[normalizedKey](input, key);
        return;
      }

      // Check global shortcuts
      if (globalShortcuts[normalizedKey]) {
        await globalShortcuts[normalizedKey](input, key);
        return;
      }

      // Apply vim navigation mappings
      if (vimNavigation && VIM_MAPPINGS[input]) {
        const mappedKey = VIM_MAPPINGS[input];
        if (screenShortcuts[mappedKey]) {
          await screenShortcuts[mappedKey](input, key);
          return;
        }
        if (globalShortcuts[mappedKey]) {
          await globalShortcuts[mappedKey](input, key);
          return;
        }
        if (dynamicHandlersRef.current[mappedKey]) {
          await dynamicHandlersRef.current[mappedKey](input, key);
          return;
        }
      }
    },
    { isActive: enabled }
  );

  return {
    registerKey,
    unregisterKey,
  };
}

// Helper hook for common navigation patterns
export function useNavigationKeys(
  selectedIndex: number,
  maxIndex: number,
  onChange: (index: number) => void,
  options: { enabled?: boolean; wrap?: boolean } = {}
): void {
  const { enabled = true, wrap = false } = options;

  useInput(
    (input, key) => {
      if (key.upArrow || input === 'k') {
        if (selectedIndex > 0) {
          onChange(selectedIndex - 1);
        } else if (wrap) {
          onChange(maxIndex);
        }
        return;
      }

      if (key.downArrow || input === 'j') {
        if (selectedIndex < maxIndex) {
          onChange(selectedIndex + 1);
        } else if (wrap) {
          onChange(0);
        }
        return;
      }

      // Home/End navigation
      if (input === 'g') {
        onChange(0);
        return;
      }
      if (input === 'G') {
        onChange(maxIndex);
        return;
      }
    },
    { isActive: enabled }
  );
}

// Helper hook for confirming actions
export function useConfirmKey(
  onConfirm: () => void,
  confirmKey: string = 'enter',
  options: { enabled?: boolean } = {}
): void {
  const { enabled = true } = options;

  useInput(
    (input, key) => {
      const normalizedKey = normalizeKey(input, key);
      if (normalizedKey === confirmKey) {
        onConfirm();
      }
    },
    { isActive: enabled }
  );
}
