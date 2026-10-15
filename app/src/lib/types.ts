// Kiểu dùng chung cho BaseScope.

export type TabName =
  | "CreateItem" | "UpdateItem" | "UpdatePrice" | "UpdatePriceMua"
  | "UpdatePriceBan" | "CreateCom_Bom" | "ItemCom_Bom_D" | "UpdateStatus"
  | "UpdateCOGS" | "Warehouse" | "JournalEntry" | "UpdateSAPInvoice"
  | "LockOrUnLockSaleStatus";

export type StatusNorm =
  | "cho_xu_ly"   // Awaiting / AwaItIng
  | "loi"         // Error
  | "chuyen_xu_ly"// Transfer / Transfer Mua
  | "hoan_tat"    // Done
  | "da_go"       // Remove / Removed
  | "da_duyet"    // Approved
  | "khac";

export interface StatusMapEntry {
  raw: string;
  norm: StatusNorm;
  labelVi: string;
  severity: "info" | "warn" | "error" | "muted";
  version: number;
}

export interface UnifiedLine {
  id?: number;
  tab: string;
  keyRow: string;
  /** Số dòng trên Sheets (dùng trong unique key vì key_row có thể trùng). */
  sheetRow: number;
  createdOn: string;
  requestId: string;
  requestName: string;
  reqType: string;
  reqGroup: string;
  statusRaw: string;
  statusNorm: StatusNorm;
  syncNote: string;
  company: string;
  itemCode: string;
  payloadJson: string;
  rowHash: string;
}

export interface ApprovalState {
  id: number;
  lineId: number;
  proposedStatus: string;
  proposedNote: string;
  reason: string;
  ruleCode: string;
  state: "proposed" | "approved" | "rejected";
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface ApplyLogEntry {
  id: number;
  batchId: string;
  tab: string;
  keyRow: string;
  sheetRange: string;
  field: string;
  oldValue: string;
  newValue: string;
  status: "applied" | "rolled_back" | "failed";
  appliedBy: string;
  appliedAt: string;
  error: string | null;
}

export interface Settings {
  spreadsheetId: string;
  sheetsAuthType: "api_key" | "service_account" | "";
  sheetsApiKey: string;
  sheetsSaEmail: string;
  sheetsSaKey: string; // private_key (lưu local, không commit)
  writeMode: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  alertTo: string;
}
