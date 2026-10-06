import { createFileRoute } from "@tanstack/react-router";
import { InvoiceForm } from "@/components/invoice-form";
import { PageHeader } from "@/components/page-header";
import { getLookups, listCustomers } from "@/lib/billing/api";

export const Route = createFileRoute("/invoices/new")({
  loader: async () => {
    const [lookups, customers] = await Promise.all([getLookups(), listCustomers({ data: {} })]);
    return { lookups, customers };
  },
  component: NewInvoicePage,
});

function NewInvoicePage() {
  const { lookups, customers } = Route.useLoaderData();
  return (
    <div>
      <PageHeader
        eyebrow="Hóa đơn"
        title="Tạo hóa đơn nháp"
        description="Chọn khách hàng, thêm dòng hàng. Hệ thống tự tính thuế và thành tiền."
      />
      <InvoiceForm
        customers={customers}
        products={lookups.products}
        taxRates={lookups.taxRates}
        series={lookups.series}
      />
    </div>
  );
}
