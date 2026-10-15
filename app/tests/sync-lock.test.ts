// M7: lock chống 2 sync chạy đồng thời.
import { describe, it, expect } from "vitest";
import { checkSyncLock, SyncConflictError } from "../src/lib/queries";
import { getDb } from "../src/lib/db";
import { useTempDb } from "./helpers";

useTempDb();

describe("checkSyncLock (M7)", () => {
  it("cho chạy khi không có sync nào", () => {
    expect(() => checkSyncLock()).not.toThrow();
  });
  it("ném SyncConflictError khi có sync running trong 30 phút", () => {
    getDb().prepare("INSERT INTO sync_runs(status, started_at) VALUES ('running', datetime('now'))").run();
    expect(() => checkSyncLock()).toThrow(SyncConflictError);
  });
  it("run running quá 30 phút -> đánh dấu stale và cho chạy tiếp", () => {
    getDb().prepare("INSERT INTO sync_runs(status, started_at) VALUES ('running', datetime('now','-60 minutes'))").run();
    expect(() => checkSyncLock()).not.toThrow();
    const row = getDb().prepare("SELECT status FROM sync_runs").get() as { status: string };
    expect(row.status).toBe("stale");
  });
  it("sync đã done không chặn", () => {
    getDb().prepare("INSERT INTO sync_runs(status, started_at) VALUES ('done', datetime('now'))").run();
    expect(() => checkSyncLock()).not.toThrow();
  });
});
