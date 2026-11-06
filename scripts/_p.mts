import { efetch } from "../lib/erpnext.ts";
const j = await efetch<{ data: { name: string; title: string; docstatus: number }[] }>('/api/resource/Purchase Order?fields=["name","title","docstatus"]');
console.log(JSON.stringify(j.data));
if (j.data[0]) { const d = await efetch<{ data: { supplier: string; items: { item_code: string; qty: number; rate: number }[] } }>(`/api/resource/Purchase Order/${j.data[0].name}`); console.log(d.data.supplier, JSON.stringify(d.data.items.map((i) => [i.item_code, i.qty, i.rate]))); }
