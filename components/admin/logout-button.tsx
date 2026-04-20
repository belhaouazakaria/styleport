import { LogOut } from "lucide-react";

import { logoutAction } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline" size="sm">
        <LogOut className="h-4 w-4" />
        Logout
      </Button>
    </form>
  );
}
