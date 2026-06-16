// src/bridge/websocket-server.ts

import { createServer, type Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import type {
  ActivityMessage,
  BridgeResult,
  BridgeFileResult,
  ExecuteMessage,
  LoadMessage,
  PendingRequest,
} from "./types.js";
import { buildLayoutProbe } from "./script-builder.js";
import { launchSystemBrowser } from "../browser/system-launcher.js";
import type { BrowserHandle, BrowserLauncher } from "../browser/types.js";
import { TIMEOUTS } from "./timeouts.js";

const {
  DEFAULT_TIMEOUT_MS,
  EXPORT_TIMEOUT_MS,
  READY_TIMEOUT_MS,
  // Async text layout (first-use web-font load) settle window.
  LAYOUT_SETTLE_TIMEOUT_MS,
  LAYOUT_POLL_INTERVAL_MS,
} = TIMEOUTS;

export class PhotopeaBridge {
  public readonly httpServer: HttpServer;
  public readonly wss: WebSocketServer;
  private client: WebSocket | null = null;
  private ready: boolean = false;
  private queue: PendingRequest[] = [];
  private processing: boolean = false;
  private pendingScripts: Map<string, string> = new Map();
  private pendingLoads: Map<string, string> = new Map(); // id -> serialized LoadMessage JSON
  private port: number;
  private browserLaunched: boolean = false;
  private browserHandle: BrowserHandle | null = null;
  private launcher: BrowserLauncher;

  constructor(port: number, launcher: BrowserLauncher = launchSystemBrowser) {
    this.port = port;
    this.launcher = launcher;

    // Create bare HTTP server; route handling is added externally via the entry point
    this.httpServer = createServer();

    // Create WSS attached directly to the HTTP server (not noServer mode)
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on("connection", (ws: WebSocket) => {
      // Accept the newest connection; silently release the old one
      const prev = this.client;
      this.client = ws;

      if (prev && prev !== ws && prev.readyState === WebSocket.OPEN) {
        // Silently terminate without triggering our close handler logic
        prev.removeAllListeners();
        prev.terminate();
      }

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleClientMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        // Only reset state if THIS ws is still the active client
        if (this.client === ws) {
          this.client = null;
          this.ready = false;
          this.rejectAllPending(new Error("Photopea client disconnected"));
        }
      });

      ws.on("error", () => {
        // Error is followed by close; handled there
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  getHttpServer(): HttpServer {
    return this.httpServer;
  }

  getPort(): number {
    return this.port;
  }

  isReady(): boolean {
    return this.client !== null && this.ready;
  }

  /** Wait for the bridge to become ready (Photopea loaded + WS connected). Launches browser on first call. */
  waitForReady(): Promise<void> {
    if (this.isReady()) return Promise.resolve();

    // Lazy-launch browser on first tool call
    if (!this.browserLaunched) {
      this.browserLaunched = true;
      const url = `http://127.0.0.1:${this.port}`;
      console.error(`Launching browser: ${url}`);
      this.launcher(url)
        .then((handle) => {
          this.browserHandle = handle;
        })
        .catch((err: unknown) => {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`Could not auto-launch browser (${reason}). Please open ${url}`);
        });
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new Error(`Photopea did not become ready within ${READY_TIMEOUT_MS / 1000}s. Please open http://127.0.0.1:${this.port} and wait for Photopea to load.`));
      }, READY_TIMEOUT_MS);
      const check = () => {
        if (settled) return;
        if (this.isReady()) {
          clearTimeout(timer);
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, "127.0.0.1", () => resolve());
      this.httpServer.once("error", reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.rejectAllPending(new Error("Bridge stopped"));

      // Close all WebSocket connections
      for (const ws of this.wss.clients) {
        ws.terminate();
      }
      this.client = null;
      this.ready = false;

      // Close the owned browser (no-op for an external system browser)
      const handle = this.browserHandle;
      this.browserHandle = null;
      const closeBrowser = handle ? handle.close() : Promise.resolve();

      void closeBrowser.finally(() => {
        this.wss.close(() => {
          this.httpServer.close(() => resolve());
        });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Outgoing helpers
  // ---------------------------------------------------------------------------

  sendActivity(activity: ActivityMessage): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(activity));
    }
  }

  // ---------------------------------------------------------------------------
  // Script execution
  // ---------------------------------------------------------------------------

  async executeScript(
    script: string,
    expectFiles = false
  ): Promise<BridgeResult | BridgeFileResult> {
    try {
      await this.waitForReady();
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message };
    }
    if (!this.isReady()) {
      return Promise.resolve<BridgeResult>({
        success: false,
        data: null,
        error: "Photopea is not connected or not ready",
      });
    }

    return new Promise<BridgeResult | BridgeFileResult>((resolve, reject) => {
      const id = randomUUID();
      const timeoutMs = expectFiles ? EXPORT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

      const timer = setTimeout(() => {
        this.pendingScripts.delete(id);
        const wasActive = this.queue[0]?.id === id;
        this.queue = this.queue.filter((r) => r.id !== id);
        if (wasActive) this.processing = false;
        resolve({
          success: false,
          data: null,
          error: `Script execution timed out after ${timeoutMs / 1000}s`,
        });
        if (wasActive) this.processNext();
      }, timeoutMs);

      const pending: PendingRequest = { id, resolve, reject, expectFiles, timer };

      this.pendingScripts.set(id, script);
      this.queue.push(pending);
      this.processNext();
    });
  }

  /**
   * Wait until the active layer has a non-zero rendered size, or until the
   * settle timeout elapses. Text layers lay out asynchronously in Photopea
   * (the first use of a font triggers an async web-font load), so a freshly
   * created text layer reports bounds of [0,0,0,0] until layout completes.
   * Flattening/exporting before then drops the text. Best-effort: on timeout
   * or any probe error it simply returns so the caller can proceed.
   */
  async settleActiveLayer(
    timeoutMs: number = LAYOUT_SETTLE_TIMEOUT_MS
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const probe = buildLayoutProbe();
    while (Date.now() < deadline) {
      const result = await this.executeScript(probe);
      if (result.success && typeof result.data === "string") {
        try {
          const { w, h } = JSON.parse(result.data) as { w: number; h: number };
          if (w > 0 && h > 0) return;
        } catch {
          return; // unparseable probe output — stop waiting, let caller proceed
        }
      } else {
        return; // probe failed (e.g. no active layer) — nothing to wait for
      }
      await new Promise((r) => setTimeout(r, LAYOUT_POLL_INTERVAL_MS));
    }
  }

  // ---------------------------------------------------------------------------
  // File loading
  // ---------------------------------------------------------------------------

  async loadFile(data: Buffer, filename: string): Promise<BridgeResult> {
    try {
      await this.waitForReady();
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message };
    }
    if (!this.isReady()) {
      return { success: false, data: null, error: "Photopea is not connected or not ready" };
    }

    return new Promise<BridgeResult>((resolve) => {
      const id = randomUUID();
      const msg: LoadMessage = {
        id,
        type: "load",
        data: data.toString("base64"),
        filename,
      };

      const timer = setTimeout(() => {
        this.pendingLoads.delete(id);
        const wasActive = this.queue[0]?.id === id;
        this.queue = this.queue.filter((r) => r.id !== id);
        if (wasActive) this.processing = false;
        resolve({
          success: false,
          data: null,
          error: `loadFile timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`,
        });
        if (wasActive) this.processNext();
      }, DEFAULT_TIMEOUT_MS);

      // Store the serialized load message so processNext can send it when the queue is free
      this.pendingLoads.set(id, JSON.stringify(msg));

      const pending: PendingRequest = {
        id,
        resolve: resolve as (v: BridgeResult | BridgeFileResult) => void,
        reject: () => {},
        expectFiles: false,
        timer,
      };

      this.queue.push(pending);
      this.processNext();
    });
  }

  // ---------------------------------------------------------------------------
  // Internal queue processing
  // ---------------------------------------------------------------------------

  private processNext(): void {
    if (this.processing || this.queue.length === 0 || !this.client) {
      return;
    }

    const next = this.queue[0];

    // Check if this is a queued load message
    const loadMsg = this.pendingLoads.get(next.id);
    if (loadMsg) {
      this.pendingLoads.delete(next.id);
      this.processing = true;
      if (this.client.readyState === WebSocket.OPEN) {
        this.client.send(loadMsg);
      } else {
        // Client gone; resolve with error and continue
        clearTimeout(next.timer);
        this.queue.shift();
        this.processing = false;
        next.resolve({ success: false, data: null, error: "WebSocket not open" });
        this.processNext();
      }
      return;
    }

    const script = this.pendingScripts.get(next.id);

    if (script === undefined) {
      // Already handled (timeout/disconnect removed it)
      this.queue.shift();
      this.processNext();
      return;
    }

    this.processing = true;

    const msg: ExecuteMessage = {
      id: next.id,
      type: "execute",
      script,
      expectFiles: next.expectFiles,
    };

    if (this.client.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(msg));
    } else {
      // Client gone; resolve with error and continue
      clearTimeout(next.timer);
      this.queue.shift();
      this.pendingScripts.delete(next.id);
      this.processing = false;
      next.resolve({ success: false, data: null, error: "WebSocket not open" });
      this.processNext();
    }
  }

  // ---------------------------------------------------------------------------
  // Incoming message handler
  // ---------------------------------------------------------------------------

  private handleClientMessage(msg: Record<string, unknown>): void {
    if (msg.type === "status") {
      if (msg.status === "ready") {
        this.ready = true;
      }
      return;
    }

    if (msg.type === "result" || msg.type === "file") {
      const id = msg.id as string;
      const pendingIndex = this.queue.findIndex((r) => r.id === id);

      if (pendingIndex === -1) return; // Already resolved (e.g. timed out)

      const pending = this.queue[pendingIndex];
      clearTimeout(pending.timer);
      this.queue.splice(pendingIndex, 1);
      this.pendingScripts.delete(id);
      this.pendingLoads.delete(id);
      this.processing = false;

      if (msg.type === "file") {
        const result: BridgeFileResult = {
          success: (msg.success as boolean) ?? false,
          data: Buffer.from((msg.data as string) ?? "", "base64"),
          mimeType: (msg.mimeType as string) ?? "application/octet-stream",
          error: (msg.error as string | null) ?? null,
        };
        pending.resolve(result);
      } else {
        const result: BridgeResult = {
          success: (msg.success as boolean) ?? false,
          data: (msg.data as string | null) ?? null,
          error: (msg.error as string | null) ?? null,
        };
        pending.resolve(result);
      }

      this.processNext();
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private rejectAllPending(error: Error): void {
    const snapshot = [...this.queue];
    this.queue = [];
    this.processing = false;

    for (const pending of snapshot) {
      clearTimeout(pending.timer);
      this.pendingScripts.delete(pending.id);
      this.pendingLoads.delete(pending.id);
      // Resolve (not reject) with an error result so callers don't need try/catch
      pending.resolve({
        success: false,
        data: null,
        error: error.message,
      });
    }
  }
}
