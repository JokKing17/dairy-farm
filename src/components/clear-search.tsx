"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function ClearSearch({ label = "Clear search" }: { label?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  params.delete("q");
  const href = params.size ? `${pathname}?${params}` : pathname;
  return <Link className="button ghost clear-search" href={href}>{label}</Link>;
}
