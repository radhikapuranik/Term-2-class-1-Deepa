# Design: "The Demand Desk"

A control tower for one planner. In ten seconds it answers: what needs a decision today, why, and how much.

- **Type** (`next/font`): Bricolage Grotesque for the headline and big numerals; IBM Plex Sans for text; IBM Plex Mono for numbers, SKU codes and labels, tabular figures throughout.
- **Colour tokens** (CSS variables, light and dark, system setting plus a toggle). Light: background `#F6F4EE`, surface `#FFFFFF`, ink `#14211B`, muted `#5E6B63`, hairline `#E2DFD4`, brand `#1F6B45`, highlighter `#FFD84D`. Dark: `#0E1411`, `#151D18`, `#E8EFEA`, `#9AA89F`, `#26322B`, `#5DBE8A`, `#E0B72F`. Status colours always come with an icon and a word: stockout, high demand, overstock, OK; borderline is a dashed outline; exception is an ink outline with a flag. High-demand text uses a darker shade (`#8A5A12`) in light mode to pass AA.
- **Layout:** 12-column grid, 8px rhythm, hairline rules instead of shadows, max width 1280px, works from 360px (tables become stacked cards).
- **Signature elements:** hero sentence with a drawn highlighter; cover bar (safe zone, today marker, ghost marker for after the order); custom SVG sales chart (12-week average, last 4 weeks, festival months, direct labels); till-receipt "rule receipt"; keyboard approve queue (J K A E O D U) with 8-second undo; order sheet by distributor.
- **Motion (GSAP, restrained):** hero lines slide up, one count-up, highlighter draws on; under 0.8s, one easing; wrapped in `gsap.matchMedia` so reduced-motion users get a fully static page. Tables, buttons and banners never animate.
- **Accessibility:** visible focus, skip link, table captions, `aria-live` on run status and the undo toast, chart `aria-label` summaries, status never by colour alone. Lighthouse on the live URL: Performance 91, Accessibility 97, Best Practices 100.
