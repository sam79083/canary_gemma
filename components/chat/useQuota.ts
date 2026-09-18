"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchQuota } from "@/lib/api";
import type { TFn } from "@/lib/i18n";

/** SerpAPI quota line under the composer (best-effort, never blocks). */
export function useQuota(t: TFn) {
  const [quota, setQuota] = useState(t("chQuotaCheck"));
  const [quotaLow, setQuotaLow] = useState(false);

  const loadQuota = useCallback(async () => {
    try {
      const data = await fetchQuota();
      if (data.error) throw new Error(data.error);
      const left = data.total_searches_left ?? data.plan_searches_left;
      setQuota(
        `🔍 ${left} / ${data.searches_per_month} searches left (${data.plan_name || "plan"}, renews ${data.plan_renewal_date || "?"})`,
      );
      setQuotaLow(typeof left === "number" && left < 25);
    } catch (e) {
      setQuota("🔍 Quota unavailable");
      console.warn("[quota] failed:", e);
    }
  }, []);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  return { quota, quotaLow, loadQuota };
}
