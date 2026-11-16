import type { CSSProperties } from "react";
import { dealershipInvoiceBrand } from "@/modules/finance/dealership-invoice-branding";

type Props = {
  name: string;
  billingAddress: string;
  phone: string;
  contacts: { name: string; email: string; phone: string; purpose: string }[];
};

/** Bill-to identity. Billing data always comes from the retained snapshot; the profile only adds imagery. */
export function InvoiceCustomerBrand({ name, billingAddress, phone, contacts }: Props) {
  const brand = dealershipInvoiceBrand(name);
  const style = {
    color: "#343b3f",
    "--bt-accent": brand?.accent ?? "#0078bd",
    "--bt-heading": brand?.heading ?? "#00345b",
    "--bt-tint": brand?.tint ?? "#f5f8fb",
  } as CSSProperties;
  return (
    <div className="billto" style={style} data-testid="billto-customer">
      <div className="billto-main">
        <span className="billto-label">Bill to · Customer</span>
        {brand && (
          <div className="billto-logo" style={{ background: brand.logoBackground }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brand.logo}
              alt={`${brand.displayName} logo`}
              data-testid="img-dealership-logo"
            />
          </div>
        )}
        <h3 className="billto-name" data-testid="text-billto-name">
          {name}
        </h3>
        <p className="billto-address">{billingAddress}</p>
        {phone && <p className="billto-address">{phone}</p>}
        {brand && (
          <a className="billto-site" href={brand.website} target="_blank" rel="noopener noreferrer">
            {brand.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </a>
        )}
      </div>
      {contacts.length > 0 && (
        <ul className="billto-contacts">
          {contacts.map((c, n) => (
            <li key={n}>
              <strong>{c.name}</strong>
              <span>{[c.purpose, c.email, c.phone].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="billto-issuer">Issued by Quick Pass Emissions</p>
    </div>
  );
}
