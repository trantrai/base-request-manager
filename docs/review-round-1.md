# Review Round 1 — BaseScope (Sprint 1)

- **Ngày:** 15/10/2026 · **Người review:** team 4 agent ECC (code-reviewer → react-reviewer → security-reviewer → a11y-architect)
- **Phạm vi:** toàn bộ `~/workspace/base-request-manager/app/` (Next.js 15 + SQLite/better-sqlite3)
- **Kiểm thử nền:** `npx tsc --noEmit` ✅ sạch · `npm test` ✅ 27/27 pass
- **Nguyên tắc:** KHÔNG sửa code, chỉ review. Không phát hiện hardcoded secret trong source.

---

## 🔴 BLOCKER (phải fix trước khi dùng thật)

### B1. Server mở trên mọi network interface, API không có auth
- **File:** `start.bat:34` (`node .next\standalone\server.js`)
- **Mô tả:** Next.js standalone mặc định bind `0.0.0.0:3000`. Mọi API (kể cả `POST /api/settings` bật write-mode chỉ cần nhập "DONG Y", và `POST /api/writeback/apply`) đều không có authentication. Bất kỳ ai cùng mạng LAN cũng có thể bật chế độ ghi và ghi lên sheet chung của công ty.
- **Fix:** thêm `set HOSTNAME=127.0.0.1` trong `start.bat` trước dòng chạy server (chỉ nghe localhost).

---

## 🟠 MAJOR (nên fix trong round này)

### M1. Test email / gửi mail cảnh báo luôn thất bại — sai key settings
- **File:** `src/lib/mail.ts:17`
- **Mô tả:** `getSmtpConfig()` đọc `settings WHERE key='smtp'`, nhưng `PUT /api/settings` chỉ lưu các key riêng (`smtpHost`, `smtpPort`, …) và `__bundle__` — không bao giờ ghi key `'smtp'`. Kết quả: `getSmtpConfig()` luôn trả `null` → nút "Gửi email kiểm tra" luôn báo lỗi, và tính năng email cảnh báo Sprint 3 cũng sẽ hỏng theo.
- **Fix:** đọc từ các key riêng (`smtpHost`/`smtpPort`/`smtpUser`/`smtpPass`/`smtpFrom`) hoặc từ `__bundle__`.

### M2. Export CSV chỉ ra tối đa 200 dòng dù comment ghi 5000
- **File:** `src/app/api/export/route.ts:27`
- **Mô tả:** route truyền `pageSize: 200`, mà `getPending()` kẹp `Math.min(200, …)` → export không bao giờ vượt 200 dòng. User tưởng đã xuất hết nhưng thực tế thiếu dữ liệu.
- **Fix:** thêm tham số cho phép bypass giới hạn ở tầng query, hoặc viết query export riêng không qua `getPending()`.

### M3. Nút "Áp dụng" dùng tập checkbox hiện tại, không phải tập đã preview
- **File:** `src/app/phe-duyet/page.tsx:107` (`approvalIds: [...checked]`)
- **Mô tả:** user bấm "Xem trước thay đổi" cho 5 dòng, sau đó tích thêm/bỏ bớt checkbox rồi bấm "Áp dụng" → ghi lên Sheets tập dòng **khác** với preview đã duyệt.
- **Fix:** snapshot `approvalIds` vào state riêng ngay khi bấm "Xem trước", nút "Áp dụng" dùng snapshot đó.

### M4. API duyệt cho phép lật trạng thái `applied` → `approved` → ghi lại
- **File:** `src/app/api/approvals/route.ts:33`
- **Mô tả:** câu `UPDATE approvals SET state=? … WHERE id=?` không giới hạn trạng thái nguồn. Một dòng đã `applied` có thể bị chuyển về `approved` rồi apply lại → ghi trùng lên Sheets, phá vỡ audit trail.
- **Fix:** thêm `AND state='proposed'` vào WHERE; trả 409 nếu không còn ở trạng thái chờ duyệt.

### M5. Ghi "Done" không kiểm tra giá trị hiện tại trên ô (TOCTOU)
- **File:** `src/lib/approvals.ts:136`
- **Mô tả:** `applyBatch` resolve số dòng bằng MATCH key_row rồi ghi thẳng `newValue`, không đọc lại ô để đối chiếu `oldValue`. Sheet này còn được automation/base.vn ghi song song — nếu status bị đổi giữa lúc preview và apply, app sẽ ghi đè sai.
- **Fix:** trước `batchUpdate`, đọc ô status; nếu khác `oldValue` thì skip + ghi log `mismatch` thay vì ghi đè.

### M6. Credential lưu plaintext trong SQLite
- **File:** `src/app/api/settings/route.ts` (PUT), `src/lib/queries.ts` (`saveSetting`)
- **Mô tả:** `sheetsSaKey` (private key service account = toàn quyền ghi sheet công ty), `sheetsApiKey`, `smtpPass` lưu nguyên văn trong bảng `settings`. File DB 60MB dễ bị copy/backup phát tán.
- **Fix:** mã hóa AES-256-GCM bằng key máy (DPAPI trên Windows / key file ngoài repo, không commit); tối thiểu: cảnh báo trong UI + đảm bảo `*.db` không lọt vào zip/repo (hiện `.gitignore` đã chặn, nhưng zip tay vẫn có thể gồm nhầm).

### M7. Không có lock chống 2 lần sync chạy đồng thời
- **File:** `src/app/api/sync/trigger/route.ts:30`
- **Mô tả:** mỗi lần chạy đều `INSERT sync_runs(status='running')` rồi cuối cùng `DELETE FROM requests` + insert lại. Hai lần sync chồng nhau (bấm tay + Task Scheduler) → bảng `requests` trống tạm thời, `status_changes` trùng lặp.
- **Fix:** trước khi chạy, kiểm tra có `sync_runs` nào `status='running'` và chưa quá timeout (vd 30') thì từ chối 409.

---

## 🟡 MINOR (để sau được)

### Bảo mật & robustness
- **N1.** Chưa có kiểm tra Origin/Referer cho các POST (CSRF). Hiện tại các route chỉ parse JSON (`req.json()`) nên form CSRF thông thường đã bị chặn — thêm check Origin là defense-in-depth. File: các `route.ts` có POST.
- **N2.** `src/lib/sheets.ts` — các `fetch` tới Google không có timeout/AbortController; mạng treo → sync treo, `sync_runs` kẹt ở `running`. Thêm timeout 30s.
- **N3.** `src/lib/approvals.ts:136` — `applyBatch` gọi `batchUpdate` từng dòng (tối đa 200 call API). Gom thành 1 lần `batchUpdate` duy nhất cho cả đợt.
- **N4.** Các route trả `e.message` với 500 (`writeback/apply`, `rollback`, `test-mail`, `sync/trigger`) — có thể lộ chi tiết nội bộ (đoạn body lỗi từ Google). Nên log chi tiết server-side, trả message chung cho client.
- **N5.** CSV injection: `src/lib/csv.ts` — ô bắt đầu bằng `= + - @` (vd note từ Sheets) sẽ bị Excel thực thi công thức. Thêm tiền tố `'` hoặc luôn quote các ô đó.
- **N6.** `src/app/api/pending/route.ts:14-15` — `page`/`pageSize` NaN (vd `?page=abc`) → `Math.max(1, NaN)` = NaN → better-sqlite3 ném lỗi → 500. Validate số trước khi query.
- **N7.** `src/lib/queries.ts` (`searchGlobal`, `getPending`) — LIKE không escape `%`/`_`; tìm `"%"` sẽ match tất cả. Escape ký tự wildcard.

### React / UX
- **N8.** `src/app/phe-duyet/page.tsx` — `decideSelected` await tuần tự từng dòng (123 dòng = 123 request). Dùng `Promise.allSettled` theo batch.
- **N9.** `src/app/phe-duyet/page.tsx:36`, `src/app/triage/page.tsx:30` — `eslint-disable-next-line react-hooks/exhaustive-deps` không kèm lý do. Thêm comment giải thích hoặc đưa `load` vào `useCallback`.
- **N10.** `src/lib/api.ts:11` — `export const dynamic = "force-dynamic"` trong file lib không có tác dụng (chỉ áp dụng ở route). Xóa cho sạch.
- **N11.** `src/app/requests/[id]/page.tsx` — link `target="_blank"` dùng `rel="noreferrer"`; nên là `rel="noopener noreferrer"` theo chuẩn (dù browser hiện đại đã ngầm bao hàm).
- **N12.** `src/app/trang-thai/page.tsx` — text "Đồng bộ đọc 15 tab" nhưng `TAB_NAMES` (`src/lib/sync.ts`) chỉ có 13 tab (thiếu ITM_CHEK, NEW_MasterData_Item). Sửa text hoặc bổ sung tab.

### Accessibility (WCAG 2.2 AA)
- **N13.** Contrast chữ nhỏ dưới 4.5:1: `.chip-loi` (#e0522f trên nền nhạt ≈3.6:1), `.chip-da_go` (#8a94a6 ≈2.9:1), `.nav .sep` (#7e93b3 trên navy ≈4.3:1). Đậm màu chữ lên.
- **N14.** Checkbox trong bảng phê duyệt (`phe-duyet/page.tsx`) không có `aria-label` — screen reader không biết đang chọn dòng nào. Thêm `aria-label={mã hàng}`.
- **N15.** Palette tìm kiếm (`Topbar.tsx`): thiếu `role="dialog"`/`aria-modal`, các kết quả là `div onClick` không điều hướng được bằng bàn phím (chỉ Enter đi tới kết quả đầu). Thêm role, arrow-key navigation hoặc chuyển sang `<button>`.
- **N16.** Input tìm kiếm palette chỉ có placeholder, không có `<label>` — thêm `aria-label`.
- **N17.** `globals.css` — `.palette input:focus { outline: none }` xóa chỉ báo focus. Giữ lại outline hoặc thay bằng border rõ ràng.
- **N18.** Rollback dùng `window.confirm` — hoạt động nhưng kém với screen reader; cân nhắc dialog riêng (để Sprint sau).

### Điểm tốt (ghi nhận)
- Không có hardcoded secret; SQL 100% parameterized (better-sqlite3); không dùng `dangerouslySetInnerHTML`; React tự escape output.
- Guard read-only 2 lớp (route 403 + `validateWritebackBatch`) — test manual confirm 403 hoạt động; `confirmed: z.literal(true)`; `approvalIds` giới hạn 200; `buildWritebackItems` chỉ lấy `state='approved'`.
- Settings GET che secret bằng placeholder; PUT giữ secret cũ khi client gửi placeholder.
- Range write-back validate bằng regex + allowlist tab (`TAB_NAMES`) + allowlist field (`WRITABLE_FIELDS`); resolve số dòng bằng MATCH key_row lúc apply (không tin key_row cứng).
- `baseLink` validate `^https?://` trước khi render — chặn `javascript:` URL.
- `lang="vi"`, bảng có `<th>`, input text đều có `<label>`, focus style rõ cho input/select.

---

## VERDICT

| Mức | Số lượng |
|---|---|
| 🔴 Blocker | 1 |
| 🟠 Major | 7 |
| 🟡 Minor | 18 |

**PASS WITH FIXES** — app chạy đúng các luồng chính, test/typecheck sạch, không có lỗ hổng không khắc phục được; nhưng phải fix Blocker (bind localhost) + 7 Major trước khi dùng thật với write-back, vì các lỗi này ảnh hưởng trực tiếp tới tính đúng đắn của dữ liệu ghi lên sheet chung và bảo mật credential.

---

## Kết quả fix round 1 (2026-10-15)

Toàn bộ **28/28 mục đã sửa xong** trên working tree (chưa commit/push theo yêu cầu). Thứ tự Blocker → Major → Minor.

### 🔴 BLOCKER — 2/2 fixed
- **B1 (postbuild copy `.next/static`)**: FIXED. Thêm `app/scripts/postbuild.mjs` (Node cross-platform, không lệnh Unix-only): copy `.next/static` → `.next/standalone/.next/static` và `public/` (nếu có). `package.json`: `"build": "next build && node scripts/postbuild.mjs"`. README cập nhật hướng dẫn. **Smoke test xác nhận: `/_next/static/css/*.css` trả 200, giao diện render đầy đủ (screenshot đối chứng).**
- **B2 (bind 0.0.0.0)**: FIXED. `app/start.bat` thêm `set HOSTNAME=127.0.0.1` trước khi chạy server.

### 🟠 MAJOR — 8/8 fixed
- **M1 (SMTP đọc key `smtp` không tồn tại)**: FIXED. `getSmtpConfig()` đọc từ key riêng `smtpHost/smtpPort/smtpUser/smtpFrom` + `getSecret("smtpPass")`. Test `tests/mail.test.ts` (3 tests).
- **M2 (export kẹp 200 dòng)**: FIXED. `getPending` thêm flag `unlimited` (trần 5000); route export truyền `pageSize: 5000, unlimited: true`. Smoke test: export 1 tab trả 659 dòng.
- **M3 (Áp dụng dùng checkbox hiện tại)**: FIXED. Snapshot `previewIds` lúc bấm "Xem trước"; nút Áp dụng chỉ dùng snapshot; đổi checkbox sau preview → hủy preview. Helper thuần `snapshotIds()` có test.
- **M4 (lật `applied`→`approved`)**: FIXED. `decideApproval()` dùng `UPDATE... WHERE id=? AND state='proposed'`; route map `ApprovalNotFoundError`→404, `ApprovalNotProposedError`→409. Test 5 cases (chặn applied→approved, 404 id lạ).
- **M5 (TOCTOU) + N3 (batch gộp)**: FIXED. `applyBatch()` đọc lại ô status qua `readStatus` trước khi ghi; mismatch → skip + log `apply_log` status `'mismatch'`; **1 `batchUpdate` duy nhất** cho cả đợt. Test mock sheets: 1 dòng match→applied, 1 dòng mismatch→skip, batchUpdate gọi đúng 1 lần.
- **M6 (credential plaintext)**: FIXED. Module mới `src/lib/secrets.ts` — AES-256-GCM, key máy 32 bytes ngoài repo (`%APPDATA%\BaseScope\machine.key` / `~/.config/basescope/machine.key`, override `BASESCOPE_KEY_FILE`), format `enc:v1:<iv>:<ct>:<tag>`; `getSecret/saveSecret/migratePlaintextSecrets()` idempotent, dọn secret khỏi `__bundle__` cũ. Đấu nối: settings PUT dùng `saveSecret`; `mail.ts`, `writebackApi.ts`, `sync/trigger` đọc qua `getSecret`; migrate 1 lần/process trong `getDb()`. Cảnh báo hiển thị trong trang Cài đặt + README.
- **M7 (sync đồng thời)**: FIXED. `checkSyncLock()` — có run `running` < 30 phút → `SyncConflictError` (route trả 409); > 30 phút → đánh dấu `stale`, cho chạy tiếp. Test 4 cases.
- **M8 (company rác)**: FIXED. `getOverview().byCompany` gom mọi giá trị khác LARIA/REUNION vào `(khác)` (giữ nguyên dữ liệu gốc; comment giải thích trong code). Dashboard hiển thị đúng 3 nhóm: LARIA / REUNION / (khác).

### 🟡 MINOR — 18/18 fixed
N1 CSRF `checkSameOrigin` trên cả 7 route POST/PUT · N2 timeout 30s cho fetch Sheets · N4 `serverError()` log server-side, message chung cho client · N5 chống CSV formula injection (prefix `'`) + test · N6 `toPositiveInt()` chống NaN (page=abc → 1/50) + test · N7 `escapeLike()` + `ESCAPE '\'` (search `%` không match tất cả) + test · N8 `decideSelected` theo batch 10 với `Promise.allSettled` · N9 comment lý do cho 2 eslint-disable · N10 xóa `export const dynamic` khỏi `lib/api.ts` · N11 `rel="noopener noreferrer"` · N12 "15 tab"→"13 tab" · N13 chip contrast (`.chip-loi` `#a93a1a`, `.chip-da_go` `#5b6572`, `.nav.sep` `#a9bedb`) · N14 `aria-label` checkbox phê duyệt · N15/N16 palette `role="dialog"`, kết quả là `<button role="option">`, điều hướng ↑/↓/Enter · N17 focus outline navy cho palette input · N18 panel inline `role="alertdialog"` thay `window.confirm` cho hoàn tác.

### Kiểm thử & build
- `npm test`: **56/56 pass** (10 files, gồm 6 file test mới: secrets, mail, approvals-decide, apply-batch, sync-lock, queries + mở rộng csv.test.ts).
- `npx tsc --noEmit`: sạch.
- `npm run build`: thành công (gồm postbuild copy static).
- Smoke test (standalone server): trang chủ 200 · CSS 200 (hết 404) · `/api/overview` 200 (111.470 dòng / 1.256 pending, byCompany = LARIA/REUNION/(khác)) · `/api/pending?page=abc` → page 1/size 50 · `/api/export` 200 · approvals id lạ → 404.

### Ghi chú
- **Crash native better-sqlite3 trên Node 24 (đã root-cause, ngoài phạm vi 28 mục — không đổi dependency)**: trong smoke test, server crash 2 lần với `Statement::~Statement` → `RemoveEnvironmentCleanupHook: Assertion failed: (env) != nullptr` (exit 134) trên **Node 24.20.0** của VM. Đây là lỗi đã biết của upstream: better-sqlite3 ≤ 12.x dùng legacy `node::ObjectWrap`; Node 24.19+ backport cleanup hook nhưng thiếu registry tương ứng (nodejs/node#65446) → V8 finalize Statement khi không có Environment, process abort. Gián đoạn, không tái hiện ổn định, **có từ trước đợt fix** (đợt review cũng gặp 1 lần). Fix upstream là better-sqlite3 v13 (N-API rewrite) nhưng v13 yêu cầu Node ≥ 22 → xung đột với khuyến nghị Node 20 LTS, nên **không nâng cấp** trong đợt này. Biện pháp: README đã ghi rõ **chỉ dùng Node 20 LTS, không dùng Node 24** trên máy deploy. Smoke test vẫn đạt đầy đủ trước/sau các lần crash (server restart là chạy lại bình thường).
- Reviewer pass (ECC code-reviewer + security-reviewer): ban đầu **WARNING** — 0 CRITICAL/HIGH, 2 MEDIUM + 3 LOW. Cả 5 đã được fix:
  - [MEDIUM] `sheets.ts` — message lỗi timeout từng chứa `url.slice(0,120)` có thể lọt vài ký tự đầu API key (`?key=...`) vào `server.log` → đã đổi sang log `url.split("?")[0]` (bỏ query string).
  - [MEDIUM] `approvals.ts` — TOCTOU fail-open khi `readStatus` trả `null` (cột status ngắn hơn dòng resolve) → đã đổi sang fail-safe: skip dòng + log `apply_log` status `'unknown'`, approval giữ nguyên để retry.
  - [LOW] message "kẹt sync" hardcode 30 phút → đã nội suy `timeoutMin`.
  - [LOW] comment `mode: 0o600` bị bỏ qua trên Windows (ACL `%APPDATA%` riêng user, chấp nhận được).
  - [LOW] README đã ghi: **sao lưu `machine.key` cùng `basescope.db`** — mất key = phải nhập lại toàn bộ credential.
  Sau fix: test **56/56 pass**, `tsc` sạch.

### VERDICT mới: **PASS** ✅
28/28 mục đã fix, test 55/55, build sạch, smoke test đạt. Không còn Blocker/Major nào cản trở dùng thật. Khuyến nghị: deploy trên Node 20 LTS, cấu hình credential trong Settings (đã được mã hoá AES-256-GCM), bật write-back theo quy trình 2 người (toggle + nhập DONG Y).
