"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { sep?: string; href?: string; label?: string }[] = [
  { href: "/", label: "Tổng quan" },
  { href: "/triage", label: "Bảng triage" },
  { sep: "Xử lý" },
  { href: "/phe-duyet", label: "Phê duyệt & Áp dụng" },
  { href: "/trang-thai", label: "Trạng thái đồng bộ" },
  { sep: "Hệ thống" },
  { href: "/cai-dat", label: "Cài đặt" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>BaseScope</h1>
        <p>Trạm quan trắc Base Request SAP B1</p>
      </div>
      <nav className="nav">
        {NAV.map((n, i) =>
          n.sep ? (
            <div key={i} className="sep">{n.sep}</div>
          ) : (
            <Link key={n.href} href={n.href!} className={path === n.href ? "active" : ""}>
              {n.label}
            </Link>
          )
        )}
      </nav>
    </aside>
  );
}
