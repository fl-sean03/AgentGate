import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { User, Mail, Bell, Trash2 } from 'lucide-react';

export default async function SettingsPage() {
  const session = await auth();
  const user = await db.user.findUnique({
    where: { email: session?.user?.email ?? '' },
    include: { settings: true },
  });

  const settings = user?.settings ?? {
    maxIterations: 3,
    emailOnComplete: true,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account preferences
        </p>
      </div>

      {/* Profile */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Profile</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {session?.user?.image ? (
              <img
                src={session.user.image}
                alt={session.user.name ?? 'User'}
                className="h-16 w-16 rounded-full"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="font-medium text-lg">{session?.user?.name}</p>
              <p className="text-muted-foreground">{session?.user?.email}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Profile synced from GitHub
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Preferences</h2>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Email notifications</p>
                <p className="text-sm text-muted-foreground">
                  Get notified when runs complete
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={settings.emailOnComplete}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-5 w-5 flex items-center justify-center text-muted-foreground">
                <span className="text-sm font-medium">#</span>
              </div>
              <div>
                <p className="font-medium">Default max iterations</p>
                <p className="text-sm text-muted-foreground">
                  Maximum retry attempts for each task
                </p>
              </div>
            </div>
            <select
              defaultValue={settings.maxIterations}
              className="w-full sm:w-32 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg border border-destructive/50 bg-card p-6">
        <h2 className="font-semibold text-destructive mb-4">Danger Zone</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Delete Account</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all data
            </p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-md border border-destructive text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-4 w-4" />
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
