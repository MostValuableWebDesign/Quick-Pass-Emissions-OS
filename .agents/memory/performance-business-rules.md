---
name: Performance business rules
description: Owner-confirmed revenue, daily commission and five-shift assumptions for the simplified Performance dashboard.
---

Performance revenue is estimated at $20 per Pass/Fail; aborts are excluded. Shop daily volume, not an employee's personal count, determines commission: each working emissions employee receives $1 for every shop test above 50 that day. Apply the threshold separately per day when summing a range.

**Why:** The user explicitly gave 95 shop vehicles as $45 commission for each employee and selected Pass/Fail-only revenue. Report outcomes do not establish collected payments.

**How to apply:** Employee filtering may narrow personal tests/revenue/pay, but must never change the underlying shop-wide commission threshold. Keep these projections separate from reviewed identities and frozen/approved payroll.

The same VIN occurring within 30 days is a free retest and must not count as a car. A repeat VIN occurring more than 30 days later is a paid retest and must count as a car.

**Why:** The user supplied this VIN/date rule, superseding the earlier assumption that all retests are free and require reading the individual VIR.

**How to apply:** Compare the latest source occurrence across all inspectors, including earlier free inspections. Include the preceding 30 calendar days when classifying a selected date or range; missing historical coverage is not proof that a VIN has no qualifying earlier test. Exclude free retests from car and paying-test totals, not paid retests.

Performance commission projections use counted shop vehicles after free retests are excluded. Free-only inspections still establish a working day for base pay; do not remove attendance evidence or alter approved payroll.

**Why:** The commission threshold is based on shop car count, while performing a free inspection still represents employee work. The user approved applying the VIN rule to Performance, not rewriting approved wages or financial history.

**How to apply:** Preserve the distinction between physical inspections, counted cars and source-confirmed working days.

Monday–Saturday are available workdays, while emissions staff normally work five ten-hour shifts. Individual days off were not specified; some actual hours vary.

**Why:** The user selected all six available weekdays but separately confirmed five ten-hour workdays. Automatically assigning all six would overstate base pay.

**How to apply:** Do not guess a day off or automatically add a sixth paid shift. A source-confirmed working day may use the standard ten-hour shift as a clearly marked base-pay estimate when no actual hours are recorded; actual hours/base overrides take precedence. Without a confirmed schedule or work evidence, keep the period total unknown but display the configured daily/weekly rate. Store named compensation details only in application configuration, not agent memory.

Emissions testing is closed on Sundays. On the business dashboard, show that status only when the current America/New_York business date is Sunday; do not show it on open days.

**Why:** The user confirmed the Sunday closure and asked for a dashboard notice only while emissions is closed.

**How to apply:** Base the notice on the normalized business date, not the server’s local timezone, and keep the closure notice absent on other days.

**Why this estimate is allowed:** The user clarified that the approximate weekly base should be divided across five working days, rather than displayed as a missing rate. Working-day evidence permits an estimate, not a claim of verified hours or approved payroll.

Performance should be professional and quick to read, with automatic current counts, cached historical days, week/month graphs, date/range selection, employee filters and summed pay, without instructional panels.

**Why:** The user explicitly requested this visual and functional scope.

**How to apply:** Preserve aggregate/report and financial evidence boundaries with concise labels, not lengthy dashboard instructions. Employee login emails are not prerequisites for station counts or separate pay estimates.

All headline panels must reflect the selected day or range, including cars, outcomes, revenue and pay. Today is the default selection, not a separate persistent headline when another date is selected.

**Why:** The user explicitly clarified that only the selected date's figures should appear in the panel; a simultaneous today count was misleading.

**How to apply:** Keep the panel date label and every metric on the same selection and employee filter. Preserve daily shop-wide commission rules when summing a range.

Inspection speed must show average time per car for employee stats and the top headline, not the average gap between tests.

**Why:** The user explicitly corrected the interval statistic to average time per car. The provider export has minute-precision timestamps, not verified inspection start/end times, so this remains an estimate.

**How to apply:** Divide summed daily first-to-last testing windows by the cars in those windows. Employees use their own windows; the station uses one all-staff window each day so overlapping staff time is not double-counted. Never include overnight gaps. Label the estimate and coverage; daytime pauses remain included without inventing a cutoff.

The owner Business Dashboard’s daily car count, estimated test revenue and employee pay must match the Performance report for the same Eastern business date, including its paid/free retest rules and pay-plan estimates. Missing or incomplete report data stays unavailable, not zero; do not substitute receipts or approved-payroll totals.

**Why:** The user said Performance already reflects the right data and explicitly asked these dashboard figures to come from that same source.

**How to apply:** Reuse the Performance day summary and preserve its access controls, coverage and staleness warnings.

Employee pay overview is an informational employee view, without approval/configuration concepts or pay-adjustment controls.

**Why:** The user asked to remove instances/concepts of approvals and configuration from that overview and “just present the information for employees.”

**How to apply:** Keep pay setup and audit history separate; do not interpret this presentation change as authorization to change historical payroll or bypass financial controls.

Previously supplied compensation must populate matching Payroll employee records, not only the separate Performance estimator.

**Why:** The user repeated that base pay and commission had already been provided and asked to fill out the employees under Payroll & commissions.

**How to apply:** Reuse confirmed compensation for existing matching employees, preserve the shop-wide daily commission rule, and do not fabricate test counts, worked dates or payroll approvals. Missing roster entries require a separate decision rather than silently creating personnel.

Employee pay overview should use the same cached, free-retest-adjusted shop counts as Performance for projected daily and range commissions. Partial source coverage is not a complete payroll balance; historical payroll records remain intact even if their transaction list is hidden from this overview.

**Why:** The owner wants the overview's known commission values calculated for a chosen date or range without reviving approval and transaction-history panels.

**How to apply:** Keep estimated Performance-based amounts distinct from approved payroll. Sum the shop-wide threshold separately for each loaded day, identify gaps rather than assuming zero, and avoid deleting audit or payment records to simplify the page.

Payroll date selection needs a visible in-page calendar for both single days and two-click ranges; native date inputs alone were not usable for the owner.

**Why:** The owner repeatedly could not select a date despite native picker controls. Browser checks of the native-input flow failed repeatedly, while clicking dates in the in-page calendar passed the signed-in check.

**How to apply:** Keep month navigation and selectable day buttons, make an incomplete range obvious, and apply the chosen dates to the overview without relying on the browser's native date popup.

Vehicle-retention analysis uses completed visits and excludes explicitly classified free or paid retests. A short interval alone must not classify a retention visit as a retest. Unknown retest status is included provisionally and disclosed; payment evidence is not required and unknown payment never proves money collected.

**Why:** The owner requested evidence-based vehicle retention without inferring retests from timing or payment from VIRs. This is different from the owner's existing Performance revenue/payroll estimation rule and the older paid-initial returning-vehicle rate.

**How to apply:** Keep those definitions separate. Preserve the recorded-report summary, use validated VIN identities for new retention rates, show plate/state fallback separately, and disclose missing processing/coverage. Describe first observations as “First observed in available history,” not new customers.
