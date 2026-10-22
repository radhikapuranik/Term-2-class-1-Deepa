import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NameChip } from "@/components/NameChip";
import { getKill } from "@/lib/kill";
import { unreadAlerts } from "@/lib/alerts";
import { dateTimeIst } from "@/lib/format";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Demand Desk, by Freshroots", template: "%s | Demand Desk" },
  description: "Twice-weekly reorder recommendations for Freshroots, with the reasoning shown and the planner in control.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F6F4EE" }, { media: "(prefers-color-scheme: dark)", color: "#0E1411" }] };

const themeInit = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [kill, unread] = await Promise.all([getKill().catch(() => null), unreadAlerts().catch(() => 0)]);
  return (
    <html lang="en" className={`${display.variable} ${plex.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {kill && <div className="killbar" role="alert">Demand Desk is switched off: {kill.reason}, {dateTimeIst(kill.at)}. Past data stays readable. <Link href="/impact#kill-switch" style={{ color: "inherit" }}>Switch back on</Link></div>}
        <div className="shell">
          <aside className="side">
            <Link href="/" className="brand">Demand <span>Desk</span><small>by Freshroots</small></Link>
            <Nav />
            <div className="side-foot">
              <div className="who"><NameChip /></div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Link href="/impact#kill-switch" className={`chip-live ${kill ? "off" : "on"}`} title={kill ? "Switched off" : "Running normally"}>{kill ? "■ OFF" : "● LIVE"}</Link>
                <Link href="/alerts" className="bell" aria-label={`Alerts, ${unread} unread`}>🔔{unread > 0 && <b>{unread}</b>}</Link>
              </div>
              <div className="head-tools"><ThemeToggle /></div>
            </div>
          </aside>
          <div className="content">
            <main id="main"><div className="wrap">{children}</div></main>
            <footer className="foot"><div className="wrap">Demand Desk recommends; it never orders. Gemini writes explanations only. Every number comes from the rule engine.</div></footer>
          </div>
        </div>
      </body>
    </html>
  );
}
