'use client';

import { useState } from 'react';
import { Key, Copy, Trash2, Plus, Check, Eye, EyeOff } from 'lucide-react';
import { formatDate, maskApiKey, generateApiKey } from '@/lib/utils';

// Mock data - would come from server
const mockApiKeys = [
  {
    id: '1',
    name: 'Production',
    keyPrefix: 'ag_live_',
    keySuffix: 'abcd',
    createdAt: new Date('2025-12-01'),
    lastUsed: new Date('2026-01-03'),
  },
  {
    id: '2',
    name: 'Development',
    keyPrefix: 'ag_test_',
    keySuffix: 'efgh',
    createdAt: new Date('2025-12-15'),
    lastUsed: null,
  },
];

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState(mockApiKeys);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;

    const fullKey = generateApiKey();
    const newKey = {
      id: String(Date.now()),
      name: newKeyName,
      keyPrefix: fullKey.slice(0, 8),
      keySuffix: fullKey.slice(-4),
      createdAt: new Date(),
      lastUsed: null,
    };

    setApiKeys([...apiKeys, newKey]);
    setNewlyCreatedKey(fullKey);
    setNewKeyName('');
  };

  const handleDeleteKey = (id: string) => {
    if (confirm('Are you sure you want to revoke this API key? This cannot be undone.')) {
      setApiKeys(apiKeys.filter((k) => k.id !== id));
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Manage your API keys for CLI and integrations
          </p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Key
        </button>
      </div>

      {/* Newly created key alert */}
      {newlyCreatedKey && (
        <div className="rounded-lg border border-primary bg-primary/10 p-4">
          <div className="flex items-start gap-3">
            <Key className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-primary">API Key Created</p>
              <p className="text-sm text-muted-foreground mt-1">
                Save this key now. You won&apos;t be able to see it again.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 bg-background px-3 py-2 rounded font-mono text-sm border border-border">
                  {newlyCreatedKey}
                </code>
                <button
                  onClick={() => handleCopy(newlyCreatedKey, 'new')}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded border border-border hover:bg-accent transition-colors"
                >
                  {copiedId === 'new' ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <button
                onClick={() => setNewlyCreatedKey(null)}
                className="mt-3 text-sm text-primary hover:underline"
              >
                I&apos;ve saved my key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create dialog */}
      {showCreateDialog && !newlyCreatedKey && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-semibold mb-4">Create API Key</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Key Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production, CI/CD, Development"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateKey}
                disabled={!newKeyName.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Key
              </button>
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewKeyName('');
                }}
                className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Keys list */}
      <div className="rounded-lg border border-border bg-card">
        <div className="p-6 border-b border-border">
          <h2 className="font-semibold">Your API Keys</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Use these keys to authenticate with the AgentGate CLI or API
          </p>
        </div>
        {apiKeys.length > 0 ? (
          <div className="divide-y divide-border">
            {apiKeys.map((key) => (
              <div key={key.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{key.name}</p>
                      <p className="text-sm font-mono text-muted-foreground">
                        {key.keyPrefix}****{key.keySuffix}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteKey(key.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    title="Revoke key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Created {formatDate(key.createdAt).split(',')[0]}
                  {key.lastUsed && (
                    <> · Last used {formatDate(key.lastUsed).split(',')[0]}</>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-muted-foreground">
            <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No API keys yet</p>
            <p className="text-sm mt-1">Create your first API key to get started</p>
          </div>
        )}
      </div>

      {/* Usage instructions */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Using Your API Key</h2>
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-2">Configure the CLI:</p>
            <code className="block bg-secondary p-3 rounded font-mono text-xs">
              export AGENTGATE_API_KEY=ag_live_your_key_here
            </code>
          </div>
          <div>
            <p className="text-muted-foreground mb-2">Or pass directly:</p>
            <code className="block bg-secondary p-3 rounded font-mono text-xs">
              agentgate run --api-key ag_live_your_key_here
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
