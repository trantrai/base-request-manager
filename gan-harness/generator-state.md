# Generator State — Iteration 001 (Sprint 1)

> ECC gan-generator · 15/10/2026 · Đã cập nhật spec theo 3 quyết định chốt của anh Trải
> (email Sprint 3, chạy trên Windows, Phase 1 gồm write-back "duyệt từng dòng, áp dụng từng đợt").

## What Was Built (app/ — Next.js 15 + SQLite)

**Lib (TDD, 27 unit tests pass, tsc clean):**
- `lib/normalize.ts` — Status Normalization Engine (STATUS_MAP versioned, tách suffix khỏi key_row, lọc dòng rác)
- `lib/syncEngine.ts` + `lib/sync.ts` — transform dòng sheet → UnifiedLine (đọc header động, unique key = tab+key_row+sheet_row)
- `lib/sheets.ts` — Google Sheets API trực tiếp (API key / service account JWT, không dùng hatch_gws_cli)
- `lib/writeback.ts` — validate batch (write_mode, confirm, range, field allowlist) + preview diff
- `lib/approvals.ts` — auto-detect ứng viên dọn dẹp, apply batch (resolve dòng thật bằng MATCH cột A), rollback theo đợt, apply_log
- `lib/csv.ts` — export RFC 4180 + UTF-8 BOM · `lib/mail.ts` — nodemailer (SMTP trong Settings)

**API routes (19):** overview, pending, requests/[id], search, export, sync/status,
sync/trigger, status-map, approvals (+detect), writeback/{preview,apply,rollback/[batchId],apply-log},
settings (+test-mail).

**UI (tiếng Việt, palette navy/gold/coral, Fluent):** Tổng quan (KPI click-through),
Bảng triage (filter + phân trang + export CSV), Request drill-down xuyên tab,
Phê duyệt & Áp dụng (checkbox từng dòng → preview → DONG Y → apply → lịch sử + rollback),
Trạng thái đồng bộ (sync runs + bảng status_map công khai), Cài đặt
(Sheets credential, SMTP, toggle write-back có xác nhận), Topbar Ctrl+K + badge CHỈ ĐỌC/GHI CÓ KIỂM SOÁT.

**Seed:** `scripts/seed.mjs` nạp snapshot 15/10/2026 → 111.470 dòng, **1.256 pending** (khớp phân tích).

## Verified
- `npm test`: 27/27 pass · `tsc --noEmit`: clean · `next build`: success (standalone)
- Smoke test: /api/overview (111470/1256), / (200), auto-detect → 123 ứng viên (89+34),
  approve 2 dòng → preview đúng diff → apply ở read-only → **403** (guard đúng)
- Review theo chuẩn ECC: fix 1 bug regex placeholder `{row}` trong validate batch (self-review code-reviewer/security-reviewer cho phần credential + write-back: secrets qua Settings/DB, không hardcode; SQL parameterized; React escape mặc định)

## Known Issues / Sprint 2+
- Chưa có Playwright E2E (sandbox không có browser) — viết tay khi deploy Windows
- Chưa có cron 20' trong app (dùng Task Scheduler Windows gọi `POST /api/sync/trigger` hoặc bấm tay)
- Email trigger tự động: lib + test-mail xong, auto-trigger vào Sprint 3
- Chưa test `next start` standalone trên Windows thật (chỉ build thành công trên Linux)
- DB 60MB (payload giữ full cột) — cân nhắc trim nếu zip quá nặng

## Dev Server
- Build: `npx next build` → `.next/standalone/server.js`
- Chạy Windows: `start.bat` hoặc `node .next/standalone/server.js` (port 3000)
