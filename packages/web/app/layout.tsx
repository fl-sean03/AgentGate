import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'AgentGate - AI-powered code changes, verified & delivered',
  description:
    'Submit a task. Watch an AI agent work. Get a verified PR back. AgentGate orchestrates AI coding agents with 4-level verification.',
  keywords: [
    'AI coding',
    'code automation',
    'pull request',
    'GitHub',
    'Claude',
    'AI agent',
  ],
  authors: [{ name: 'AgentGate' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://agentgate.dev',
    siteName: 'AgentGate',
    title: 'AgentGate - AI-powered code changes',
    description: 'Submit a task. Watch an AI agent work. Get a verified PR back.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AgentGate',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentGate - AI-powered code changes',
    description: 'Submit a task. Watch an AI agent work. Get a verified PR back.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
