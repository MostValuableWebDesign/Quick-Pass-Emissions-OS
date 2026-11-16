/** Reviewed official-site branding. Never fetch a website while generating an invoice. */
export type DealershipInvoiceBrand = {
  id: string;
  displayName: string;
  website: string;
  accent: string;
  heading: string;
  tint: string;
  logo: string;
  logoBackground: string;
  aliases: readonly string[];
};

export const dealershipInvoiceBrands: readonly DealershipInvoiceBrand[] = [
  {
    id: "turn-and-burn",
    displayName: "Turn & Burn Motors",
    website: "https://turnandburnmotors.com/",
    accent: "#DE0303",
    heading: "#0F141E",
    tint: "#FFF4F3",
    logo: "/images/invoice-dealerships/turn-and-burn.png",
    logoBackground: "#FFFFFF",
    aliases: ["Turn & Burn Motors", "Turn and Burn Motors", "Turn & Burn", "Turn and Burn"],
  },
  {
    id: "conyers-nissan",
    displayName: "Conyers Nissan",
    website: "https://www.conyersnissan.com/",
    accent: "#C3002F",
    heading: "#191919",
    tint: "#FFF4F6",
    logo: "/images/invoice-dealerships/conyers-nissan.png",
    logoBackground: "#FFFFFF",
    aliases: ["Conyers Nissan", "Nissan of Conyers"],
  },
  {
    id: "byrider-conyers",
    displayName: "Byrider Conyers",
    website: "https://www.byriderconyers.com/",
    accent: "#205FAB",
    heading: "#002855",
    tint: "#F0F6FC",
    logo: "/images/invoice-dealerships/byrider-conyers.png",
    logoBackground: "#FFFFFF",
    aliases: [
      "Byrider Conyers",
      "Byrider",
      "JD Byrider Conyers",
      "J D Byrider Conyers",
      "JD Byrider",
      "J D Byrider",
    ],
  },
  {
    id: "apex-autos",
    displayName: "Apex Autos",
    website: "https://www.apexautosatl.com/",
    accent: "#C09F55",
    heading: "#002F60",
    tint: "#FAF7F0",
    logo: "/images/invoice-dealerships/apex-autos.png",
    logoBackground: "#0E1D2C",
    aliases: ["Apex Autos", "Apex Autos ATL", "Apex Autos Atlanta"],
  },
  {
    id: "top-deals",
    displayName: "Top Deals Automotive",
    website: "https://www.topdealsautomotive.com/",
    accent: "#B58E4B",
    heading: "#262626",
    tint: "#FAF7F1",
    logo: "/images/invoice-dealerships/top-deals.png",
    logoBackground: "#000000",
    aliases: ["Top Deals Automotive", "Top Deals Auto", "Top Deals"],
  },
];

function normalizedName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/(?:\s+(?:llc|inc|incorporated|ltd|corporation|corp))+$/, "")
    .trim();
}

/** Exact, normalized known names only: no fuzzy matching against unrelated dealers or notes. */
export function dealershipInvoiceBrand(name: string): DealershipInvoiceBrand | null {
  const normalized = normalizedName(name);
  return (
    dealershipInvoiceBrands.find((brand) =>
      brand.aliases.some((alias) => normalizedName(alias) === normalized),
    ) ?? null
  );
}
