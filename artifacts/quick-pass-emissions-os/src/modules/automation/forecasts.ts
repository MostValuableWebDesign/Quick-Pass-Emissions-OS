import { addDays } from "@/lib/time";
import { type Tx } from "../phase2";
import { depletion } from "./rules";
import { sumCents } from "../finance/rules";
export async function forecasts(tx: Tx, today: string) {
  const policies = await tx.forecastPolicy.findMany({ orderBy: { revision: "desc" } });
  const policy = (key: string) => policies.find((p) => p.key === key);
  const stock = await tx.certificateStock.findUnique({ where: { id: "certificates" } });
  const settings = await tx.certificateSetting.findUnique({ where: { id: "certificates" } });
  const cp = policy("certificates");
  const certificateConfig =
    cp ?? (settings ? { ...settings, minimumDays: settings.windowDays } : null);
  const result = [];
  if (certificateConfig) {
    const start = [stock?.openingDate ?? today, addDays(today, 1 - certificateConfig.windowDays)]
      .sort()
      .at(-1)!;
    const movements = await tx.certificateMovement.findMany({
      where: {
        date: { gte: start, lte: today },
        kind: { in: ["USAGE", "VOID"] },
      },
    });
    result.push({
      key: "certificates",
      name: "Certificates",
      unit: "ITEM",
      configured: !!cp,
      ...depletion({
        today,
        openingDate: stock?.openingDate ?? null,
        balance: stock?.balance ?? null,
        ...certificateConfig,
        threshold: cp?.threshold ?? settings!.reorderPoint,
        used: sumCents(movements.map((m) => -m.delta)),
      }),
      lastPhysicalCountDate: stock?.reconciledDate ?? null,
      limits:
        "USAGE and consumed VOID certificates count as depletion. Physical reconciliations and receipts do not. Missing entries are not evidence of zero official usage; subsequent counts do not prove earlier completeness.",
    });
  } else
    result.push({
      key: "certificates",
      name: "Certificates",
      unit: "ITEM",
      configured: false,
      ...depletion({
        today,
        openingDate: stock?.openingDate ?? null,
        balance: stock?.balance ?? null,
        windowDays: 7,
        minimumDays: 7,
        used: 0,
        leadDays: 0,
        threshold: 0,
      }),
      state: "UNCONFIGURED",
      limits: "Owner must configure observation, minimum coverage and planning threshold.",
    });
  const chemicals = await tx.chemicalItem.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
  });
  for (const item of chemicals) {
    const p = policy(item.id);
    const opening = await tx.chemicalMovement.findFirst({
      where: { itemId: item.id, kind: "OPENING" },
      orderBy: { createdAt: "asc" },
    });
    const start = p
      ? [opening?.date ?? today, addDays(today, 1 - p.windowDays)].sort().at(-1)!
      : today;
    const movements = p
      ? await tx.chemicalMovement.findMany({
          where: {
            itemId: item.id,
            date: { gte: start, lte: today },
            kind: { in: ["USAGE", "DISPOSAL"] },
          },
        })
      : [];
    result.push({
      key: item.id,
      name: item.name,
      unit: item.unit,
      configured: !!p,
      ...depletion({
        today,
        openingDate: opening?.date ?? null,
        balance: item.balance,
        windowDays: p?.windowDays ?? 7,
        minimumDays: p?.minimumDays ?? 7,
        leadDays: p?.leadDays ?? 0,
        threshold: p?.threshold ?? item.reorderPoint,
        used: sumCents(movements.map((m) => -m.delta)),
      }),
      lastPhysicalCountDate:
        (
          await tx.chemicalMovement.findFirst({
            where: { itemId: item.id, kind: { in: ["OPENING", "RECONCILE"] } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          })
        )?.date ?? null,
      ...(!p ? { state: "UNCONFIGURED" } : {}),
      limits:
        "USAGE plus DISPOSAL measures physical depletion, not service demand. Receipts/count corrections excluded. No unit conversion; unrecorded days do not prove zero consumption.",
    });
  }
  return result;
}
