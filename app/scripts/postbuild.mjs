// postbuild — chạy sau `next build` (cross-platform, dùng được trên Windows).
// Next.js standalone KHÔNG tự kèm `.next/static` (CSS/JS) và `public/` —
// thiếu bước này thì app chạy nhưng mất toàn bộ giao diện (CSS/JS 404).
// Xem: https://nextjs.org/docs/pages/api-reference/config/next-config-js/output

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(__dirname, "..");

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const SRC_STATIC = path.join(APP, ".next", "static");
const DST_STATIC = path.join(APP, ".next", "standalone", ".next", "static");
if (!fs.existsSync(SRC_STATIC)) {
  console.error("[postbuild] .next/static không tồn tại — hãy chạy `next build` trước.");
  process.exit(1);
}
copyDir(SRC_STATIC, DST_STATIC);
console.log("[postbuild] đã copy .next/static -> .next/standalone/.next/static");

const SRC_PUBLIC = path.join(APP, "public");
const DST_PUBLIC = path.join(APP, ".next", "standalone", "public");
if (fs.existsSync(SRC_PUBLIC)) {
  copyDir(SRC_PUBLIC, DST_PUBLIC);
  console.log("[postbuild] đã copy public/ -> .next/standalone/public");
}
console.log("[postbuild] xong.");
