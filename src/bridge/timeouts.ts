// src/bridge/timeouts.ts
// Bridge timeout configuration, resolved from the environment with sensible
// defaults. Centralizes the values that were previously hard-coded magic
// numbers in websocket-server.ts.
//
//   PHOTOPEA_MCP_TIMEOUT_MS         per-script execution timeout (default 30000)
//   PHOTOPEA_MCP_EXPORT_TIMEOUT_MS  export/file timeout          (default 60000)
//   PHOTOPEA_MCP_READY_TIMEOUT_MS   Photopea ready timeout       (default 60000)
//   PHOTOPEA_MCP_LAYOUT_SETTLE_MS   text-layout settle window    (default 5000)
//   PHOTOPEA_MCP_LAYOUT_POLL_MS     layout settle poll interval  (default 120)

export interface BridgeTimeouts {
  DEFAULT_TIMEOUT_MS: number;
  EXPORT_TIMEOUT_MS: number;
  READY_TIMEOUT_MS: number;
  LAYOUT_SETTLE_TIMEOUT_MS: number;
  LAYOUT_POLL_INTERVAL_MS: number;
}

function num(env: NodeJS.ProcessEnv, name: string, def: number): number {
  const v = Number(env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

export function resolveTimeouts(env: NodeJS.ProcessEnv = process.env): BridgeTimeouts {
  return {
    DEFAULT_TIMEOUT_MS: num(env, "PHOTOPEA_MCP_TIMEOUT_MS", 30_000),
    EXPORT_TIMEOUT_MS: num(env, "PHOTOPEA_MCP_EXPORT_TIMEOUT_MS", 60_000),
    READY_TIMEOUT_MS: num(env, "PHOTOPEA_MCP_READY_TIMEOUT_MS", 60_000),
    LAYOUT_SETTLE_TIMEOUT_MS: num(env, "PHOTOPEA_MCP_LAYOUT_SETTLE_MS", 5_000),
    LAYOUT_POLL_INTERVAL_MS: num(env, "PHOTOPEA_MCP_LAYOUT_POLL_MS", 120),
  };
}

export const TIMEOUTS: BridgeTimeouts = resolveTimeouts();
