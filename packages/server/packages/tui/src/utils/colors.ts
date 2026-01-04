/**
 * Color palette for TUI components
 */
export const colors = {
  // Status colors
  success: 'green',
  failure: 'red',
  warning: 'yellow',
  info: 'cyan',

  // UI colors
  primary: 'blue',
  secondary: 'gray',
  muted: 'dim',
  accent: 'magenta',

  // Text colors
  text: 'white',
  textMuted: 'gray',
  textHighlight: 'cyan',

  // Border colors
  border: 'gray',
  borderActive: 'cyan',
} as const;

export type ColorName = keyof typeof colors;
export type ColorValue = (typeof colors)[ColorName];
