import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import {
  LayoutDashboard,
  CreditCard,
  Settings,
  Github,
  Key,
  History,
  LogOut,
} from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 max-w-screen-xl items-center px-4">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-bold text-xl text-primary">AgentGate</span>
          </Link>

          <div className="ml-auto flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              {session.user?.email}
            </span>
            <Link
              href="/logout"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-screen-xl px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full md:w-64 shrink-0">
            <nav className="space-y-1">
              <NavItem href="/account" icon={<LayoutDashboard className="h-4 w-4" />}>
                Overview
              </NavItem>
              <NavItem href="/account/runs" icon={<History className="h-4 w-4" />}>
                Runs
              </NavItem>
              <NavItem href="/account/billing" icon={<CreditCard className="h-4 w-4" />}>
                Billing
              </NavItem>
              <NavItem href="/account/github" icon={<Github className="h-4 w-4" />}>
                GitHub
              </NavItem>
              <NavItem href="/account/api-keys" icon={<Key className="h-4 w-4" />}>
                API Keys
              </NavItem>
              <NavItem href="/account/settings" icon={<Settings className="h-4 w-4" />}>
                Settings
              </NavItem>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {icon}
      {children}
    </Link>
  );
}
