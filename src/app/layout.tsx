import type { Metadata } from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans, Space_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/context/AuthProvider';
import { AuthModalProvider } from '@/components/auth/AuthRequiredModal';
import { DemoRoleSwitcher } from '@/components/auth/DemoRoleSwitcher';
import { EnvironmentBoundary } from '@/components/layout/EnvironmentBoundary';
import { EnvironmentBanner } from '@/components/layout/EnvironmentBanner';

const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sansFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const monoFont = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://goalplace256.com'),
  title: {
    default: 'GoalPlace256 | Verified grassroots sport',
    template: '%s | GoalPlace256',
  },
  description:
    "GoalPlace256 is Uganda's verified digital operating system for grassroots sports leagues, where a result becomes official only once both teams confirm it.",
  applicationName: 'GoalPlace256',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className="dark h-full antialiased">
      <body
        className={`min-h-full ${displayFont.variable} ${sansFont.variable} ${monoFont.variable} font-sans`}
      >
        <EnvironmentBoundary>
          <EnvironmentBanner />
          <AuthProvider>
            <AuthModalProvider>
              <AppShell>{children}</AppShell>
              <DemoRoleSwitcher />
            </AuthModalProvider>
          </AuthProvider>
        </EnvironmentBoundary>
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            className: 'border border-border bg-surface-2 text-text shadow-e2',
          }}
        />
      </body>
    </html>
  );
}
