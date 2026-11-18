---
name: Low-volume staffing alerts
description: Owner-authorized 2 PM paid-test threshold and delivery scope.
---

Check at 2:00 PM local Eastern time on configured business operating days,
respecting closures. At 50 or fewer paid tests, notify the owner to consider
sending the designated employee home to reduce costs.

**Why:** The user requested a staffing-cost alert and explicitly selected local
Eastern time and configured business operating days.

**How to apply:** Reuse Performance's paid Pass/Fail estimate and 30-day free-retest
exclusions. This is an owner recommendation, never an automatic personnel or pay
change. Require fresh, complete source data and test-time evidence for the cutoff;
missing or stale data is not zero. The request narrowly authorizes the bounded
unattended read needed for this check, not general portal polling or purchases.

The user requested in-app, email, SMS and a phone call, but dismissed the Twilio
connection and instructed continuation without it.

**Why:** Multi-channel alerts were requested, but phone-provider setup was not completed.

**How to apply:** Do not claim SMS or calls work without a connected provider.
Recurring email must use the owner-saved recipient and enabled policy. No live
messages should be sent just to test the implementation. A saved policy or open
preview is not proof of an independently scheduled check.
