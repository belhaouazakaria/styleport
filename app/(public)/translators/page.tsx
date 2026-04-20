import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function TranslatorsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();

  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  if (params.page) query.set("page", params.page);

  const target = query.toString() ? `/?${query.toString()}` : "/";
  redirect(target);
}
