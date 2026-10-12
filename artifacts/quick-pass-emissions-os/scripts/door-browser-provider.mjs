// Test-process preload only. No production module imports this file or changes its API origin.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertOwnedDatabase } from "./e2e-safety.mjs";
assertOwnedDatabase(process.env);
if (
  process.env.E2E_DOOR_CONNECTED_ONLY !== "1" ||
  !process.env.E2E_PRIVATE_DIR ||
  process.env.SEAM_API_KEY !== "synthetic-door-provider-only"
)
  throw new Error("Synthetic door transport requires the explicit owned browser run.");
const fixture = path.join(process.env.E2E_PRIVATE_DIR, "door-provider.json");
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  if (url.origin !== "https://connect.getseam.com") return original(input, init);
  const state = JSON.parse(readFileSync(fixture, "utf8"));
  const save = () => writeFileSync(fixture, JSON.stringify(state), { mode: 0o600 });
  if (url.pathname === "/devices/get")
    return Response.json({
      device: {
        device_id: state.deviceId,
        connected_account_id: state.accountId,
        device_type: "schlage_lock",
        is_managed: true,
        can_program_online_access_codes: true,
        properties: {
          online: true,
          locked: true,
          battery: { level: 0.9 },
          schlage_metadata: { model: "BE489WB" },
          supported_code_lengths: [6],
        },
      },
    });
  if (url.pathname === "/access_codes/list")
    return Response.json({ access_codes: state.codes, pagination: { has_next_page: false } });
  if (url.pathname === "/access_codes/create") {
    const p = JSON.parse(init.body),
      code = {
        access_code_id: randomUUID(),
        device_id: state.deviceId,
        name: p.name,
        code: p.code,
        status: "setting",
        is_managed: true,
        starts_at: p.starts_at ?? null,
        ends_at: p.ends_at ?? null,
        is_scheduled_on_device: !!p.starts_at,
        errors: [],
        warnings: [],
        pending_mutations: [],
      };
    state.codes.push({ ...code, status: "set" });
    save();
    return Response.json({ access_code: code });
  }
  if (url.pathname === "/access_codes/delete" && init.method === "DELETE") {
    const id = url.searchParams.get("access_code_id");
    state.codes = state.codes.filter((c) => c.access_code_id !== id);
    state.events.push({
      device_id: state.deviceId,
      access_code_id: id,
      event_type: "access_code.removed_from_device",
      occurred_at: new Date().toISOString(),
    });
    save();
    return Response.json({});
  }
  if (url.pathname === "/events/list") return Response.json({ events: state.events });
  throw new Error("Unsupported synthetic door request; live provider access denied.");
};
