import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-border/40 bg-background">
        <div className="container mx-auto flex h-14 max-w-screen-xl items-center px-4">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-bold text-xl text-primary">AgentGate</span>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-4">
        <div className="container mx-auto max-w-screen-xl px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} AgentGate. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
