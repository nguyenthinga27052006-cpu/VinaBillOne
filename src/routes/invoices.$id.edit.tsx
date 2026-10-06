import { createFileRoute } from "@tanstack/react-router";
import { InvoiceForm } from "@/components/invoice-form";
import { PageHeader } from "@/components/page-header";
import { getInvoice, getLookups, listCustomers } from "@/lib/billing/api";

export const Route = createFileRoute("/invoices/$id/edit")({
  loader: async ({ params }) => {
    const id = Number(params.id);
    const [invoice, lookups, customers] = await Promise.all([
      getInvoice({ data: { id } }),
      getLookups(),
      listCustomers({ data: {} }),
    ]);
    return { invoice, lookups, customers };
  },
  component: EditInvoicePage,
});

function EditInvoicePage() {
  const { invoice, lookups, customers } = Route.useLoaderData();
  return (
    <div>
      <PageHeader
        eyebrow="Hóa đơn"
        title="Sửa hóa đơn"
        description="Chỉ hóa đơn nháp hoặc chờ duyệt mới được chỉnh sửa số liệu."
      />
      <InvoiceForm
        invoice={invoice}
        customers={customers}
        products={lookups.products}
        taxRates={lookups.taxRates}
        series={lookups.series}
      />
    </div>
  );
}
