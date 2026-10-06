import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AppShell } from "@/components/layout/app-shell";
import { RoleProvider } from "@/components/layout/role-context";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { bootstrapApp } from "@/lib/billing/api";
import appCss from "../styles.css?url";

const APP_NAME = "VinaBill";

export const Route = createRootRoute({
  loader: () => bootstrapApp(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Hệ thống quản lý hóa đơn điện tử — phát hành, công nợ, thanh toán và nhắc nợ.",
      },
      { name: "theme-color", content: "#1A4A52" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@500&display=swap",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const data = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPrint = pathname.endsWith("/print");

  return (
    <html lang="vi" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <RoleProvider>
            <TooltipProvider delayDuration={200}>
              {isPrint ? (
                <Outlet />
              ) : (
                <AppShell companyName={data.company?.name}>
                  <Outlet />
                </AppShell>
              )}
              <Toaster />
            </TooltipProvider>
          </RoleProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
