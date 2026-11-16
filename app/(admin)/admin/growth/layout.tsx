import { GrowthNav } from "@/components/admin/growth-nav";
export default function GrowthLayout({ children }: { children: React.ReactNode }) {
  return <><GrowthNav />{children}</>;
}
