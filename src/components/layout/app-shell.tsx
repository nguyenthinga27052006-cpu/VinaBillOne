import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  ScrollText,
  Search,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { ROLE_LABEL, ROLE_NAME } from "@/lib/billing/format";
import { ROLES, type Role } from "@/lib/billing/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRole } from "./role-context";

const NAV = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/invoices", label: "Hóa đơn", icon: FileText },
  { to: "/lookup", label: "Tra cứu HĐ", icon: Search },
  { to: "/customers", label: "Khách hàng", icon: Users },
  { to: "/products", label: "Sản phẩm", icon: Package },
  { to: "/payments", label: "Thanh toán", icon: Wallet },
  { to: "/reminders", label: "Nhắc nợ", icon: Bell },
  { to: "/reports", label: "Báo cáo", icon: BookOpen },
  { to: "/audit", label: "Nhật ký", icon: ScrollText },
  { to: "/settings", label: "Cấu hình", icon: Settings },
] as const;

function NavLinks({
  pathname,
  onNavigate,
  variant,
}: {
  pathname: string;
  onNavigate?: () => void;
  variant: "sidebar" | "sheet";
}) {
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname === item.to || pathname.startsWith(`${item.to}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              variant === "sidebar"
                ? active
                  ? "bg-sidebar-active text-sidebar-active-fg"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-hover"
                : active
                  ? "bg-sidebar-active text-sidebar-active-fg"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-hover",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-active text-sidebar-active-fg">
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg leading-none tracking-tight text-sidebar-active">VinaBill</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-sidebar-muted">Hóa đơn điện tử</p>
      </div>
    </div>
  );
}

export function AppShell({ children, companyName }: { children: ReactNode; companyName?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role, setRole } = useRole();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <BrandMark />
        <div className="flex-1 overflow-y-auto pb-6">
          <NavLinks pathname={pathname} variant="sidebar" />
        </div>
        <div className="border-t border-sidebar-border px-4 py-4">
          <p className="truncate text-xs text-sidebar-muted">{companyName ?? "Công ty TNHH Giải pháp Số An Tâm"}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-paper/90 px-4 backdrop-blur-sm md:h-16 md:px-8">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Mở menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">
              Sổ cái số — tuân thủ NĐ 123 & TT 78
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 gap-2 rounded-full pl-1.5 pr-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {ROLE_NAME[role].split(" ").slice(-1)[0]?.[0]}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-xs font-medium leading-none">{ROLE_NAME[role]}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{ROLE_LABEL[role]}</span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Đổi vai trò demo</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ROLES.map((r) => (
                <DropdownMenuItem key={r} onClick={() => setRole(r as Role)}>
                  <span className="flex flex-col">
                    <span>{ROLE_NAME[r]}</span>
                    <span className="text-xs text-muted-foreground">{ROLE_LABEL[r]}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-sidebar p-0">
          <SheetHeader>
            <SheetTitle className="sr-only">Điều hướng</SheetTitle>
            <BrandMark />
          </SheetHeader>
          <NavLinks pathname={pathname} variant="sheet" onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
