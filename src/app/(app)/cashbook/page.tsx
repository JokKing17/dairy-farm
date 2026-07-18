import { DatabaseModulePage } from "@/components/database-module-page";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{from?:string;to?:string;q?:string}> }) {
  const { from, to, q } = await searchParams;
  return <DatabaseModulePage title="Cashbook" description="Every receipt and payment linked to its source transaction." collection="cashbook_entries" columns={[["Transaction","transactionNo"],["Date","businessDate"],["Account","account"],["Direction","direction"],["Amount","amountPaisa"],["Description","description"]]} from={from} to={to} q={q}/>;
}
