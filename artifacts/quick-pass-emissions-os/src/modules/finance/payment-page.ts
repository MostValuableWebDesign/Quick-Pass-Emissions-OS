// Also enforced in the document because framework/proxy response headers can override route headers.
const documentPolicy =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://invoice.stripe.com; base-uri 'none'";
export const paymentPageHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": `${documentPolicy}; frame-ancestors 'none'`,
};
export function paymentPage(available: boolean, retry = false) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${documentPolicy}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quick Pass Emissions — Invoice payment</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#f1f6f3;color:#18392b;margin:0;padding:48px 20px}main{max-width:480px;background:white;margin:8vh auto;padding:32px;border-radius:20px;box-shadow:0 8px 32px #18392b12}h1{font-size:25px}button{font:inherit;border:0;border-radius:10px;background:#246438;color:white;padding:12px 20px;cursor:pointer}a{color:#246438}</style>
<main><strong>Quick Pass Emissions</strong><h1>${available ? "Pay your invoice securely" : "Payment link unavailable"}</h1><p>${
    available
      ? retry
        ? "The payment page could not be opened yet. Please wait a moment, then try again. No payment was recorded."
        : "Continue to Stripe to review and pay the current unpaid balance. Your card details are handled by Stripe."
      : "This invoice may be paid, archived, not yet sent, or unavailable for online payment. Please contact Quick Pass Emissions."
  }</p>${
    available
      ? '<form method="post"><button type="submit">Continue to secure payment</button></form>'
      : ""
  }<p><a href="mailto:qpemissions@gmail.com">qpemissions@gmail.com</a></p></main></html>`;
}
