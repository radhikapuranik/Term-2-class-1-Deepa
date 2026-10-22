import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { currentUser } from "@/lib/auth";
import { logout } from "./actions";

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
  const user = await currentUser();
  return (
    <html lang="en" className={`${display.variable} ${plex.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <div className="shell">
          <aside className="side">
            <Link href="/" className="brand">Demand <span>Desk</span><small>by Freshroots</small></Link>
            <Nav />
            <div className="side-foot">
              {user ? <div className="small muted who" title={user}>Signed in as<br /><b style={{ color: "var(--ink)" }}>{user}</b></div> : <div className="small muted who">Read-only. Sign in to act.</div>}
              <div className="head-tools">
                <ThemeToggle />
                {user ? <form action={logout}><button className="btn sm">Sign out</button></form> : <Link className="btn sm primary" href="/login">Sign in</Link>}
              </div>
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
