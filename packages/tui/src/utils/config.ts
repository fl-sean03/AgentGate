import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.agentgate');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface TuiConfig {
  apiUrl: string;
  theme: 'dark' | 'light';
  defaultMaxIterations: number;
  unicode: boolean;
}

const DEFAULT_CONFIG: TuiConfig = {
  apiUrl: 'https://api.agentgate.dev',
  theme: 'dark',
  defaultMaxIterations: 3,
  unicode: true,
};

let cachedConfig: TuiConfig | null = null;

export function loadConfig(): TuiConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const stored = JSON.parse(content) as Partial<TuiConfig>;
      cachedConfig = { ...DEFAULT_CONFIG, ...stored };
    } else {
      cachedConfig = { ...DEFAULT_CONFIG };
    }
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  // Override with environment variables
  if (process.env['AGENTGATE_API_URL']) {
    cachedConfig.apiUrl = process.env['AGENTGATE_API_URL'];
  }

  return cachedConfig;
}

export function saveConfig(config: Partial<TuiConfig>): void {
  const current = loadConfig();
  const updated = { ...current, ...config };

  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), {
      mode: 0o600,
    });

    cachedConfig = updated;
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

export function getConfig(): TuiConfig {
  return loadConfig();
}

export function setConfigValue<K extends keyof TuiConfig>(
  key: K,
  value: TuiConfig[K]
): void {
  saveConfig({ [key]: value });
}

export function resetConfig(): void {
  cachedConfig = null;
}

// Check if terminal supports unicode
export function supportsUnicode(): boolean {
  const config = getConfig();
  if (!config.unicode) {
    return false;
  }

  // Check common environment variables
  const term = process.env['TERM'] || '';
  const lang = process.env['LANG'] || '';

  // Most modern terminals support unicode
  if (term.includes('xterm') || term.includes('256color')) {
    return true;
  }

  if (lang.toLowerCase().includes('utf')) {
    return true;
  }

  // Windows Terminal and ConEmu support unicode
  if (process.env['WT_SESSION'] || process.env['ConEmuANSI']) {
    return true;
  }

  return false;
}

// Get box drawing characters based on terminal support
export function getBoxChars(): {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
} {
  if (supportsUnicode()) {
    return {
      topLeft: '╭',
      topRight: '╮',
      bottomLeft: '╰',
      bottomRight: '╯',
      horizontal: '─',
      vertical: '│',
    };
  }

  return {
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    horizontal: '-',
    vertical: '|',
  };
}
