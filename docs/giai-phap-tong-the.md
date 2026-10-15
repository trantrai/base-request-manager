# Giải pháp tổng thể: BaseScope — Trạm quan trắc Base Request SAP B1

> Vai trò: ECC **architect** · Quy trình: Current State → Requirements → Design Proposal → Trade-Off Analysis (+ADR)
> Ngày: 15/10/2026 · Trạng thái: **Đã chốt thiết kế (anh Trải, 15/10/2026)** — sang GAN Generator build Sprint 1
> Ngôn ngữ giao diện: **tiếng Việt** · Thẩm mỹ: Fluent tối giản hiện đại (navy `#1E3A5F` / gold `#F2B705` / coral `#E0522F`)
>
> **3 quyết định chốt 15/10/2026:** (1) Cảnh báo in-app + email (email vào Sprint 3, SMTP cấu hình trong Settings, không hardcode); (2) Nơi chạy chính: **máy Windows** của anh Trải (mở khi cần) — script PowerShell, không lệnh Unix-only; (3) **Phase 1 BAO GỒM write-back có kiểm soát** kiểu "duyệt từng dòng rồi bấm áp dụng từng đợt" → ADR-003 được sửa lại (xem mục 4).

---

## 1. Current State Analysis (Hiện trạng)

### 1.1 Kiến trúc hiện tại

```
Base.vn (requests) ──▶ Job đồng bộ (n8n / script) ──▶ Google Sheets "DataGetFromBaseRequest"
                                                          (15 tab, ~69.000 dòng)
                                                              │
                                                              ▼
                                              Con người đọc TRỰC TIẾP trên Sheets
                                              + tổng hợp thủ công bằng tay / CSV
```

- **Sheets vừa là database vừa là UI.** Mọi trạng thái xử lý nằm trong cột `Item_status` / `Status`, do job tự động ghi và con người đọc.
- **Không có lớp chuẩn hoá:** cùng một ý nghĩa "đang chờ" tồn tại 2 biến thể `Awaiting` / `AwaItIng` (sai chính tả lọt vào dữ liệu); có dòng rác template (`key_row=1,2,3…`) và dòng ghi chú (`"ĐÃ GO-LIVE VỚI UPDATE GIÁ MUA"`) nằm lẫn trong vùng dữ liệu.
- **Không có dashboard, không cảnh báo:** muốn biết "có bao nhiêu lỗi mới" phải lọc tay từng tab.
- **Luồng "dọn status" nguy hiểm:** 89 dòng `CreateItem` đã xong việc (`"Create Item on SAP and BASE OK"`) nhưng status vẫn `Error`; 34 dòng `UpdateStatus` note `"Update SAP Ok"` nhưng vẫn `Awaiting`. Muốn dọn phải sửa trực tiếp lên sheet chung — rủi ro ghi nhầm, không có audit.

### 1.2 Số liệu thực tế (phân tích sáng 15/10/2026)

| Tab | Dòng | Cần xử lý |
|---|---|---|
| CreateItem | 5.876 | 187 Error + 9 Transfer |
| UpdateItem | 16.341 | 5 |
| UpdatePrice | 3.196 | 5 |
| UpdatePriceMua | 7.955 | 314 Awaiting + 345 Error |
| UpdatePriceBan | 10.994 | 264 Awaiting + 3 Error |
| CreateCom_Bom | 3.911 | 7 |
| ItemCom_Bom_D | 37.707 | 78 Approved (chưa Done) |
| UpdateStatus | 4.761 | 37 |
| UpdateCOGS | 4.702 | 2 |
| JournalEntry / UpdateSAPInvoice / Warehouse / Lock… | còn lại | 0 |
| **Tổng** | **~69.000** | **1.256** |

Điểm nóng: giá bán Tết (264 dòng, hiệu lực **19/10/2026** — còn 4 ngày), giá mua lỗi SAP (345 dòng), mã hàng lỗi (187 dòng).

### 1.3 Technical debt & giới hạn hạ tầng

1. **Sheets API quota:** đọc full 15 tab ≈ 15 requests/lần — rẻ; nhưng không có delta API đáng tin cậy → chiến lược đồng bộ phải tính lại (xem ADR-002).
2. **VM hay bị replace:** chỉ `/home/hatch` persistent; mọi state phải nằm trong đó, không trông chờ service nền sống sót.
3. **Deploy cuối trên Windows** của anh Trải (`D:\TRAI\…`): ưu tiên gói "giải nén là chạy", không Docker (VM không có Docker; máy Windows cũng không nên phụ thuộc Docker).
4. **Chuẩn làm việc của anh Trải:** trình báo cáo trước khi sửa → sửa theo lệnh → kiểm thử trước khi báo cáo → git chỉ khi có lệnh rõ ràng → zip sau mỗi đợt. Thiết kế tôn trọng điều này ở cấp độ từng dòng: **mặc định chỉ-đọc, write-back phải duyệt từng dòng + áp dụng từng đợt** (chốt 15/10/2026).

---

## 2. Requirements

### 2.1 Functional (Phase 1 — quan trắc + write-back có kiểm soát)

- **F1. Dashboard tổng quan:** KPI theo tab × Company (LARIA/REUNION): tổng dòng, chờ xử lý, lỗi, sắp tới ngày hiệu lực.
- **F2. Bảng triage:** 1.256 dòng gom theo (tab, status, request) — bấm vào bung chi tiết từng dòng.
- **F3. Drill-down request:** một RequestId → thấy toàn bộ lines của nó (kể cả request trỏ sang tab khác, ví dụ item "move to update price").
- **F4. Chuẩn hoá trạng thái:** engine map `Awaiting/AwaItIng → Chờ xử lý`, `Transfer/Transfer Mua → Chuyển xử lý`…; bảng mapping hiển thị công khai để kiểm chứng.
- **F5. Watchlist ngày hiệu lực:** đếm ngược tới các mốc (19/10/2026 giá bán Tết…), cảnh báo khi còn ≤ N ngày mà vẫn Awaiting.
- **F6. Phân tích mẫu lỗi:** top chữ ký lỗi (SAP -10 trùng mã, sai Vendor Id, "Update DATA to SAP Error"…) + xu hướng theo thời gian.
- **F7. Hàng đợi phê duyệt + write-back có kiểm soát:** engine tự phát hiện ứng viên dọn dẹp ("note báo OK nhưng status còn Error/Awaiting") → UI **duyệt/từ chối từng dòng** (checkbox) → nút **"Áp dụng đợt đã duyệt"** ghi lên sheet theo từng đợt: preview diff trước khi ghi, `apply_log` đầy đủ (ai/khi nào/dòng nào/giá trị cũ→mới), **rollback theo đợt**. Mặc định app mở ở **chế độ chỉ-đọc**; bật write-back phải qua toggle có xác nhận 2 bước.
- **F8. Tìm kiếm toàn cục (Ctrl+K):** theo mã hàng, tên hàng, RequestId, RequestName.
- **F9. Timeline mã hàng:** một mã I00… đi qua các tab (tạo mã → giá mua → giá bán → BOM → hoá đơn).
- **F10. Export CSV** mọi view đang lọc (kế thừa thói quen hiện tại của anh Trải).
- **F11. Cảnh báo email (Sprint 3):** SMTP cấu hình trong trang Settings (không hardcode); trigger: lỗi mới sau sync, watchlist ≤ 7 ngày mà còn Awaiting.

### 2.2 Functional (giai đoạn sau — CHƯA làm)

- RBAC đa user, mobile triage đầy đủ (xem roadmap mục 5).

### 2.3 Non-functional

| Nhóm | Mục tiêu |
|---|---|
| Ghi có kiểm soát | Mặc định `write_mode=off` (API write-back 403); bật qua toggle + xác nhận 2 bước; duyệt từng dòng + preview diff + apply_log + rollback theo đợt (ADR-003 revised 15/10/2026) |
| Hiệu năng | Dashboard < 3s với ~69k dòng (nhờ cache local); tìm kiếm < 500ms |
| Độ tươi dữ liệu | Đồng bộ định kỳ 20 phút + nút refresh tay; hiển thị "đồng bộ lần cuối lúc …" |
| Bảo mật | Credential Sheets scope **readonly**; secret qua env; audit log mọi hành động duyệt |
| Vận hành | Chạy được trên Windows bằng 1 lệnh; sống sót sau VM replace (state trong `/home/hatch`) |
| i18n | 100% tiếng Việt |
| Kiểm thử | Theo chuẩn ECC: TDD, coverage ≥ 80% khi sang build |

---

## 3. Design Proposal

### 3.1 Kiến trúc tổng thể (text diagram)

```
                        ┌─────────────────────────────────────────────┐
                        │  Google Sheets "DataGetFromBaseRequest"      │
                        │  (source of truth)                          │
                        └──────────────────┬──────────────────────────┘
                                           │ Sheets API trực tiếp
                                           │ (API key / service account
                                           │  do user cấu hình trong Settings;
                                           │  KHÔNG dùng hatch_gws_cli vì app
                                           │  chạy trên máy Windows)
                        ┌──────────────────▼──────────────────────────┐
                        │  SYNC WORKER (cron 20' + nút refresh tay)    │
                        │  - đọc 15 tab (15 API calls/lần)            │
                        │  - lọc dòng rác (template 1..13, dòng note) │
                        │  - chuẩn hoá status → status_norm           │
                        │  - upsert theo (tab, key_row), hash đổi     │
                        │    → ghi status_changes (phục vụ cảnh báo)  │
                        └──────────────────┬──────────────────────────┘
                                           │
                        ┌──────────────────▼──────────────────────────┐
                        │  SQLite (WAL mode) — cache local            │
                        │  file: ./data/basescope.db (persistent)     │
                        │  + approvals, apply_log, settings           │
                        └──────────────────┬──────────────────────────┘
                                           │
┌────────────────┐   REST                  ┌──────────────────▼──────────────────────────┐
│  Next.js 15 UI │ ◄────────────────────── │  API Routes (/api/*)                         │
│  Fluent theme  │   GET: đọc              │  overview / pending / requests / items /    │
│  tiếng Việt    │   POST: sync-trigger,   │  sync / export / approvals / writeback /    │
│  badge CHỈ ĐỌC │   approvals, writeback  │  apply-log / settings (gated)               │
│  / GHI CÓ KS   │   (writeback bị khoá    └─────────────────────────────────────────────┘
└────────────────┘    khi ở chế độ chỉ-đọc)

WRITE-BACK (Phase 1, gated — chốt 15/10/2026):
  Approval Queue (checkbox duyệt từng dòng)
      → "Xem trước thay đổi" (preview diff cũ→mới)
      → "Áp dụng đợt đã duyệt" [toggle write-back đã BẬT + xác nhận]
      → values.batchUpdate lên Sheets (write-scope riêng)
      → ghi apply_log từng dòng + batch
      → "Hoàn tác đợt này" (rollback: ghi ngược giá trị cũ)
```

**Nguyên tắc phân lớp:** UI không bao giờ gọi Sheets trực tiếp — mọi thứ qua API → SQLite. "Công tắc ghi" nằm ở đúng 3 chỗ: toggle write-mode (mặc định TẮT) + scope credential ghi tách riêng + API từ chối khi chưa bật.

### 3.2 Trách nhiệm các component

| Component | Trách nhiệm | Không làm |
|---|---|---|
| Sync Worker | Đọc sheet → lọc rác → normalize → upsert SQLite; ghi `sync_runs` + `status_changes` | Không suy diễn nghiệp vụ, không tự sửa status |
| Normalizer | Ánh xạ `status_raw → status_norm` theo bảng `status_map` (versioned, hiển thị công khai trên UI) | Không đoán status từ note |
| API (read) | Truy vấn SQLite: overview, pending, search, export | Không có endpoint PUT/POST đổi dữ liệu sheet (Phase 1) |
| Approval Queue + Write-back | Lưu đề xuất + quyết định duyệt/từ chối từng dòng trong SQLite; nút "Áp dụng đợt đã duyệt" ghi lên sheet **chỉ khi write_mode=on**, có preview diff, apply_log và rollback | Không ghi khi chưa duyệt; không có nút "ghi tất cả" |
| UI | Dashboard, triage, drill-down, Ctrl+K, export; badge chế độ **CHỈ ĐỌC / GHI CÓ KIỂM SOÁT** luôn hiển thị | Không render nút ghi khi write_mode=off |
| Watcher/Alert | So `status_changes` giữa 2 lần sync → "lỗi mới", "request mới"; đếm ngược ngày hiệu lực; email (Sprint 3, SMTP trong Settings) | Không gửi alert khi chưa cấu hình kênh |

### 3.3 Data model (SQLite)

```text
sync_runs(id, started_at, finished_at, duration_ms, tabs_ok, tabs_fail, rows_read, rows_upserted, status, error)
unified_lines(id, tab, key_row, created_on, request_id, request_name, req_type, req_group,
              status_raw, status_norm, sync_note, company, item_code, payload_json,
              row_hash, first_seen_at, last_seen_at)
status_changes(id, line_id, old_raw, new_raw, old_norm, new_norm, detected_at)
requests(request_id, tab, request_name, company, lines_total, lines_pending,
         min_created, max_created, effect_date, last_seen_at)
status_map(raw_value, norm_code, label_vi, severity, version)   -- versioned, UI hiển thị được
approvals(id, line_id, proposed_status, proposed_note, reason, rule_code,
          state[proposed/approved/rejected], created_at, decided_by, decided_at, note)
apply_log(id, batch_id, approval_id, tab, key_row, sheet_range, field,
          old_value, new_value, status[applied/rolled_back/failed],
          applied_by, applied_at, error)
settings(key, value_json, updated_at)   -- sheets_cred, smtp, write_mode, alert_rules
audit_log(id, ts, actor, action, detail_json)
```

- `unified_lines` gom 13/15 tab có schema chung; `ItemCom_Bom_D` (schema khác) cũng map vào cùng bảng với `item_code = key_row` tách suffix trạng thái (`I0023663Approved → I0023663`).
- `payload_json` giữ nguyên các cột `cl_*` để drill-down không mất thông tin.
- `row_hash` để phát hiện dòng đổi nội dung giữa 2 lần sync mà không cần diff từng cột.

### 3.4 Luồng đồng bộ (sync flow)

1. Cron (mỗi 20') hoặc nút "Đồng bộ ngay" gọi Sync Worker.
2. Worker đọc lần lượt 15 tab bằng `values.get` (range `A1:Z<rowCount>`), mỗi tab 1 API call.
3. Lọc rác: bỏ dòng `key_row ∈ {1..13}` dạng template số thứ tự; bỏ dòng note không có key_row hợp lệ (giữ lại log trong `sync_runs.error` để minh bạch).
4. Chuẩn hoá status qua `status_map`; tách mã hàng khỏi suffix (`…Error/Awaiting/Done`).
5. Upsert theo `(tab, key_row)`; nếu `row_hash` đổi → insert `status_changes`.
6. Cập nhật bảng `requests` (aggregate) và `sync_runs`; UI poll `/api/sync/status`.

*Ước lượng:* ~69k dòng ≈ 1,2–1,5M cells ≈ 15–25 MB JSON/lần — nằm gọn trong quota Sheets API (300 reads/phút).

### 3.5 API contracts (Phase 1)

| Method & path | Mô tả | Ghi chú |
|---|---|---|
| `GET /api/overview` | KPI: tổng dòng, chờ, lỗi, sắp hiệu lực — theo tab × company | |
| `GET /api/pending?tab=&status=&company=&q=&page=` | Danh sách chờ xử lý, phân trang, filter | |
| `GET /api/requests/:id` | Mọi lines của 1 request (xuyên tab) | |
| `GET /api/items/:code` | Timeline 1 mã hàng qua các tab | |
| `GET /api/analytics/errors` | Top chữ ký lỗi + trend | Sprint 3 |
| `GET /api/watchlist` | Các mốc hiệu lực + đếm ngược | Sprint 3 |
| `GET /api/export?...` | CSV của view đang lọc | UTF-8 BOM |
| `GET /api/sync/status` | Lần sync cuối, trạng thái từng tab | |
| `GET /api/status-map` | Bảng mapping chuẩn hoá (công khai) | |
| `GET /api/apply-log?batch=` | Lịch sử các đợt áp dụng + rollback | |
| `POST /api/sync/trigger` | Chạy sync tay | vẫn chỉ đọc sheet |
| `POST /api/approvals` | Tạo/duyệt/từ chối đề xuất — lưu SQLite local | không chạm sheet |
| `POST /api/writeback/preview` | Preview diff (cũ→mới) của các dòng đã duyệt | không ghi |
| `POST /api/writeback/apply` | Áp dụng đợt đã duyệt lên Sheets | **chỉ khi write_mode=on** |
| `POST /api/writeback/rollback/:batchId` | Hoàn tác 1 đợt (ghi ngược giá trị cũ) | **chỉ khi write_mode=on** |
| `GET/PUT /api/settings` | Cấu hình Sheets credential, SMTP, write_mode, alert rules | secret không trả về client |

Envelope trả về thống nhất: `{ ok, data, error, meta: { page, total } }`.

### 3.6 Ghi có kiểm soát — phòng thủ theo lớp (chốt 15/10/2026, thay thế bản read-only cũ)

1. **Mặc định chỉ-đọc:** `write_mode=off`; mọi API `/api/writeback/*` trả **403** khi chưa bật; UI không render nút "Áp dụng"/"Hoàn tác".
2. **Toggle có xác nhận:** bật write-back phải qua toggle trong Settings + hộp thoại xác nhận 2 bước (gõ xác nhận); tắt lại 1 click. Badge topbar đổi **CHỈ ĐỌC** → **GHI CÓ KIỂM SOÁT** (gold).
3. **Credential tách riêng:** scope đọc `spreadsheets.readonly` cho sync; scope ghi chỉ dùng cho write-back job, cấu hình riêng trong Settings, không hardcode.
4. **Duyệt từng dòng trước khi ghi:** Approval Queue (checkbox) → **preview diff** (giá trị cũ→mới từng dòng) → mới được "Áp dụng đợt đã duyệt". Không có đường "ghi tất cả 1 click".
5. **Audit + rollback:** mỗi lần ghi insert `apply_log` (batch_id, ai/khi nào/dòng nào/range/giá trị cũ→mới); nút "Hoàn tác đợt này" ghi ngược giá trị cũ và đánh dấu `rolled_back`. Không bao giờ `DELETE` apply_log.

### 3.7 Bảo mật & vận hành

- Secret (Sheets API key) qua biến môi trường / Secure Vault — **không commit**.
- Audit log ghi lại: ai bấm sync tay, ai duyệt/từ chối đề xuất nào.
- Deploy Windows (chốt 15/10/2026 — nơi chạy chính): `next build` với `output: 'standalone'` → nén zip → giải nén → chạy `start.bat` (gọi `node server.js`, port 3000). **Script khởi động/dồng bộ viết tương thích PowerShell — cấm `tee` và mọi lệnh Unix-only** (bài học từ repo farmers-market). Nếu dùng Prisma: `prisma db push` tự chạy trong script start. SQLite nằm cạnh app (`./data/basescope.db`) — copy file là backup.
- Sống sót VM replace: toàn bộ code + db + log dưới `/home/hatch/workspace/base-request-manager`; cron sync chạy qua `cron` job của Muse hoặc systemd-less script (ghi chú khôi phục trong README vận hành).
- Testing (khi sang build, theo chuẩn ECC): TDD, coverage ≥ 80%; test normalizer với dữ liệu thật đã phân tích (bao gồm case `AwaItIng`, dòng rác, suffix status trong key_row); E2E cho luồng triage → drill-down → export.

---

## 4. Trade-Off Analysis & ADR

### ADR-001: Stack — Next.js 15 (App Router) + SQLite

**Context.** Anh Trải quen cả hai hệ: repo `sapb1-farmers-market` đang chạy **Next.js full-stack** deploy Windows bằng `npm run build && npm start`; đồng thời anh cũng yêu cầu Blazor cho dự án sales-web. Cần chọn một cho dashboard nội bộ này.

**Decision:** Next.js 15 App Router + `better-sqlite3`, CSS thuần/Fluent token (không Tailwind nặng cũng được — chi tiết trong spec).

| Phương án | Pros | Cons |
|---|---|---|
| **Next.js 15 + SQLite (CHỌN)** | 1 ngôn ngữ duy nhất (TS) cho UI+API — team hiện tại đã deploy thành công mô hình này trên Windows; build `standalone` cho ra 1 folder chạy bằng `node server.js`, khớp thói quen "giải nén là chạy" + đóng zip; hệ sinh thái chart/table (Recharts, TanStack Table) giàu cho dashboard; dev nhanh nhất cho UI data-dense | SEO/SSR không cần thiết ở app nội bộ (không sao); cần Node runtime trên máy Windows (đã có vì farmers-market cũng cần) |
| Blazor Server + .NET 9 | Đúng sở trường ERP/.NET của anh Trải; SignalR realtime ngon | Triển khai Windows cần ASP.NET Core runtime + cấu hình Kestrel/service — nặng hơn 1 folder Node; UI data-grid ecosystem kém linh hoạt hơn React cho dashboard tùy biến; build trên VM Linux cho target Windows dễ lệch (bài học Prisma P2022) |
| FastAPI + React SPA riêng | Backend Python nhẹ, anh Trải có skill Python | 2 process/2 deploy thay vì 1 — phức tạp gấp đôi trên máy Windows cá nhân; không tận dụng được kinh nghiệm deploy Next.js sẵn có |

**Consequences:** Toàn bộ logic sync/API/UI trong một repo, một lệnh chạy. Rủi ro Node version lệch → pin Node trong README vận hành + file `.nvmrc`.

**Status:** Proposed (chờ anh Trải chốt).

---

### ADR-002: Cache — Full-refresh định kỳ vào SQLite local (thay vì đọc live Sheets mỗi request)

**Context.** Sheets API không có delta-feed đáng tin cậy cho 15 tab; đọc live mỗi lần mở dashboard = chậm + tốn quota + UI phụ thuộc mạng.

**Decision:** Sync Worker pull full 15 tab mỗi 20 phút (15 API calls) → upsert SQLite theo `(tab, key_row)` + `row_hash`; dashboard chỉ đọc SQLite.

| Phương án | Pros | Cons |
|---|---|---|
| **Full-refresh + SQLite (CHỌN)** | Dashboard < 3s, tìm kiếm < 500ms; chịu được mất mạng tới Sheets; `status_changes` cho ra "lỗi mới từ lần sync trước" miễn phí; đơn giản, không state phức tạp | Dữ liệu trễ tối đa 20' (chấp nhận được cho báo cáo; có nút sync tay); mỗi lần sync tải ~20MB |
| Đọc live Sheets mỗi request | Luôn tươi | Dashboard chậm (5–15s), tốn quota, sập khi Sheets lag; không làm được trend/cảnh báo |
| Incremental (chỉ đọc dòng mới) | Tiết kiệm băng thông | Sheets không có con trỏ thay đổi tin cậy; append/xóa dòng giữa tab làm lệch offset → rủi ro mất dữ liệu âm thầm |

**Status:** Accepted (cho Phase 1).

---

### ADR-003: Ghi có kiểm soát — write-back "duyệt từng dòng, áp dụng từng đợt" (REVISED 15/10/2026)

**Context.** Ràng buộc ban đầu: Phase 1 chỉ đọc + báo cáo. Ngày 15/10/2026 anh Trải chốt: **Phase 1 bao gồm write-back** nhưng theo kiểu "duyệt từng dòng rồi bấm áp dụng từng đợt" — vẫn an toàn như read-only khi chưa bật.

**Decision:** Ghi có kiểm soát 5 lớp (mục 3.6): mặc định `write_mode=off` (API write-back 403) + toggle bật phải xác nhận 2 bước + credential write-scope tách riêng + duyệt từng dòng (checkbox) + preview diff trước khi "Áp dụng đợt đã duyệt" + `apply_log` đầy đủ + rollback theo đợt.

| Phương án | Pros | Cons |
|---|---|---|
| **Ghi có kiểm soát, mặc định tắt (CHỌN)** | Đúng thói quen "trình báo cáo trước, sửa sau khi có lệnh" của anh Trải ở cấp độ từng dòng; có preview + audit + rollback nên sai sót vẫn cứu được; khi tắt toggle thì an toàn tuyệt đối như read-only | Phải implement thêm write-back job + apply_log + rollback (đã đưa vào Sprint 1) |
| Read-only tuyệt đối (bản cũ) | Đơn giản nhất | Anh Trải vẫn phải mở Sheets sửa tay từng dòng — mất đúng giá trị của "trạm quan trắc" |
| Ghi trực tiếp không qua duyệt | Nhanh | Rủi ro ghi nhầm lên sheet chung — không chấp nhận được |

**Consequences:** Mọi thao tác ghi đi qua đúng 3 endpoint (`preview` → `apply` → `rollback`), đều validate `write_mode`. Secret ghi tách khỏi secret đọc.

**Status:** Accepted (chốt 15/10/2026, anh Trải).

---

### ADR-004: Phân phối — Next.js `output: 'standalone'` đóng zip (thay vì Docker/service 24/7 trên VM)

**Context.** VM hay bị replace (mất service nền); máy Windows của anh Trải không có Docker; thói quen hiện tại: pull → build → zip → deploy tại `D:\TRAI\…`.

**Decision:** Build standalone → zip (`basescope-win-<date>.zip`, gồm `server.js`, `.next/static`, `data/` mẫu, `start.bat`) → giải nén → chạy. Trên VM dev: chạy bằng cron-trigger khi cần demo; không cài service nền vĩnh viễn.

| Phương án | Pros | Cons |
|---|---|---|
| **Standalone zip (CHỌN)** | Khớp 100% thói quen deploy của anh Trải; không phụ thuộc Docker/systemd; sống sót VM replace (zip + source đều trong `/home/hatch`) | Không phải "mở là có 24/7" nếu máy Windows tắt (chấp nhận được: đây là công cụ quan trắc theo phiên làm việc) |
| Docker Compose | Môi trường đồng nhất | VM không có Docker; máy Windows cài Docker Desktop nặng + anh Trải chưa dùng |
| Service 24/7 trên VM + tunnel public | Luôn online | VM replace giết service (bài học n8n); tunnel free hết hạn 60' — đúng "ma sát lặp lại" cần tránh |

**Status:** Accepted (chốt 15/10/2026 — chạy chính trên **máy Windows** của anh Trải, mở khi cần dùng).

---

## 5. Roadmap

| Giai đoạn | Nội dung | Cửa ra |
|---|---|---|
| **P0 — Duyệt thiết kế** | Anh Trải chốt spec + 4 ADR + 3 câu hỏi mở (mục 7) | Lệnh "build" rõ ràng |
| **Phase 1 (GAN Sprints 1–3)** | Sync worker, dashboard, triage, watchlist, approval queue + **write-back có kiểm soát** (duyệt từng dòng, áp dụng từng đợt, rollback) — chốt 15/10/2026 | Demo trên Windows, zip đầu tiên |
| **Phase 1.5** | Vận hành thử 2–4 tuần với dữ liệu thật; hiệu chỉnh `status_map`, ngưỡng cảnh báo, SMTP email | Báo cáo Blockers/Majors/Minors |
| **Giai đoạn sau (khi có lệnh)** | RBAC đa user, mobile đầy đủ, mở rộng sang các file Sheets khác | Theo yêu cầu |

## 6. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Schema tab đổi (thêm cột, đổi tên tab) | Sync worker đọc header động, map theo tên cột (không theo index cứng); log cảnh báo khi header lạ |
| Quota Sheets API | 15 calls/20' ≪ 300/phút; exponential backoff + `sync_runs` ghi fail rõ ràng |
| Dữ liệu rác mới (template/note) | Bộ lọc rác versioned + log minh bạch số dòng bị loại mỗi lần sync |
| Trễ 20' bỏ lỡ request Tết cận kề | Nút sync tay + watchlist đếm ngược theo ngày hiệu lực (không phụ thuộc sync) |
| SQLite phình to | `payload_json` chỉ giữ cột cần thiết; job dọn `status_changes` > 90 ngày |

## 7. Câu hỏi đã chốt (anh Trải, 15/10/2026)

1. **Kênh cảnh báo:** in-app + **email** → email vào Sprint 3, SMTP cấu hình trong Settings, không hardcode.
2. **Nơi chạy chính:** **máy Windows** của anh Trải (mở khi cần) → build `next start` standalone, script PowerShell, không lệnh Unix-only.
3. **Write-back:** **đưa vào Phase 1** theo kiểu "duyệt từng dòng rồi bấm áp dụng từng đợt" → ADR-003 sửa thành "ghi có kiểm soát", mặc định mở ở chế độ chỉ-đọc.

## 8. Checklist (theo chuẩn architect)

- [x] User flows: dashboard → triage → drill-down → export → approval (mô tả trong spec.md)
- [x] API contracts: mục 3.5
- [x] Data models: mục 3.3
- [x] Performance target: < 3s dashboard, sync 20'
- [x] Security: scope readonly, secret qua env, audit log
- [x] Deployment: standalone zip, Windows 1 lệnh chạy
- [x] Rollback: SQLite file copy là backup; sync worker idempotent (upsert theo hash)
- [x] Monitoring: `sync_runs` + badge "đồng bộ lần cuối"
- [x] Chờ duyệt: 4 ADR + spec.md trước khi build (đúng chuẩn "trình báo cáo trước, sửa sau khi có lệnh")
- [x] **Đã chốt 15/10/2026:** 3 quyết định của anh Trải đã cập nhật vào spec.md + ADR-003 (revised) + ADR-004 (accepted) + rubric — đang build Sprint 1
