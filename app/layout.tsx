import type { Metadata, Viewport } from "next";
import { Assistant } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/lib/app-providers";
import { readServerVisit } from "@/lib/visitor-server";

// Assistant: a Google Font drawn for Hebrew, with a matching Latin set — one
// typeface reads naturally on both sides of the RTL/LTR split in this app.
// next/font self-hosts it at build time, so there is no runtime dependency on
// fonts.googleapis.com and no layout-shift flash of a fallback face.
const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-assistant",
  display: "swap",
});

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
    <html lang="he" dir="rtl" className={assistant.variable}>
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
