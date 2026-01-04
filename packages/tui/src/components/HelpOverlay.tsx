import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { Screen } from '../App.js';

interface HelpOverlayProps {
  currentScreen: Screen;
  onClose: () => void;
}

interface Shortcut {
  key: string;
  description: string;
}

const GLOBAL_SHORTCUTS: Shortcut[] = [
  { key: '?', description: 'Toggle help' },
  { key: 'q', description: 'Quit' },
  { key: 'Esc', description: 'Go back / Cancel' },
];

const SCREEN_SHORTCUTS: Record<Screen, Shortcut[]> = {
  login: [{ key: 'Enter', description: 'Login with browser' }],
  home: [
    { key: '↑/↓ or j/k', description: 'Navigate list' },
    { key: 'Enter', description: 'Select repository' },
    { key: 'r', description: 'View runs' },
    { key: 'v', description: 'View running task' },
    { key: '/', description: 'Focus search' },
  ],
  task: [
    { key: 'Enter', description: 'Submit task' },
    { key: 'Ctrl+Enter', description: 'Submit task' },
    { key: 'Esc', description: 'Go back' },
  ],
  running: [
    { key: 'c', description: 'Cancel task' },
    { key: 'd', description: 'Detach (run continues)' },
  ],
  verifying: [{ key: 'c', description: 'Cancel task' }],
  success: [
    { key: 'Enter', description: 'Done' },
    { key: 'o', description: 'Open PR in browser' },
  ],
  failure: [
    { key: 'Enter', description: 'Done' },
    { key: 'r', description: 'Retry with more iterations' },
  ],
  canceled: [{ key: 'Enter', description: 'Done' }],
  runs: [
    { key: '↑/↓ or j/k', description: 'Navigate list' },
    { key: 'Enter', description: 'View details' },
    { key: 'Esc', description: 'Go back' },
  ],
  'run-detail': [
    { key: 'o', description: 'Open PR in browser' },
    { key: 'Esc', description: 'Go back' },
  ],
};

export function HelpOverlay({
  currentScreen,
  onClose,
}: HelpOverlayProps): React.ReactElement {
  useInput((input, key) => {
    if (input === '?' || key.escape) {
      onClose();
    }
  });

  const screenShortcuts = SCREEN_SHORTCUTS[currentScreen] || [];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      marginTop={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Keyboard Shortcuts
        </Text>
      </Box>

      {/* Screen-specific shortcuts */}
      {screenShortcuts.length > 0 && (
        <>
          <Box marginBottom={1}>
            <Text color="gray">Current Screen</Text>
          </Box>
          {screenShortcuts.map((shortcut) => (
            <ShortcutRow key={shortcut.key} shortcut={shortcut} />
          ))}
          <Box marginY={1}>
            <Text color="gray">────────────────</Text>
          </Box>
        </>
      )}

      {/* Global shortcuts */}
      <Box marginBottom={1}>
        <Text color="gray">Global</Text>
      </Box>
      {GLOBAL_SHORTCUTS.map((shortcut) => (
        <ShortcutRow key={shortcut.key} shortcut={shortcut} />
      ))}

      <Box marginTop={1}>
        <Text color="gray">[?] or [Esc] to close</Text>
      </Box>
    </Box>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }): React.ReactElement {
  return (
    <Box>
      <Box width={16}>
        <Text color="yellow">{shortcut.key}</Text>
      </Box>
      <Text>{shortcut.description}</Text>
    </Box>
  );
}
