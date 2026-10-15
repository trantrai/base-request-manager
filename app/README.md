# BaseScope — Trạm quan trắc Base Request SAP B1

Dashboard tiếng Việt theo dõi toàn bộ vòng đời Base Request master data SAP B1 từ file
Google Sheets `DataGetFromBaseRequest` (15 tab, ~111.000 dòng sau khi lọc rác).

**Sprint 1 đã build:** Sync Worker (Sheets API → SQLite), Status Normalization Engine,
Overview Dashboard (KPI theo tab × LARIA/REUNION), Pending Triage Board, Request drill-down,
tìm kiếm toàn cục Ctrl+K, xuất CSV (UTF-8 BOM), Sync health + badge chế độ,
Approval Queue (quét ứng viên dọn dẹp → duyệt từng dòng → xem trước → **áp dụng từng đợt**
→ rollback), trang Cài đặt (Sheets credential, SMTP, toggle write-back).

## Yêu cầu

- **Node.js 20+** (khuyên 20.18 LTS) — kiểm tra: `node --version`
- Không cần Docker, không cần database server (dùng SQLite file local).

## Chạy trên Windows (máy anh Trải)

**Cách 1 — 1 click:** nhấp đúp `start.bat` (tự cài lib → build → nạp dữ liệu mẫu → chạy).

**Cách 2 — PowerShell từng bước:**

```powershell
cd D:\TRAI\basescope        # thư mục giải nén
npm install --no-audit --no-fund
npm run build
npm run seed               # nạp dữ liệu mẫu (snapshot 15/10/2026) — chỉ lần đầu
node .next\standalone\server.js
# mở trình duyệt: http://localhost:3000
```

> Lưu ý: **không** chạy `npm run dev` để dùng lâu dài (dev mode chậm, chỉ để phát triển).
> File database nằm tại `data\basescope.db` — copy file này là backup toàn bộ.

## Cấu hình kết nối Google Sheets (để Đồng bộ)

Mặc định app chạy với dữ liệu mẫu đã nạp. Để đồng bộ dữ liệu mới từ Sheets:

1. Mở trang **Cài đặt** trong app.
2. Nhập **Spreadsheet ID** (mặc định đã điền sẵn file DataGetFromBaseRequest).
3. Chọn kiểu xác thực — xem chi tiết trong `HUONG-DAN-CREDENTIAL.md`:
   - **API key**: chỉ đọc (đủ cho nút "Đồng bộ ngay").
   - **Service account**: đọc + ghi (bắt buộc nếu muốn dùng "Áp dụng đợt đã duyệt").
4. Bấm **Lưu cài đặt**, sang trang **Trạng thái đồng bộ** → **Đồng bộ ngay**.

## Chế độ ghi (write-back có kiểm soát)

- Mặc định app ở **CHỈ ĐỌC**: mọi API ghi trả 403, nút "Áp dụng" bị khóa.
- Muốn ghi: trang **Cài đặt** → nhập đúng chữ `DONG Y` → **Bật ghi có kiểm soát**.
- Luồng an toàn: **Phê duyệt** → tick chọn từng dòng → **Duyệt** → **Xem trước thay đổi**
  → nhập `DONG Y` → **Áp dụng đợt đã duyệt** → kiểm tra `apply_log`.
- Ghi sai? Tab **Lịch sử áp dụng** → **Hoàn tác đợt này** (ghi ngược giá trị cũ).

## Email cảnh báo (Sprint 3)

Nhập SMTP trong trang Cài đặt (host/port/user/pass, email nhận) → bấm **Gửi email kiểm tra**.
Trigger tự động (lỗi mới, watchlist sắp tới hạn) sẽ bật ở Sprint 3.

## Kiểm thử

```powershell
npm test        # Vitest: 26 unit tests (normalizer, CSV, write-back validation, sync transform)
npm run typecheck
```

## Cấu trúc

```
src/
  app/            # Pages (App Router) + API routes (/api/*)
    api/          # overview, pending, requests, search, export, sync, approvals,
                  # writeback/{preview,apply,rollback,apply-log}, settings
  components/     # Sidebar, Topbar (Ctrl+K), StatusChip
  lib/            # db, normalize, sheets, syncEngine, approvals, writeback, csv, mail
scripts/seed.mjs  # nạp snapshot vào SQLite
data/             # basescope.db (tạo bởi seed)
```

## An toàn dữ liệu

- Credential **không** hardcode — nằm trong DB local (`data/basescope.db`, bảng `settings`).
- Mọi lần ghi lên Sheets đều qua preview + xác nhận + `apply_log` + rollback theo đợt.
- Không bao giờ `DELETE` bảng `apply_log`.
