# Product Specification: BaseScope — Trạm quan trắc Base Request SAP B1

> Generated from brief: "Thiết kế giải pháp quản lý toàn diện, trực quan hiện đại cho quy trình Base Request master data SAP B1 của anh Trải — dữ liệu từ Google Sheets DataGetFromBaseRequest, thẩm mỹ Fluent navy/gold/coral, giao diện tiếng Việt."
> Kèm theo: `../docs/giai-phap-tong-the.md` (Design Proposal + ADR của ECC architect).
> **Quyết định chốt ngày 15/10/2026 (anh Trải):** (1) Cảnh báo in-app + **email** (SMTP cấu hình trong Settings, Sprint 3); (2) Chạy chính trên **máy Windows** của anh Trải; (3) **Phase 1 BAO GỒM write-back có kiểm soát** theo kiểu "duyệt từng dòng rồi bấm áp dụng từng đợt" (sửa ADR-003).

## Vision

BaseScope là "trạm quan trắc" duy nhất cho toàn bộ vòng đời Base Request master data SAP B1: thay vì lặn trong 15 tab Google Sheets với ~69.000 dòng, anh Trải mở một dashboard tiếng Việt, thấy ngay **1.256 dòng cần xử lý** đang nằm ở request nào, lỗi gì, và request Tết nào sắp tới ngày hiệu lực. Mọi đề xuất "dọn status" đều xếp hàng **duyệt từng dòng**; chỉ những dòng đã duyệt mới được **áp dụng theo từng đợt** lên sheet — mỗi lần ghi đều có preview diff, audit log và rollback theo đợt. Mặc định app mở ở chế độ chỉ-đọc; bật write-back phải qua toggle có xác nhận.

## Design Direction

- **Color palette** (khóa cứng, không tự ý thêm):
  - Navy `#1E3A5F` — sidebar, header, primary actions, trạng thái "Hoàn tất"
  - Gold `#F2B705` — accent, trạng thái "Chờ xử lý", cảnh báo sắp tới hạn
  - Coral `#E0522F` — lỗi, quá hạn, destructive actions
  - Neutrals: nền `#F3F5F8`, surface `#FFFFFF`, viền `#E2E8F0`, chữ chính `#16233A`, chữ phụ `#5B6B7F`
  - Trạng thái "Đã gỡ/Remove": xám `#8A94A6`. Không dùng xanh lá generic — "xong" là navy.
- **Typography**: **Be Vietnam Pro** (hỗ trợ dấu tiếng Việt chuẩn) cho toàn bộ UI; **JetBrains Mono** cho mã hàng (`I0023613`), RequestId, số liệu KPI. Hierarchy: H1 20px/semibold (sentence case), H2 16px, body 13–14px — dashboard data-dense, không chữ to trang trí.
- **Layout philosophy**: "ops console đặc" — sidebar navy cố định bên trái (điều hướng theo 15 tab + Watchlist + Phê duyệt), topbar có ô tìm kiếm Ctrl+K + badge **CHẾ ĐỘ CHỈ ĐỌC** + trạng thái sync. Vùng chính: dải KPI → bảng triage sticky-header → drawer chi tiết trượt từ phải. Ưu tiên mật độ thông tin, tối đa 2 cú click tới được dòng dữ liệu.
- **Visual identity**: chip trạng thái viền mỏng + nền tint 12% đúng hex palette; mã hàng luôn monospace; countdown ngày hiệu lực dạng "còn 4 ngày" màu gold→coral khi ≤3 ngày; không có hero banner — màn hình mở ra là số liệu, không phải lời chào.
- **Inspiration**: Linear (mật độ + phím tắt), Grafana (ops monitoring), SAP Fiori (cảm giác enterprise quen thuộc với dân ERP).
- **Anti-AI-slop (cấm tuyệt đối)**:
  - Cấm gradient tím-xanh, cấm illustration stock/3D blob, cấm emoji làm icon trong UI
  - Cấm lưới "card" generic 3 cột với tiêu đề chung chung — mọi card phải là số liệu thật có drill-down
  - Cấm placeholder lorem/tiếng Anh lẫn trong UI tiếng Việt
  - Cấm dark-mode nửa vời: chỉ làm light theme chuẩn Fluent ở Phase 1
  - Bảng dữ liệu phải có: empty state ("Không có dòng nào — thử nới filter"), loading skeleton, và hiển thị đúng dấu tiếng Việt (test với "ĐỀ XUẤT TẠO MÃ HÀNG NỘI BỘ TẾT")

## Features (prioritized)

### Must-Have (Sprint 1)

1. **Sync Worker + SQLite cache**: đọc 15 tab qua Sheets API → lọc dòng rác (template `1..13`, dòng note) → upsert theo `(tab, key_row)` + `row_hash`. Chạy cron 20 phút + nút "Đồng bộ ngay". *Acceptance: dashboard mở < 3s; `sync_runs` ghi đủ 15 tab; chạy 2 lần liên tiếp không trùng dòng.*
2. **Status Normalization Engine**: bảng `status_map` versioned map `Awaiting/AwaItIng→Chờ xử lý`, `Transfer/Transfer Mua→Chuyển xử lý`, `Done→Hoàn tất`, `Remove/Removed→Đã gỡ`, `Approved→Đã duyệt`, `Error→Lỗi`; tách suffix trạng thái khỏi `key_row` (`I0023663Approved→I0023663`); bảng mapping xem được trên UI. *Acceptance: 100% dòng có `status_norm`; test với dữ liệu thật 15/10 (bao gồm `AwaItIng`, dòng rác).*
3. **Overview Dashboard**: dải KPI (tổng dòng / chờ xử lý / lỗi / sắp tới hạn) + bảng chi tiết theo tab × Company (LARIA/REUNION), click KPI lọc xuống triage. *Acceptance: số liệu khớp CSV tổng hợp ngày 15/10 (1.256 pending).*
4. **Pending Triage Board**: danh sách chờ xử lý gom theo (tab, status, request) có thể bung từng nhóm; sort/filter theo company, ngày tạo, từ khóa. *Acceptance: tìm được 264 dòng giá bán Tết trong ≤ 2 click từ dashboard.*
5. **Request Drill-down**: trang 1 request: mọi lines của nó (kể cả xuyên tab, vd "Create Item move to update price"), link base.vn gốc, timeline trạng thái. *Acceptance: mở request 2980122 thấy đủ 166 dòng giá bán LARIA.*
6. **Global Search (Ctrl+K)**: tìm theo mã hàng, tên hàng, RequestId, RequestName; kết quả nhóm theo tab, Enter nhảy tới dòng. *Acceptance: gõ `I0023613` < 500ms ra kết quả.*
7. **CSV Export**: xuất mọi view đang lọc (triage, request, search) ra CSV UTF-8 BOM — kế thừa thói quen hiện tại. *Acceptance: file export mở đúng tiếng Việt trên Excel Windows.*
8. **Sync Health + Chế độ đọc/ghi + Approval Queue & Write-back có kiểm soát**: topbar hiển thị "Đồng bộ lần cuối: …" + badge chế độ hiện tại (**CHỈ ĐỌC** mặc định / **GHI CÓ KIỂM SOÁT** khi bật toggle có xác nhận); trang trạng thái sync từng tab + bảng `status_map` công khai. Engine tự phát hiện ứng viên dọn dẹp (note báo OK nhưng status còn Error/Awaiting) → UI **duyệt/từ chối từng dòng** (checkbox), nút **"Áp dụng đợt đã duyệt"** mới ghi lên Sheets: mỗi lần ghi có preview diff (giá trị cũ→mới), ghi `apply_log` đầy đủ (ai/khi nào/dòng nào/giá trị cũ→mới), và **rollback theo đợt**. *Acceptance: ở chế độ chỉ-đọc không tồn tại đường ghi; bật write-back phải qua toggle + xác nhận; duyệt 3 dòng mẫu → preview đúng diff → áp dụng → verify sheet đổi đúng 3 dòng + apply_log đủ → rollback → sheet hoàn nguyên.*

### Should-Have (Sprint 2–3)

9. **Error Pattern Analytics**: top chữ ký lỗi (SAP -10 trùng mã, sai Vendor Id, "Update DATA to SAP Error"…) + biểu đồ trend theo tuần; click chữ ký lọc ra các dòng. *Acceptance: tái hiện được phân rã 187 lỗi CreateItem ngày 15/10.*
10. **Effect-date Watchlist**: danh sách mốc hiệu lực (vd 19/10/2026 giá bán Tết) + đếm ngược, cảnh báo khi ≤ 7 ngày mà vẫn còn Awaiting. *Acceptance: 264 dòng giá bán Tết hiện "còn 4 ngày" màu gold.*
11. **Cleanup Proposal Queue**: engine tự phát hiện ứng viên dọn dẹp (note báo OK nhưng status còn Error/Awaiting: 89 + 34 dòng đã biết) → UI duyệt/từ chối **từng dòng**, kết quả chỉ lưu SQLite local. *Acceptance: duyệt 89 dòng mẫu không đổi gì trên sheet (verify bằng read lại).*
12. **Item Timeline**: 1 mã hàng → đường thời gian qua các tab (tạo mã → giá mua → giá bán → BOM → hoá đơn). *Acceptance: mã có mặt ở ≥2 tab hiện đủ mắt xích.*
13. **Saved Views**: lưu bộ lọc đặt tên ("Tết 2027", "Lỗi SAP -10", "Chờ giá bán") dùng lại 1 click. *Acceptance: tạo/sửa/xóa view, share qua URL query.*

### Nice-to-Have (Sprint 4+)

15. **RBAC + Audit UI**: phân vai xem/duyệt; trang audit log. *Acceptance: thao tác duyệt nào cũng truy được ai-khi-nào.*
16. **Mobile triage**: responsive cho màn hình điện thoại — xem KPI + duyệt nhanh khi đi công tác. *Acceptance: triage dùng được ở 390px.*

> Ghi chú 15/10/2026: feature #14 (write-back) đã được anh Trải chốt **đưa vào Phase 1 / Sprint 1** (gộp vào feature #8 mở rộng) thay vì để Sprint 5. Feature #11 (Cleanup Proposal Queue) cũng gộp vào #8.

## Technical Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + CSS thuần theo Fluent token (không framework CSS nặng). TanStack Table cho bảng data-dense, Recharts cho trend.
- **Backend**: cùng Next.js — Route Handlers `/api/*` (GET cho đọc; POST cho sync-trigger, approvals, write-back — write-back chỉ hoạt động khi bật toggle có xác nhận), logic sync trong `lib/sync/`.
- **Database**: SQLite (`better-sqlite3`, WAL mode), file `./data/basescope.db` cạnh app — backup = copy file. Bảng `apply_log` ghi mọi lần write-back (ai/khi nào/dòng nào/giá trị cũ→mới) + rollback theo đợt.
- **Sync**: **Google Sheets API trực tiếp** (API key hoặc service account do user cấu hình trong trang Settings — app chạy trên máy Windows nên **KHÔNG** dùng `hatch_gws_cli`), cron 20' + trigger tay. Scope đọc `spreadsheets.readonly`; scope ghi tách riêng, chỉ dùng khi write-back được bật.
- **Key libraries**: `better-sqlite3`, `zod` (validate), `date-fns` (đếm ngược/ngày hiệu lực), `nodemailer` (cảnh báo email — Sprint 3), `recharts`, `@tanstack/react-table`.
- **Test**: Vitest (unit: normalizer, parser) + Playwright (E2E: triage → drill-down → export). Chuẩn ECC: TDD, coverage ≥ 80%.
- **Deploy**: `output: 'standalone'` → zip → Windows: giải nén, `node server.js` (port 3000). Pin Node 20 (`.nvmrc`).

## Evaluation Criteria

### Design Quality (weight: 0.3)
- Mở app ra thấy ngay số liệu thật (1.256 pending), không phải hero/illustration.
- Chip trạng thái đúng hex palette; mã hàng monospace; dấu tiếng Việt chuẩn mọi màn hình.
- Bảng data-dense: sticky header, sort/filter inline, empty/loading state đầy đủ.
- Badge chế độ đọc/ghi + "đồng bộ lần cuối" luôn hiện diện; bật write-back phải qua toggle có xác nhận.

### Originality (weight: 0.2)
- "Trạm quan trắc" có cá tính ops-console riêng (Linear × Fiori), không giống template admin generic.
- Watchlist đếm ngược ngày hiệu lực + phát hiện "note OK nhưng status lỗi" là 2 điểm nhấn nghiệp vụ độc đáo.
- Ctrl+K search xuyên 15 tab trong < 500ms.

### Craft (weight: 0.3)
- Mọi con số đều drill-down được (không số chết); drawer chi tiết trượt mượt, Esc đóng.
- Phím tắt: `Ctrl+K` search, `g d` dashboard, `g p` pending, `/` focus filter.
- Countdown "còn N ngày" chuyển gold→coral đúng ngưỡng; skeleton khi sync.
- CSV export mở đúng tiếng Việt trên Excel Windows (UTF-8 BOM).

### Functionality (weight: 0.2)
- Kịch bản 1: từ dashboard → 264 dòng giá bán Tết → export CSV (≤ 3 click).
- Kịch bản 2: search `I0023613` → timeline xuyên tab.
- Kịch bản 3: sync tay → số liệu cập nhật, badge thời gian đổi.
- Kịch bản 4: duyệt 2 đề xuất dọn dẹp → xem preview diff → "áp dụng đợt" (với mock Sheets) → verify apply_log đủ 2 dòng + rollback → dữ liệu hoàn nguyên.
- Kịch bản 5: ở chế độ chỉ-đọc, API write-back từ chối (403) — không tồn tại đường ghi lén.

## Sprint Plan

### Sprint 1: "Nền móng & Đồng bộ có kiểm soát"
- Goals: có dữ liệu sạch trong SQLite + API + khung UI Fluent + write-back "duyệt từng dòng, áp dụng từng đợt" (theo chốt 15/10/2026).
- Features: #1 Sync Worker, #2 Normalizer, #8 Sync Health + Chế độ đọc/ghi + Approval Queue & Write-back, #3 Overview, #4 Triage, #5 Request drill-down, #6 Ctrl+K, #7 Export CSV.
- Definition of done: sync full 15 tab < 2 phút; 100% dòng có status_norm; test normalizer pass với dữ liệu 15/10; UI khung sidebar+topbar đúng palette; kịch bản write-back mẫu (duyệt → preview → áp dụng → rollback) pass với mock Sheets; 5 kịch bản Functionality 1–3, 5 pass E2E; số liệu khớp CSV 15/10; export mở đúng trên Excel.

### Sprint 2: "Bảng điều khiển"
- Goals: anh Trải thay thế việc lọc tay trên Sheets bằng dashboard. (Gộp vào Sprint 1 theo chốt 15/10 — giữ lại để tham khảo nếu tách giai đoạn.)
- Features: #3 Overview, #4 Triage, #5 Request drill-down, #6 Ctrl+K, #7 Export CSV.
- Definition of done: xem Sprint 1.

### Sprint 3: "Trinh sát"
- Goals: từ "xem" sang "chủ động phát hiện" + cảnh báo email.
- Features: #9 Error Analytics, #10 Watchlist, #13 Saved Views, **cảnh báo email** (SMTP cấu hình trong Settings — host/port/user/pass lưu trong DB local, **không hardcode**; trigger: lỗi mới phát hiện sau sync, watchlist ≤ 7 ngày mà còn Awaiting).
- Definition of done: watchlist báo đúng 264 dòng Tết "còn 4 ngày"; analytics tái hiện phân rã lỗi 15/10; email test gửi thành công từ trang Settings.

### Sprint 4: "Hoàn thiện triage"
- Goals: timeline mã hàng + củng cố vận hành.
- Features: #12 Item Timeline.
- Definition of done: mã có mặt ở ≥2 tab hiện đủ mắt xích.

### Sprint 5: "Củng cố"
- Goals: hoàn thiện vận hành + RBAC + mobile.
- Features: #15 RBAC + Audit UI, #16 Mobile.
- Definition of done: checklist architect mục 8 pass hết; zip Windows chạy 1 lệnh.
