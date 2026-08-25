import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, LogOut } from "lucide-react";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useSnapshot } from "@/hooks/use-app-data";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/swipe", label: "Swipe" },
  { to: "/my-list", label: "My List" },

  { to: "/favorites", label: "Favorites" },
  { to: "/watched", label: "Watched" },
  { to: "/profile", label: "Profile" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data } = useSnapshot();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/85 px-5 py-4 backdrop-blur">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground">
            <Menu className="size-4" /> Library
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-border bg-sidebar p-0">
            <nav className="flex h-full flex-col gap-1 px-6 pt-14">
              <p className="mb-5 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">Movies</p>
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "chamfer-sm px-3 py-2 font-display text-2xl transition-colors",
                    pathname === item.to ? "text-primary" : "text-foreground/80 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <button
                onClick={signOut}
                className="mt-auto mb-8 flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </nav>
          </SheetContent>
        </Sheet>

        <Link to="/" className="flex items-center gap-2 font-display text-xl tracking-tight">
          <img src={reelLogo.url} alt="Reel logo" className="size-7 object-contain" />
          Reel
        </Link>

        <Link
          to="/profile"
          aria-label="Profile"
          className="chamfer-sm hairline flex size-8 items-center justify-center text-xs uppercase text-muted-foreground"
        >
          {(data?.profile.display_name ?? "?").slice(0, 1)}
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-8">{children}</main>
    </div>
  );
}
