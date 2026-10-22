"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ic = (d: string) => <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const GROUPS: { title: string; items: [string, string, ReactNode][] }[] = [
  { title: "Work", items: [
    ["/", "Today", ic("M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z")],
    ["/recommendations", "All SKUs", ic("M3 5h14M3 10h14M3 15h14")],
    ["/exceptions", "Exceptions", ic("M5 17V3m0 1h9l-2 3.5L14 11H5")],
    ["/orders", "Orders", ic("M4 6h12l-1 10H5zM7 6a3 3 0 0 1 6 0")],
  ] },
  { title: "Setup", items: [
    ["/rules", "Rules", ic("M4 6h8M14 6h2M4 14h2M8 14h8M12 4v4M6 12v4")],
    ["/data", "Data", ic("M10 3c4 0 7 1.2 7 2.7S14 8.4 10 8.4 3 7.2 3 5.7 6 3 10 3zM3 5.7v8.6C3 15.8 6 17 10 17s7-1.2 7-2.7V5.7")],
  ] },
  { title: "Track", items: [
    ["/impact", "Impact", ic("M3 16V9m5 7V4m5 12v-5m4 5H2")],
    ["/runs", "Runs", ic("M6 4l10 6-10 6z")],
    ["/about", "About", ic("M10 9v5m0-8v.01M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z")],
  ] },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {GROUPS.map((g) => (
        <div key={g.title} className="nav-group">
          <div className="nav-title">{g.title}</div>
          {g.items.map(([href, label, icon]) => (
            <Link key={href} href={href} aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}>{icon}<span>{label}</span></Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
