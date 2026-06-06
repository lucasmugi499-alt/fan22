import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
import "./globals.css";

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sansFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const monoFont = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/context/AuthProvider";
import { AuthModalProvider } from "@/components/auth/AuthRequiredModal";
import { DemoRoleSwitcher } from "@/components/auth/DemoRoleSwitcher";

export const metadata: Metadata = {
  title: {
    default: "GoalPlace256 | Back the athletes. Build the game.",
    template: "%s | GoalPlace256",
  },
  description:
    "GoalPlace256 is Uganda's mobile-first sports platform for fans, verified athletes, leagues, teams, sponsors, and community impact.",
  applicationName: "GoalPlace256",
  keywords: [
    "GoalPlace256",
    "Uganda sport",
    "grassroots football",
    "Uganda basketball",
    "Uganda rugby",
    "athlete support",
    "GoalPlace Points",
  ],
};

import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased dark"
    >
      <body className={`min-h-full flex flex-col bg-background text-foreground ${displayFont.variable} ${sansFont.variable} ${monoFont.variable} font-sans`}>
        <AuthProvider>
          <AuthModalProvider>
            <AppShell>{children}</AppShell>
            <DemoRoleSwitcher />
          </AuthModalProvider>
        </AuthProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            className:
              "border-white/10 bg-[#111827]/95 text-slate-50 backdrop-blur-xl",
          }}
        />
      </body>
    </html>
  );
}
