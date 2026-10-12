"use client";

import "@/components/performance-dashboard.css";
import { useState } from "react";
import type { DashboardData } from "@/modules/station/dashboard-types";
import { PayPlanDialog } from "./performance-dashboard-pay";

export function PayrollPaySetup({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial);
  return (
    <div className="pd payroll-pay-setup">
      <PayPlanDialog
        key={JSON.stringify(data.payPlan)}
        plan={data.payPlan}
        inspectors={data.inspectors}
        query={data.query}
        today={data.today}
        onSaved={(result) => {
          if (result.data) setData(result.data);
        }}
      />
    </div>
  );
}
