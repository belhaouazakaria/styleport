import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function requireAdminRoute() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  return session;
}
