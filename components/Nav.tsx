"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["/", "Today"], ["/recommendations", "All SKUs"], ["/exceptions", "Exceptions"], ["/orders", "Orders"],
  ["/rules", "Rules"], ["/data", "Data"], ["/impact", "Impact"], ["/runs", "Runs"], ["/about", "About"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
