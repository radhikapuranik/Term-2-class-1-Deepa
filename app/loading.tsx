import { Skeleton } from "@/components/ui";
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: "grid", gap: 14 }}>
      <Skeleton h={56} w="60%" /><Skeleton h={20} w="40%" /><Skeleton h={220} /><Skeleton h={220} />
    </div>
  );
}
