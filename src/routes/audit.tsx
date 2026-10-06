import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { listAudit } from "@/lib/billing/api";
import { formatDateTime } from "@/lib/billing/format";

export const Route = createFileRoute("/audit")({
  loader: () => listAudit(),
  component: AuditPage,
});

function AuditPage() {
  const logs = Route.useLoaderData();
  return (
    <div>
      <PageHeader
        eyebrow="Hệ thống"
        title="Nhật ký hoạt động"
        description="Mọi thao tác quan trọng trên hóa đơn, thanh toán và danh mục — append-only."
      />
      <ol className="space-y-2">
        {logs.map((l) => (
          <li key={l.id} className="rounded-xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{l.summary}</p>
              <p className="text-xs tabular-nums text-muted-foreground">{formatDateTime(l.createdAt)}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {l.actorName} · {l.action} · {l.entityType} #{l.entityId}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
