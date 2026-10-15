# Eval Rubric — BaseScope (GAN Evaluator)

> Dùng trực tiếp cho agent gan-evaluator. Mỗi tiêu chí chấm 0–10, nhân trọng số, tổng 10 điểm. Ngưỡng đạt: ≥ 7.5 và không có tiêu chí Functionality nào 0 điểm.

## 1. Design Quality — weight 0.3

| # | Check | Điểm |
|---|---|---|
| D1 | Màn hình đầu tiên là số liệu thật (KPI/triage), không hero/illustration | /10 |
| D2 | Đúng palette: navy `#1E3A5F`, gold `#F2B705`, coral `#E0522F` (+ neutrals); không màu lạ | /10 |
| D3 | Tiếng Việt 100%, dấu chuẩn (test chuỗi "ĐỀ XUẤT TẠO MÃ HÀNG NỘI BỘ TẾT") | /10 |
| D4 | Mã hàng/RequestId render monospace; chip trạng thái có label tiếng Việt | /10 |
| D5 | Badge chế độ (**CHỈ ĐỌC** mặc định / **GHI CÓ KIỂM SOÁT** khi bật toggle có xác nhận) + "đồng bộ lần cuối" luôn hiển thị ở topbar | /10 |
| D6 | Bảng có empty state, loading skeleton, sticky header | /10 |
| D7 | Trang Settings có cấu hình Sheets credential + SMTP (không hardcode secret trong code) | /10 |

## 2. Originality — weight 0.2

| # | Check | Điểm |
|---|---|---|
| O1 | Cảm giác "ops console" riêng (đặc, phím tắt), không giống template admin generic | /10 |
| O2 | Watchlist đếm ngược ngày hiệu lực hoạt động đúng (gold→coral theo ngưỡng) | /10 |
| O3 | Phát hiện "note OK nhưng status lỗi" trong Approval Queue | /10 |
| O4 | Ctrl+K search xuyên tab < 500ms với dữ liệu thật | /10 |

## 3. Craft — weight 0.3

| # | Check | Điểm |
|---|---|---|
| C1 | Mọi KPI đều click-through xuống triage đã lọc (không số chết) | /10 |
| C2 | Drawer chi tiết trượt từ phải, đóng bằng Esc; không vỡ layout | /10 |
| C3 | Phím tắt: Ctrl+K, `/` focus filter, Esc đóng — hoạt động, có gợi ý trên UI | /10 |
| C4 | Không AI-slop: không gradient tím-xanh, không emoji icon, không lorem | /10 |
| C5 | CSV export mở đúng tiếng Việt trên Excel (UTF-8 BOM) | /10 |

## 4. Functionality — weight 0.2 (critical: bất kỳ kịch bản nào fail = trừ nặng)

| # | Kịch bản E2E | Điểm |
|---|---|---|
| F1 | Dashboard → lọc ra 264 dòng giá bán Tết → export CSV (≤ 3 click) | /10 |
| F2 | Ctrl+K gõ mã hàng → mở timeline xuyên tab đúng | /10 |
| F3 | Bấm "Đồng bộ ngay" → số liệu + badge thời gian cập nhật | /10 |
| F4 | Duyệt 2 đề xuất dọn dẹp → preview diff đúng → "áp dụng đợt" (mock Sheets) → apply_log đủ 2 dòng → rollback → dữ liệu hoàn nguyên | /10 |
| F5 | Reload / restart app → dữ liệu + cấu hình nguyên vẹn (SQLite persistent) | /10 |
| F6 | Ở chế độ chỉ-đọc, gọi API write-back bị từ chối 403; toggle bật write-back đòi xác nhận 2 bước | /10 |

## Cách tính

```
Tổng = 0.3*avg(D) + 0.2*avg(O) + 0.3*avg(C) + 0.2*avg(F)
```

- ≥ 8.5: xuất sắc, sang sprint tiếp theo.
- 7.5–8.4: đạt, generator sửa các điểm < 7 rồi tiếp tục.
- < 7.5 hoặc bất kỳ F nào = 0: fail — generator làm lại sprint, evaluator ghi rõ Blockers.
