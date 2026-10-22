"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";

export function Hero({ count, total, label }: { count: number; total: number; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ease = "power3.out";
      gsap.from(root.current!.querySelectorAll("[data-line]"), { y: 24, opacity: 0, duration: 0.6, ease, stagger: 0.08 });
      const num = root.current!.querySelector<HTMLElement>("[data-count]");
      if (num) {
        const o = { v: 0 };
        gsap.to(o, { v: count, duration: 0.7, ease, onUpdate: () => { num.textContent = String(Math.round(o.v)); } });
      }
      const path = root.current!.querySelector<SVGPathElement>("[data-hl]");
      if (path) {
        const len = path.getTotalLength();
        gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.7, ease, delay: 0.45 });
      }
    });
    return () => mm.revert();
  }, [count]);
  return (
    <div className="hero" ref={root}>
      <h1>
        <span data-line className="big">
          <span data-count>{count}</span> of {total}
          <svg className="hl" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
            <path data-hl d="M1 6 C 20 2, 45 9, 70 4 S 95 6, 99 3" vectorEffect="non-scaling-stroke" />
          </svg>
        </span>{" "}
        <span data-line style={{ display: "inline-block" }}>SKUs need a decision today.</span>
      </h1>
      <p className="hero-sub" data-line>{label}</p>
    </div>
  );
}
