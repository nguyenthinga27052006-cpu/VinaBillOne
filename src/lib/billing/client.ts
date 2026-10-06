export function errMsg(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Không thể hoàn tất thao tác. Thử lại sau.";
}

export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function invoiceCode(series: string, number: string | null): string {
  if (!number) return "Nháp";
  return `${series}${number}`;
}
