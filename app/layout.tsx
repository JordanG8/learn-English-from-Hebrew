import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppProviders } from "@/lib/app-providers";
import { readServerVisit } from "@/lib/visitor-server";
import { Analytics } from "@vercel/analytics/next";

// Rubik has purpose-built Hebrew (including niqqud positioning) and Latin.
// Keep the OFL font in-repo so local previews and Vercel builds never depend
// on a live Google Fonts fetch.
const rubik = localFont({
  src: "./fonts/Rubik-Variable.ttf",
  weight: "300 900",
  style: "normal",
  variable: "--font-rubik",
  display: "swap",
});

export const metadata: Metadata = {
  title: "אנגלית מההתחלה",
  description: "לומדים את האותיות באנגלית ואת המקלדת — משחק תרגול לכיתות א׳–ו׳",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f7fb",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Layer 1 of returning-visitor detection, read before first paint so the
  // walkthrough decision never flashes. See lib/visitor.ts for the policy —
  // in particular, why this can only ever offer a skip button and never skip.
  const visit = await readServerVisit();

  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body className="min-h-dvh antialiased">
        <AppProviders
          serverVisit={{ cookie: visit.cookie, currentIpHash: visit.currentIpHash }}
        >
          {children}
        </AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
