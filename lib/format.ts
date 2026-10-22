const IST = "Asia/Kolkata";

export const n1 = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
export const n0 = (n: number | null | undefined) => (n == null ? "–" : Math.round(n).toLocaleString("en-IN"));

export function dateIst(d: Date | string | null): string {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
}
export function dateTimeIst(d: Date | string | null): string {
  if (!d) return "–";
  const x = new Date(d);
  const date = x.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: IST });
  const time = x.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST });
  return `${date}, ${time} IST`;
}
export function ago(d: Date | string | null, now = Date.now()): string {
  if (!d) return "never";
  const s = Math.max(0, (now - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
export const monthName = (ym: string | null) =>
  ym ? new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }) : "";
