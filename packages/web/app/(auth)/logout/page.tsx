'use client';

import { useEffect } from 'react';
import { signOut } from 'next-auth/react';

export default function LogoutPage() {
  useEffect(() => {
    signOut({ callbackUrl: '/' });
  }, []);

  return (
    <div className="text-center">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
      <p className="text-muted-foreground">Signing out...</p>
    </div>
  );
}
