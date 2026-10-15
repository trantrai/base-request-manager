# Hướng dẫn lấy credential Google Sheets cho BaseScope

BaseScope gọi **trực tiếp** Google Sheets API (không qua trung gian). Có 2 cách:

## Cách 1 — API key (chỉ đọc, đơn giản nhất)

Đủ cho nút **"Đồng bộ ngay"**. Không ghi được lên Sheets.

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project (hoặc dùng project có sẵn).
2. **APIs & Services → Library** → tìm **Google Sheets API** → **Enable**.
3. **APIs & Services → Credentials → Create Credentials → API key** → copy key.
   - Khuyên: bấm **Restrict key** → chỉ tick **Google Sheets API**.
4. Mở file Google Sheets `DataGetFromBaseRequest` → **Share** → **General access: Anyone with the link — Viewer**.
5. Trong BaseScope → **Cài đặt** → kiểu xác thực **API key** → dán key → Lưu.

## Cách 2 — Service account (đọc + ghi, cần cho write-back)

1. Google Cloud Console → **APIs & Services → Credentials → Create Credentials → Service account**.
2. Đặt tên (vd `basescope-sync`) → **Create** → bỏ qua phân quyền project → **Done**.
3. Mở service account vừa tạo → tab **Keys → Add key → Create new key → JSON** → tải file.
4. Mở file JSON, copy 2 trường:
   - `client_email` → dán vào ô **Service account email**
   - `private_key` → dán vào ô **Private key** (giữ nguyên cả dòng `-----BEGIN PRIVATE KEY-----`)
5. Mở file Google Sheets → **Share** → thêm `client_email`:
   - Chỉ đọc: quyền **Viewer**
   - Muốn dùng "Áp dụng đợt đã duyệt": quyền **Editor**
6. Trong BaseScope → **Cài đặt** → kiểu xác thực **Service account** → dán 2 trường → Lưu.

> Credential chỉ lưu trong file `data\basescope.db` trên máy anh — không gửi đi đâu khác.

## Email cảnh báo (SMTP)

- **Gmail:** dùng **App Password** (không phải mật khẩu thường):
  Google Account → Bảo mật → **Xác minh 2 bước** (bật) → **Mật khẩu ứng dụng** → tạo mới → dán vào ô Password.
  - Host: `smtp.gmail.com`, Port: `587`, From: địa chỉ Gmail của anh.
- **Outlook/365:** Host `smtp.office365.com`, Port `587`.
- Xong bấm **Gửi email kiểm tra** để xác nhận.
