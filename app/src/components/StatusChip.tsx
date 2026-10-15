const LABEL: Record<string, string> = {
  cho_xu_ly: "Chờ xử lý",
  loi: "Lỗi",
  chuyen_xu_ly: "Chuyển xử lý",
  hoan_tat: "Hoàn tất",
  da_go: "Đã gỡ",
  da_duyet: "Đã duyệt",
  khac: "Khác",
};

export function StatusChip({ norm, raw }: { norm: string; raw?: string }) {
  return (
    <span className={`chip chip-${norm}`} title={raw}>
      {LABEL[norm] ?? norm}
    </span>
  );
}
