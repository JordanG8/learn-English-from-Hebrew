import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/lib/app-providers";
import { readServerVisit } from "@/lib/visitor-server";

export const metadata: Metadata = {
  title: "אנגלית מההתחלה",
  description: "לומדים את האותיות באנגלית ואת המקלדת — משחק תרגול לכיתות א׳–ו׳",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Kids rest palms on tablets; pinch-zoom mid-lesson breaks the keyboard layout.
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f7f7fb",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Layer 1 of returning-visitor detection, read before first paint so the
  // walkthrough decision never flashes. See lib/visitor.ts for the policy —
  // in particular, why this can only ever offer a skip button and never skip.
  const visit = await readServerVisit();

  return (
    <html lang="he" dir="rtl">
      <body className="min-h-dvh antialiased">
        <AppProviders
          serverVisit={{ cookie: visit.cookie, currentIpHash: visit.currentIpHash }}
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
