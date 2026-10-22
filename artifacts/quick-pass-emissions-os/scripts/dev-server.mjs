import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

/** Keep the managed service and Next on the same port, even without env injection. */
export function resolveDevPort(injectedPort, artifactToml) {
  let candidate = injectedPort?.trim();
  if (!candidate) {
    const service = artifactToml
      .split(/^\s*\[\[services\]\]\s*$/m)
      .slice(1)
      .find((block) => /^\s*name\s*=\s*"web"\s*$/m.test(block));
    candidate = service?.match(/^\s*localPort\s*=\s*(\d+)\s*$/m)?.[1];
  }
  if (!candidate || !/^\d+$/.test(candidate)) {
    throw new Error("Web startup requires PORT or the web service's declared localPort.");
  }
  const port = Number(candidate);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("The web service port must be an integer from 1 to 65535.");
  }
  return port;
}

function startDevServer() {
  const artifact = readFileSync(
    new URL("../.replit-artifact/artifact.toml", import.meta.url),
    "utf8",
  );
  const port = resolveDevPort(process.env.PORT, artifact);
  console.log(`Starting Quick Pass web service on port ${port}.`);
  const server = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "0.0.0.0",
      "--port",
      String(port),
    ],
    { stdio: "inherit", env: { ...process.env, PORT: String(port) } },
  );
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => server.kill(signal));
  }
  server.on("error", (error) => {
    console.error("Could not launch the web service:", error.message);
    process.exitCode = 1;
  });
  server.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDevServer();
}
