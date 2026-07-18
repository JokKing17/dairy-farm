import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { requireSession } from "@/lib/auth";
import { getCustomerStatement } from "@/lib/customer-statement";
import { formatMilli, formatPKR, integerToBigInt } from "@/lib/money";

const safe = (value: string) => value.replaceAll('"', '""');

type OtherProductSnapshot = Record<string, unknown>;

function formatOtherProducts(row: { otherProducts?: OtherProductSnapshot[] } & Record<string, unknown>) {
  const items = Array.isArray(row.otherProducts) ? row.otherProducts : [];
  if (!items.length) return "";
  return items
    .map((item) => {
      if (item.sku === "EGG-001") {
        const quantity = integerToBigInt(item.enteredQuantity ?? 0) || integerToBigInt(item.quantityMilli ?? 0) / 1000n;
        const unit = String(item.enteredUnit ?? "piece");
        return `${quantity} ${unit}${quantity === 1n ? "" : "s"}`;
      }
      return `${formatMilli(integerToBigInt(item.quantityMilli))} ${String(item.sku)}`;
    })
    .join("; ");
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession(["owner", "manager", "accountant"]);
  const { id } = await params;
  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const format = url.searchParams.get("format") ?? "csv";
  const statement = await getCustomerStatement(id, month);
  const filename = `${String(statement.customer.code)}-${month}-statement`;
  const rows = statement.deliveries.map((row) => [
    String(row.businessDate),
    String(row.deliveryStatus),
    formatMilli(integerToBigInt(row.milkQuantityMilli)),
    formatPKR(integerToBigInt(row.milkAmountPaisa)),
    formatOtherProducts(row),
    formatPKR(integerToBigInt(row.otherAmountPaisa)),
    formatPKR(integerToBigInt(row.amountPaisa)),
  ]);

  if (format === "csv") {
    const csv = [
      ["Date", "Status", "Milk liters", "Milk charge", "Other products detail", "Other products", "Total"],
      ...rows,
      ["Previous balance", "", "", formatPKR(statement.previousBalance), "", "", ""],
      ["Payments", "", "", formatPKR(statement.payments), "", "", ""],
      ["Remaining balance", "", "", formatPKR(statement.remainingBalance), "", "", ""],
    ]
      .map((row) => row.map((value) => `"${safe(String(value))}"`).join(","))
      .join("\r\n");
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Statement");
    sheet.addRow(["Customer", String(statement.customer.name)]);
    sheet.addRow(["Month", month]);
    sheet.addRow([]);
    sheet.addRow(["Date", "Status", "Milk liters", "Milk charge", "Other products detail", "Other products", "Total"]);
    rows.forEach((row) => sheet.addRow(row));
    sheet.addRow([]);
    sheet.addRow(["Previous balance", formatPKR(statement.previousBalance)]);
    sheet.addRow(["Current charges", formatPKR(statement.currentCharges)]);
    sheet.addRow(["Payments", formatPKR(statement.payments)]);
    sheet.addRow(["Remaining balance", formatPKR(statement.remainingBalance)]);
    sheet.columns.forEach((column) => {
      column.width = 20;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const page = document.addPage([595, 842]);
    let y = 800;
    const draw = (text: string, size = 10, strong = false) => {
      page.drawText(text, { x: 42, y, size, font: strong ? bold : font });
      y -= size + 8;
    };
    draw("DairyFlow Customer Statement", 18, true);
    draw(`${String(statement.customer.name)} - ${month}`, 13, true);
    draw(`Previous balance: ${formatPKR(statement.previousBalance)}`);
    draw(`Current charges: ${formatPKR(statement.currentCharges)}`);
    draw(`Payments received: ${formatPKR(statement.payments)}`);
    draw(`Remaining balance: ${formatPKR(statement.remainingBalance)}`, 12, true);
    y -= 10;
    draw("Daily deliveries", 12, true);
    for (const row of rows) {
      if (y < 50) break;
      draw(`${row[0]} | ${row[1]} | ${row[2]} L | ${row[4] || row[5]} | ${row[6]}`, 9);
    }
    const bytes = await document.save();
    const body = new Uint8Array(bytes).buffer;
    return new Response(body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }

  return Response.json({ error: "Unsupported export format" }, { status: 400 });
}
