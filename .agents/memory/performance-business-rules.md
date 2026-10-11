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
