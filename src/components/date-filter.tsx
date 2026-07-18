"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, Suspense } from "react";
import { detectPreset, presetDateRange, toDateString, type DatePreset } from "@/lib/date-utils";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 Days" },
  { value: "lastMonth", label: "Last Month" },
  { value: "lastYear", label: "Last Year" },
  { value: "custom", label: "Custom Range" },
];

function DateFilterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlFrom = searchParams.get("from") ?? undefined;
  const urlTo = searchParams.get("to") ?? undefined;

  const detectedPreset = useMemo(() => detectPreset(urlFrom, urlTo), [urlFrom, urlTo]);
  const [customFrom, setCustomFrom] = useState(urlFrom ?? "");
  const [customTo, setCustomTo] = useState(urlTo ?? "");

  const isCustom = detectedPreset === "custom" || (!detectedPreset && (urlFrom || urlTo));

  const navigate = useCallback(
    (from: string, to: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", from);
      params.set("to", to);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handlePresetChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const preset = event.target.value as DatePreset;
      if (preset === "custom") {
        const today = toDateString(new Date());
        setCustomFrom(today);
        setCustomTo(today);
        navigate(today, today);
      } else {
        const range = presetDateRange(preset);
        navigate(range.from, range.to);
      }
    },
    [navigate],
  );

  const handleCustomApply = useCallback(() => {
    if (customFrom && customTo) {
      navigate(customFrom < customTo ? customFrom : customTo, customFrom < customTo ? customTo : customFrom);
    }
  }, [customFrom, customTo, navigate]);

  const presetValue = isCustom ? "custom" : (detectedPreset ?? "today");
  const displayLabel = !urlFrom && !urlTo ? "Today" : PRESETS.find((p) => p.value === presetValue)?.label ?? "Custom Range";

  return (
    <div className="date-filter" data-testid="date-filter">
      <select className="date-filter-select" value={presetValue} onChange={handlePresetChange} aria-label="Date range">
        {!urlFrom && !urlTo ? <option value="">{displayLabel}</option> : null}
        {PRESETS.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      {isCustom ? (
        <div className="date-filter-custom">
          <input type="date" value={customFrom || urlFrom || ""} onChange={(e) => setCustomFrom(e.target.value)} aria-label="From date" />
          <span className="date-filter-sep">to</span>
          <input type="date" value={customTo || urlTo || ""} onChange={(e) => setCustomTo(e.target.value)} aria-label="To date" />
          <button type="button" className="button" onClick={handleCustomApply} disabled={!customFrom || !customTo}>
            Apply
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function DateFilter() {
  return (
    <Suspense fallback={<div className="date-filter"><select disabled aria-label="Date range"><option>Today</option></select></div>}>
      <DateFilterInner />
    </Suspense>
  );
}
