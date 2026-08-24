import { Navigate } from "@tanstack/react-router";

import { useSession } from "@/hooks/use-session";
import { AppShell } from "./app-shell";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" />;
  return <AppShell>{children}</AppShell>;
}
