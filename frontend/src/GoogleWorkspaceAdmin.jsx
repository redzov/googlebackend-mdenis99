/* @refresh reload */
// src/GoogleWorkspaceAdmin.jsx - API-integrated version
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Shield, KeyRound, Users, Boxes, ServerCog, Search, Filter, Plus, Edit3, Trash2, Check, Copy, Download,
  ChevronDown, ChevronLeft, ChevronRight, RefreshCcw, Activity, AlertTriangle, CircleCheck, CircleX,
  PlugZap, SlidersHorizontal, Code2, Mail, ListChecks, LockKeyhole, LogOut,
  Fingerprint, Globe, Hash, User
} from "lucide-react";
import api from "./api";

const classNames = (...c) => c.filter(Boolean).join(" ");
const nowISO = () => new Date().toISOString();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const d2str = (iso) => {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch { return "—"; }
};
const t2str = (iso) => {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return "—"; }
};

const rnd = (n) => Math.floor(Math.random() * n);
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genKey = () =>
  Array.from({ length: 24 }).map(() => LETTERS[rnd(LETTERS.length)]).join("").replace(/(.{6})/g, "$1-").replace(/-$/, "");

const downloadText = (filename, text) => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

const copyToClipboard = async (text) => {
  try { await navigator.clipboard.writeText(String(text ?? "")); return true; }
  catch { return false; }
};

// ==================== UI Components ====================
function Badge({ tone = "neutral", children }) {
  const t = tone === "good" ? "success" : tone === "bad" ? "danger" : tone;
  const toneCls = t === "success" ? "bg-green-500/15 text-green-300 ring-green-400/30"
    : t === "warning" ? "bg-yellow-500/15 text-yellow-200 ring-yellow-400/30"
    : t === "danger" ? "bg-red-500/15 text-red-300 ring-red-400/30"
    : t === "info" ? "bg-sky-500/15 text-sky-200 ring-sky-400/30"
    : "bg-white/10 text-gray-200 ring-white/20";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${toneCls}`}>{children}</span>;
}

function TextInput({ label, value, onChange, placeholder, icon, type = "text", right, hint, disabled = false, readOnly = false }) {
  return (
    <label className="block">
      {label && <div className="text-sm text-gray-200 inline-flex items-center gap-2">{icon && <span className="text-yellow-400">{icon}</span>}<span>{label}</span></div>}
      <div className="relative mt-1">
        <input type={type} value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled} readOnly={readOnly}
          className={classNames("w-full rounded-xl border border-yellow-500/15 bg-white/10 px-3 py-2 pr-10 text-gray-100 outline-none focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400/50", disabled || readOnly ? "opacity-80 cursor-not-allowed" : "")} />
        {right && <div className="absolute inset-y-0 right-2 flex items-center">{right}</div>}
      </div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder, hint }) {
  return (
    <label className="block">
      {label && <div className="text-sm text-gray-200">{label}</div>}
      <textarea value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} rows={4}
        className="mt-1 w-full rounded-xl border border-yellow-500/15 bg-white/10 px-3 py-2 text-gray-100 outline-none focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400/50" />
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </label>
  );
}

function SingleSelect({ label, options, value, onChange, placeholder = "Выбрать…", icon = null, zIndex = 220 }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const btnRef = useRef(null);
  const ddRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 256 });
  const selectedOpt = useMemo(() => options.find((o) => (o.key ?? o) === value), [options, value]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapperRef.current?.contains(e.target) && !ddRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const calc = () => { const r = btnRef.current.getBoundingClientRect(); setPos({ top: r.bottom + 8, left: r.left, width: r.width }); };
    calc();
    window.addEventListener("scroll", calc, true);
    window.addEventListener("resize", calc);
    return () => { window.removeEventListener("scroll", calc, true); window.removeEventListener("resize", calc); };
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      {label && <div className="text-sm text-gray-200 inline-flex items-center gap-2">{icon && <span className="text-yellow-400">{icon}</span>}<span>{label}</span></div>}
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)}
        className="mt-1 w-full rounded-xl border border-yellow-500/15 bg-white/10 px-3 py-2 text-left text-sm text-gray-100 outline-none hover:bg-yellow-500/10 focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400/50">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{selectedOpt?.label ?? selectedOpt ?? value ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 text-yellow-400 shrink-0" />
        </div>
      </button>
      {open && createPortal(
        <div ref={ddRef} className="fixed max-h-64 overflow-auto rounded-xl border border-yellow-500/20 ring-1 ring-yellow-500/10 bg-neutral-900/90 p-2 text-sm text-gray-100 shadow-[0_0_40px_rgba(234,179,8,0.15)] backdrop-blur"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex }}>
          {options.map((opt) => {
            const k = opt.key ?? opt;
            const label2 = opt.label ?? opt;
            const active = k === value;
            return (
              <button key={String(k)} className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-yellow-500/10 ${active ? "bg-yellow-500/10 ring-1 ring-yellow-500/20" : ""}`}
                onClick={() => { onChange?.(k); setOpen(false); }}>
                <span className="truncate">{label2 || "—"}</span>
                {active && <Check className="h-4 w-4 text-yellow-400" />}
              </button>
            );
          })}
        </div>, document.body)}
    </div>
  );
}

function Modal({ open, onClose, title, icon, children, size = "md", footer, headerHint, closeOnOverlay = true }) {
  if (!open) return null;
  const sizeClass = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-2xl" : size === "xl" ? "max-w-3xl" : size === "2xl" ? "max-w-4xl" : "max-w-xl";
  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => closeOnOverlay && onClose?.()} />
      <div className={classNames("relative w-full", sizeClass, "rounded-2xl bg-neutral-900/80 p-6 backdrop-blur-lg border border-yellow-500/10 ring-1 ring-yellow-500/20 shadow-[0_0_40px_rgba(234,179,8,0.12)]")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-yellow-500/10 ring-1 ring-yellow-500/20">{icon || <Shield className="h-5 w-5 text-yellow-300" />}</div>
            <div className="min-w-0"><h3 className="text-lg font-semibold text-white">{title}</h3>{headerHint && <p className="mt-1 text-[13px] text-gray-300/90">{headerHint}</p>}</div>
          </div>
          <button onClick={onClose} className="rounded-full bg-yellow-500/10 px-3 py-1 text-sm text-yellow-200 hover:bg-yellow-500/20">✕</button>
        </div>
        {children}
        {footer && <div className="mt-6 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>, document.body);
}

function Pagination({ page, totalPages, onPage }) {
  const p = clamp(Number(page || 1), 1, Math.max(1, Number(totalPages || 1)));
  const t = Math.max(1, Number(totalPages || 1));
  const btn = "inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-gray-300">Страница <b className="text-white">{p}</b> из <b className="text-white">{t}</b></div>
      <div className="flex items-center gap-2">
        <button className={btn} onClick={() => onPage?.(p - 1)} disabled={p <= 1}><ChevronLeft className="h-4 w-4" /> Назад</button>
        <button className={btn} onClick={() => onPage?.(p + 1)} disabled={p >= t}>Вперёд <ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Toast({ toast, clear }) {
  if (!toast) return null;
  const toneCls = toast.tone === "success" ? "border-green-400/25 ring-green-400/20 bg-green-500/10 text-green-100"
    : toast.tone === "danger" ? "border-red-400/25 ring-red-400/20 bg-red-500/10 text-red-100"
    : "border-yellow-500/15 ring-yellow-500/10 bg-neutral-900/70 text-gray-100";
  return createPortal(
    <div className="fixed bottom-4 right-4 z-[300] w-[360px] max-w-[calc(100vw-2rem)]">
      <div className={`rounded-2xl border p-4 ring-1 shadow-[0_0_40px_rgba(234,179,8,0.08)] backdrop-blur ${toneCls}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{toast.title || "Готово"}</div>
            {toast.msg && <div className="mt-1 text-xs opacity-90 break-words">{toast.msg}</div>}
          </div>
          <button className="rounded-xl bg-white/10 px-2 py-1 text-xs hover:bg-white/15" onClick={clear}>Закрыть</button>
        </div>
      </div>
    </div>, document.body);
}

function StatCard({ title, value, hint, icon }) {
  return (
    <div className="rounded-2xl bg-neutral-900/70 p-5 backdrop-blur-lg border border-yellow-500/10 ring-1 ring-yellow-500/10">
      <div className="flex items-center gap-2 text-sm text-gray-300"><span className="text-yellow-400">{icon}</span><span className="truncate">{title}</span></div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

// ==================== Constants ====================
const ACCOUNT_STATUS = ["AVAILABLE", "ISSUED", "BAD"];
const NAV = [
  { key: "keys", title: "Keys", icon: <KeyRound className="h-5 w-5" /> },
  { key: "accounts", title: "Accounts", icon: <Boxes className="h-5 w-5" /> },
  { key: "workspaces", title: "Workspaces", icon: <Users className="h-5 w-5" /> },
  { key: "creation_logs", title: "Creation Logs", icon: <ListChecks className="h-5 w-5" /> },
  { key: "settings", title: "Settings", icon: <SlidersHorizontal className="h-5 w-5" /> },
  { key: "api_example", title: "API Example", icon: <Code2 className="h-5 w-5" /> },
  { key: "logs", title: "API Logs", icon: <ServerCog className="h-5 w-5" /> },
];

// ==================== Main Component ====================
export default function GoogleWorkspaceAdmin({ user, onLogout }) {
  const ACTION_BTN = "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium bg-gradient-to-r from-yellow-500 to-amber-600 text-white ring-1 ring-amber-300/60 hover:opacity-95 shadow-[0_0_24px_rgba(234,179,8,0.30)]";

  const [tab, setTab] = useState("keys");
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  // Data states
  const [keys, setKeys] = useState([]);
  const [keysPagination, setKeysPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [accounts, setAccounts] = useState([]);
  const [accountsPagination, setAccountsPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [workspaces, setWorkspaces] = useState([]);
  const [workspacesPagination, setWorkspacesPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [recoveryEmails, setRecoveryEmails] = useState([]);
  const [settings, setSettings] = useState({});
  const [apiLogs, setApiLogs] = useState([]);
  const [creationLogs, setCreationLogs] = useState([]);
  const [creationLogsPagination, setCreationLogsPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [creationLogStats, setCreationLogStats] = useState({});
  const [stats, setStats] = useState({ accounts: {}, keys: {}, workspaces: {} });

  // Filters
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [accStatusFilter, setAccStatusFilter] = useState("");
  const [logFilterStatus, setLogFilterStatus] = useState("");
  const [logFilterEndpoint, setLogFilterEndpoint] = useState("");
  const [creationLogStatusFilter, setCreationLogStatusFilter] = useState("");
  const pageSize = 10;

  // Modals
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState({ qty: 10, workspaceId: null });
  const [manualRunning, setManualRunning] = useState(false);
  const [manualProgress, setManualProgress] = useState(0);
  const [manualResult, setManualResult] = useState(null);
  const [manualStatus, setManualStatus] = useState(null);
  const [manualCurrentStep, setManualCurrentStep] = useState("");
  const [manualCreated, setManualCreated] = useState(0);
  const [manualFailed, setManualFailed] = useState(0);

  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyEdit, setKeyEdit] = useState(null);
  const [keyDeleteOpen, setKeyDeleteOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState(null);

  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [wsEdit, setWsEdit] = useState(null);
  const [wsDeleteOpen, setWsDeleteOpen] = useState(false);
  const [wsToDelete, setWsToDelete] = useState(null);

  const [recModalOpen, setRecModalOpen] = useState(false);
  const [recEdit, setRecEdit] = useState(null);
  const [recDraft, setRecDraft] = useState({ email: "", imapHost: "imap.gmail.com", imapPort: 993, imapUser: "", imapPass: "" });

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(null), 2600); };

  // ==================== Data Loading ====================
  const loadKeys = useCallback(async (p = 1) => {
    try {
      const data = await api.getKeys({ page: p, limit: pageSize, search: q });
      setKeys(data.data || []);
      setKeysPagination(data.pagination || { page: p, totalPages: 1, total: 0 });
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  }, [q]);

  const loadAccounts = useCallback(async (p = 1) => {
    try {
      const params = { page: p, limit: pageSize, search: q };
      if (accStatusFilter) params.status = accStatusFilter;
      const data = await api.getAccounts(params);
      setAccounts(data.data || []);
      setAccountsPagination(data.pagination || { page: p, totalPages: 1, total: 0 });
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  }, [q, accStatusFilter]);

  const loadWorkspaces = useCallback(async (p = 1) => {
    try {
      const data = await api.getWorkspaces({ page: p, limit: pageSize, search: q });
      setWorkspaces(data.data || []);
      setWorkspacesPagination(data.pagination || { page: p, totalPages: 1, total: 0 });
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  }, [q]);

  const loadRecoveryEmails = useCallback(async () => {
    try {
      const data = await api.getRecoveryEmails({ limit: 100 });
      setRecoveryEmails(data.data || []);
    } catch (err) { console.error(err); }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      setSettings(data || {});
    } catch (err) { console.error(err); }
  }, []);

  const loadApiLogs = useCallback(async () => {
    try {
      const params = { limit: 50 };
      if (logFilterStatus) params.status = logFilterStatus;
      if (logFilterEndpoint) params.endpoint = logFilterEndpoint;
      const data = await api.getApiLogs(params);
      setApiLogs(data.data || []);
    } catch (err) { console.error(err); }
  }, [logFilterStatus, logFilterEndpoint]);

  const loadCreationLogs = useCallback(async (p = 1) => {
    try {
      const params = { page: p, limit: pageSize };
      if (creationLogStatusFilter) params.status = creationLogStatusFilter;
      const data = await api.getCreationLogs(params);
      setCreationLogs(data.data || []);
      setCreationLogsPagination(data.pagination || { page: p, totalPages: 1, total: 0 });
    } catch (err) { console.error(err); }
  }, [creationLogStatusFilter]);

  const loadCreationLogStats = useCallback(async () => {
    try {
      const data = await api.getCreationLogStats();
      setCreationLogStats(data || {});
    } catch (err) { console.error(err); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getStats();
      setStats(data || {});
    } catch (err) { console.error(err); }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadKeys(), loadAccounts(), loadWorkspaces(), loadRecoveryEmails(), loadSettings(), loadStats()]);
      setLoading(false);
    };
    init();
  }, []);

  // Reload on tab/filter change
  useEffect(() => { setPage(1); }, [tab, q, accStatusFilter]);
  useEffect(() => {
    if (tab === "keys") loadKeys(page);
    else if (tab === "accounts") loadAccounts(page);
    else if (tab === "workspaces") loadWorkspaces(page);
    else if (tab === "logs") loadApiLogs();
    else if (tab === "creation_logs") { loadCreationLogs(page); loadCreationLogStats(); }
    else if (tab === "settings") { loadSettings(); loadRecoveryEmails(); loadStats(); }
  }, [tab, page, q, accStatusFilter, logFilterStatus, logFilterEndpoint, creationLogStatusFilter]);

  const wsById = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces]);

  // ==================== Keys CRUD ====================
  const openAddKey = () => { setKeyEdit({ id: null, key: genKey(), quotaLimit: 100, workspaceId: workspaces[0]?.id || null, note: "" }); setKeyModalOpen(true); };
  const openEditKey = (row) => { setKeyEdit({ ...row }); setKeyModalOpen(true); };

  const saveKey = async () => {
    try {
      if (keyEdit.id) {
        await api.updateKey(keyEdit.id, { workspaceId: keyEdit.workspaceId, quotaLimit: Number(keyEdit.quotaLimit), note: keyEdit.note });
        showToast({ tone: "success", title: "Key updated" });
      } else {
        await api.createKey({ workspaceId: keyEdit.workspaceId, quotaLimit: Number(keyEdit.quotaLimit), note: keyEdit.note, customKey: keyEdit.key });
        showToast({ tone: "success", title: "Key created" });
      }
      setKeyModalOpen(false);
      loadKeys(page);
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  const confirmDeleteKey = async () => {
    try {
      await api.deleteKey(keyToDelete.id);
      showToast({ tone: "success", title: "Key deleted" });
      setKeyDeleteOpen(false);
      loadKeys(page);
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  const downloadKeyAccounts = async (id) => {
    try {
      const text = await api.downloadKeyAccounts(id);
      downloadText(`key_${id}_accounts.txt`, text);
      showToast({ tone: "success", title: "Downloaded" });
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  // ==================== Workspaces CRUD ====================
  const openAddWs = () => { setWsEdit({ id: null, domain: "", recoveryEmailId: null, note: "", serviceAccountJson: "", adminEmail: "" }); setWsModalOpen(true); };
  const openEditWs = (row) => { setWsEdit({ ...row }); setWsModalOpen(true); };

  const saveWs = async () => {
    try {
      const data = { domain: wsEdit.domain, recoveryEmailId: wsEdit.recoveryEmailId, note: wsEdit.note, serviceAccountJson: wsEdit.serviceAccountJson, adminEmail: wsEdit.adminEmail };
      if (wsEdit.id) {
        await api.updateWorkspace(wsEdit.id, data);
        showToast({ tone: "success", title: "Workspace updated" });
      } else {
        await api.createWorkspace(data);
        showToast({ tone: "success", title: "Workspace created" });
      }
      setWsModalOpen(false);
      loadWorkspaces(page);
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  const confirmDeleteWs = async () => {
    try {
      await api.deleteWorkspace(wsToDelete.id);
      showToast({ tone: "success", title: "Workspace deleted" });
      setWsDeleteOpen(false);
      loadWorkspaces(page);
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  // ==================== Recovery Emails CRUD ====================
  const openAddRec = () => { setRecEdit(null); setRecDraft({ email: "", imapHost: "imap.gmail.com", imapPort: 993, imapUser: "", imapPass: "" }); setRecModalOpen(true); };
  const openEditRec = (row) => { setRecEdit(row); setRecDraft({ email: row.email, imapHost: row.imapHost, imapPort: row.imapPort, imapUser: row.imapUser, imapPass: "" }); setRecModalOpen(true); };

  const saveRec = async () => {
    try {
      if (recEdit) {
        await api.updateRecoveryEmail(recEdit.id, recDraft);
        showToast({ tone: "success", title: "Recovery email updated" });
      } else {
        await api.createRecoveryEmail(recDraft);
        showToast({ tone: "success", title: "Recovery email created" });
      }
      setRecModalOpen(false);
      loadRecoveryEmails();
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  const deleteRec = async (id) => {
    try {
      await api.deleteRecoveryEmail(id);
      showToast({ tone: "success", title: "Recovery email deleted" });
      loadRecoveryEmails();
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  // ==================== Settings ====================
  const saveSettings = async () => {
    try {
      await api.updateSettings({
        // GoLogin
        goLoginApiKey: settings.goLoginApiKey,
        // Webshare Proxy
        proxyHost: settings.proxyHost,
        proxyPort: settings.proxyPort ? Number(settings.proxyPort) : null,
        proxyUsername: settings.proxyUsername,
        proxyPassword: settings.proxyPassword,
        proxyProtocol: settings.proxyProtocol,
        // General
        defaultPassword: settings.defaultPassword,
        threads: Number(settings.threads) || 1,
      });
      showToast({ tone: "success", title: "Settings saved" });
      await loadSettings();
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  const testGoLogin = async () => {
    try {
      const result = await api.testGoLogin();
      if (result.success) {
        showToast({ tone: "success", title: "GoLogin Connected", msg: `Found ${result.profileCount || 0} profiles` });
      } else {
        showToast({ tone: "danger", title: "GoLogin Error", msg: result.message });
      }
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  const testProxy = async () => {
    try {
      const result = await api.testProxy();
      if (result.success) {
        showToast({ tone: "success", title: "Proxy Working", msg: result.proxyUrl });
      } else {
        showToast({ tone: "danger", title: "Proxy Error", msg: result.message });
      }
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  // ==================== Manual Generation ====================
  const loadManualStatus = useCallback(async () => {
    try {
      const data = await api.getManualStatus();
      setManualStatus(data);
    } catch (err) {
      console.error('Failed to load manual status:', err);
    }
  }, []);

  const manualGenerate = async () => {
    if (manualRunning) return;
    setManualRunning(true);
    setManualProgress(0);
    setManualResult(null);
    setManualCurrentStep("Запуск...");
    setManualCreated(0);
    setManualFailed(0);

    try {
      const { workspaceId, qty } = manualDraft;
      await api.manualCreate(workspaceId, Number(qty) || 10);

      // Poll progress
      const poll = setInterval(async () => {
        try {
          const prog = await api.manualProgress();
          const percent = prog.total > 0 ? Math.round(((prog.created + prog.failed) / prog.total) * 100) : 0;
          setManualProgress(percent);
          setManualCurrentStep(prog.current || prog.currentStep || "");
          setManualCreated(prog.created || 0);
          setManualFailed(prog.failed || 0);

          if (prog.status === "completed" || prog.status === "idle" || !prog.isRunning) {
            clearInterval(poll);
            setManualRunning(false);
            setManualProgress(100);
            setManualCurrentStep("Завершено");
            const text = await api.manualDownload(Number(qty), workspaceId);
            const ws = workspaces.find(w => w.id === workspaceId);
            setManualResult({ filename: `accounts_${ws?.domain || "manual"}_${d2str(nowISO())}.txt`, text, count: prog.created || qty });
            showToast({ tone: "success", title: "Генерация завершена", msg: `Создано: ${prog.created || 0}, ошибок: ${prog.failed || 0}` });
            loadAccounts();
            loadCreationLogs();
            loadCreationLogStats();
          }
        } catch { clearInterval(poll); setManualRunning(false); }
      }, 1000);
    } catch (err) {
      showToast({ tone: "danger", title: "Ошибка", msg: err.message });
      setManualRunning(false);
      setManualCurrentStep("");
    }
  };

  const manualStop = async () => {
    try {
      await api.manualStop();
      showToast({ tone: "warning", title: "Остановка", msg: "Генерация остановлена" });
    } catch (err) {
      showToast({ tone: "danger", title: "Ошибка", msg: err.message });
    }
  };

  // ==================== Downloads ====================
  const downloadAccounts = async () => {
    try {
      const text = await api.downloadAccounts({ status: accStatusFilter });
      downloadText(`accounts_${d2str(nowISO())}.txt`, text);
      showToast({ tone: "success", title: "Downloaded" });
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  const downloadLogs = async () => {
    try {
      const text = await api.downloadApiLogs({ status: logFilterStatus, endpoint: logFilterEndpoint });
      downloadText(`api_logs_${d2str(nowISO())}.json`, text);
      showToast({ tone: "success", title: "Downloaded" });
    } catch (err) { showToast({ tone: "danger", title: "Error", msg: err.message }); }
  };

  // Pagination
  const currentPagination = tab === "keys" ? keysPagination : tab === "accounts" ? accountsPagination : tab === "workspaces" ? workspacesPagination : tab === "creation_logs" ? creationLogsPagination : { page: 1, totalPages: 1 };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-black text-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
          <span className="text-gray-400">Loading data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-black text-white relative overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div className="pointer-events-none absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(250,204,21,0.18), transparent)" }} />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(163,230,53,0.10), transparent)" }} />

      <div className="mx-auto w-full max-w-[1920px] px-4 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Sidebar */}
          <aside className="lg:col-span-3">
            <div className="rounded-2xl border border-yellow-500/10 bg-neutral-900/60 p-2 ring-1 ring-yellow-500/10">
              <div className="px-3 py-2 text-xs uppercase tracking-wide text-gray-400">Navigation</div>
              <div className="space-y-1">
                {NAV.map((n) => (
                  <button key={n.key} type="button" onClick={() => setTab(n.key)}
                    className={classNames("w-full rounded-2xl px-3 py-3 text-left text-sm transition inline-flex items-center gap-3",
                      n.key === tab ? "bg-yellow-500/15 text-yellow-100 ring-1 ring-yellow-400/30" : "bg-white/5 text-gray-200 ring-1 ring-white/10 hover:bg-white/10")}>
                    <span className={n.key === tab ? "text-yellow-300" : "text-yellow-400/90"}>{n.icon}</span>
                    <span className="font-medium">{n.title}</span>
                    {n.key === "keys" && <Badge tone="info">{stats.keys?.total || 0}</Badge>}
                    {n.key === "accounts" && <Badge tone="info">{stats.accounts?.total || 0}</Badge>}
                  </button>
                ))}
              </div>

              {/* Manual button */}
              <div className="mt-3 px-2">
                <button type="button" onClick={() => { setManualDraft({ qty: 10, workspaceId: workspaces[0]?.id }); setManualResult(null); setManualProgress(0); setManualCurrentStep(""); loadManualStatus(); setManualOpen(true); }}
                  className="w-full rounded-2xl px-3 py-3 text-left text-sm inline-flex items-center gap-3 bg-white/5 text-gray-200 ring-1 ring-white/10 hover:bg-white/10">
                  <Plus className="h-5 w-5 text-yellow-400" />
                  <span className="font-medium">Manual</span>
                  <Badge tone="info">TXT</Badge>
                </button>
              </div>

              {/* Logout */}
              <div className="mt-3 px-2">
                <button type="button" onClick={onLogout}
                  className="w-full rounded-2xl px-3 py-3 text-left text-sm inline-flex items-center gap-3 bg-red-500/10 text-red-200 ring-1 ring-red-400/20 hover:bg-red-500/20">
                  <LogOut className="h-5 w-5" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="lg:col-span-9 space-y-4">
            {/* Search bar */}
            {tab !== "settings" && tab !== "api_example" && (
              <div className="rounded-2xl border border-yellow-500/10 bg-neutral-900/60 p-3 ring-1 ring-yellow-500/10">
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-12 lg:items-end">
                  <div className="lg:col-span-6">
                    <TextInput label="Search" value={q} onChange={setQ} placeholder="Search..." icon={<Search className="h-4 w-4" />}
                      right={q && <button className="rounded-xl bg-white/10 px-2 py-1 text-xs" onClick={() => setQ("")}>✕</button>} />
                  </div>

                  {tab === "accounts" && (
                    <div className="lg:col-span-3">
                      <SingleSelect label="Status" options={[{ key: "", label: "All" }, ...ACCOUNT_STATUS.map(s => ({ key: s, label: s }))]}
                        value={accStatusFilter} onChange={setAccStatusFilter} icon={<Filter className="h-4 w-4" />} />
                    </div>
                  )}

                  <div className="lg:col-span-3 flex items-end gap-2 justify-end">
                    {tab === "keys" && <button className={ACTION_BTN} onClick={openAddKey}><Plus className="h-4 w-4" /> New Key</button>}
                    {tab === "workspaces" && <button className={ACTION_BTN} onClick={openAddWs}><Plus className="h-4 w-4" /> New WS</button>}
                    {tab === "accounts" && <button className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10" onClick={downloadAccounts}><Download className="h-4 w-4 text-yellow-400" /> Download</button>}
                    {tab === "logs" && <button className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10" onClick={downloadLogs}><Download className="h-4 w-4 text-yellow-400" /> Download JSON</button>}
                    <button className="rounded-2xl bg-white/5 p-2 ring-1 ring-white/10 hover:bg-white/10" onClick={() => { if (tab === "keys") loadKeys(page); else if (tab === "accounts") loadAccounts(page); else if (tab === "workspaces") loadWorkspaces(page); else if (tab === "logs") loadApiLogs(); }}><RefreshCcw className="h-4 w-4 text-yellow-400" /></button>
                  </div>
                </div>
              </div>
            )}

            {/* Keys Table */}
            {tab === "keys" && (
              <div className="rounded-2xl border border-yellow-500/10 bg-neutral-900/60 ring-1 ring-yellow-500/10 overflow-hidden">
                <div className="overflow-auto">
                  <table className="min-w-[1000px] w-full">
                    <thead className="bg-black/30">
                      <tr className="text-left text-sm text-gray-300">
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Key</th>
                        <th className="px-4 py-3">Workspace</th>
                        <th className="px-4 py-3">Quota</th>
                        <th className="px-4 py-3">Note</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-yellow-500/10">
                      {keys.map((k) => (
                        <tr key={k.id} className="hover:bg-yellow-500/5">
                          <td className="px-4 py-3 text-sm text-gray-200">{k.keyId}</td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <code className="rounded-lg bg-black/30 px-2 py-1 text-[12px] text-gray-100 ring-1 ring-white/10">{k.key}</code>
                              <button className="rounded-xl bg-white/10 px-2 py-1 text-xs" onClick={async () => { const ok = await copyToClipboard(k.key); showToast({ tone: ok ? "success" : "danger", title: ok ? "Copied" : "Failed" }); }}><Copy className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-200">{k.workspace?.domain || "—"}</td>
                          <td className="px-4 py-3 text-sm"><Badge tone="neutral">{k.quotaUsed || 0}/{k.quotaLimit}</Badge></td>
                          <td className="px-4 py-3 text-sm text-gray-200">{k.note || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button onClick={() => downloadKeyAccounts(k.id)} className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10"><Download className="h-4 w-4 text-yellow-400" /></button>
                              <button onClick={() => openEditKey(k)} className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10"><Edit3 className="h-4 w-4" /></button>
                              <button onClick={() => { setKeyToDelete(k); setKeyDeleteOpen(true); }} className="inline-flex items-center gap-2 rounded-2xl bg-red-500/15 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/25 hover:bg-red-500/20"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!keys.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No keys found</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t border-yellow-500/10 bg-black/20">
                  <Pagination page={currentPagination.page} totalPages={currentPagination.totalPages} onPage={(p) => { setPage(p); loadKeys(p); }} />
                </div>
              </div>
            )}

            {/* Accounts Table */}
            {tab === "accounts" && (
              <div className="rounded-2xl border border-yellow-500/10 bg-neutral-900/60 ring-1 ring-yellow-500/10 overflow-hidden">
                <div className="overflow-auto">
                  <table className="min-w-[1100px] w-full">
                    <thead className="bg-black/30">
                      <tr className="text-left text-sm text-gray-300">
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Created</th>
                        <th className="px-4 py-3">Issued To</th>
                        <th className="px-4 py-3">Workspace</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Password</th>
                        <th className="px-4 py-3">Recovery</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-yellow-500/10">
                      {accounts.map((a) => (
                        <tr key={a.id} className="hover:bg-yellow-500/5">
                          <td className="px-4 py-3 text-sm"><Badge tone={a.status === "AVAILABLE" ? "success" : a.status === "ISSUED" ? "warning" : "danger"}>{a.status}</Badge></td>
                          <td className="px-4 py-3 text-sm text-gray-200">{d2str(a.createdAt)} {t2str(a.createdAt)}</td>
                          <td className="px-4 py-3 text-sm text-gray-200">{a.issuedTo || "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-200">{a.workspace?.domain || "—"}</td>
                          <td className="px-4 py-3 text-sm text-white font-medium">{a.email}</td>
                          <td className="px-4 py-3 text-sm"><code className="rounded-lg bg-black/30 px-2 py-1 text-[12px] text-gray-100 ring-1 ring-white/10">{a.password}</code></td>
                          <td className="px-4 py-3 text-sm text-gray-200">{a.recovery || "—"}</td>
                        </tr>
                      ))}
                      {!accounts.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No accounts found</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t border-yellow-500/10 bg-black/20">
                  <Pagination page={currentPagination.page} totalPages={currentPagination.totalPages} onPage={(p) => { setPage(p); loadAccounts(p); }} />
                </div>
              </div>
            )}

            {/* Workspaces Table */}
            {tab === "workspaces" && (
              <div className="rounded-2xl border border-yellow-500/10 bg-neutral-900/60 ring-1 ring-yellow-500/10 overflow-hidden">
                <div className="overflow-auto">
                  <table className="min-w-[900px] w-full">
                    <thead className="bg-black/30">
                      <tr className="text-left text-sm text-gray-300">
                        <th className="px-4 py-3">Domain</th>
                        <th className="px-4 py-3">Recovery Email</th>
                        <th className="px-4 py-3">Note</th>
                        <th className="px-4 py-3">Created 30d</th>
                        <th className="px-4 py-3">Total</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-yellow-500/10">
                      {workspaces.map((w) => (
                        <tr key={w.id} className="hover:bg-yellow-500/5">
                          <td className="px-4 py-3 text-sm text-white font-medium">{w.domain}</td>
                          <td className="px-4 py-3 text-sm text-gray-200">{w.recoveryEmail?.email || "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-200">{w.note || "—"}</td>
                          <td className="px-4 py-3 text-sm"><Badge tone={w.created30Days > 0 ? "warning" : "neutral"}>{w.created30Days || 0}</Badge></td>
                          <td className="px-4 py-3 text-sm"><Badge tone={w.createdTotal > 0 ? "info" : "neutral"}>{w.createdTotal || 0}</Badge></td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button onClick={async () => {
                                try {
                                  const result = await api.pingWorkspace(w.id);
                                  showToast({ tone: result.success ? "success" : "danger", title: result.success ? "Подключено" : "Ошибка", msg: result.message || (result.success ? `Google API работает` : "Проверьте настройки") });
                                } catch (err) { showToast({ tone: "danger", title: "Ошибка", msg: err.message }); }
                              }} className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10" title="Проверить подключение"><PlugZap className="h-4 w-4 text-yellow-400" /></button>
                              <button onClick={() => openEditWs(w)} className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10"><Edit3 className="h-4 w-4" /></button>
                              <button onClick={() => { setWsToDelete(w); setWsDeleteOpen(true); }} className="inline-flex items-center gap-2 rounded-2xl bg-red-500/15 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/25 hover:bg-red-500/20"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!workspaces.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No workspaces found</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t border-yellow-500/10 bg-black/20">
                  <Pagination page={currentPagination.page} totalPages={currentPagination.totalPages} onPage={(p) => { setPage(p); loadWorkspaces(p); }} />
                </div>
              </div>
            )}

            {/* Creation Logs Table */}
            {tab === "creation_logs" && (
              <div className="space-y-4">
                {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                  <StatCard title="Total" value={creationLogStats.total || 0} icon={<ListChecks className="h-4 w-4" />} />
                  <StatCard title="Today" value={creationLogStats.today || 0} icon={<Activity className="h-4 w-4" />} />
                  <StatCard title="Success" value={creationLogStats.success || 0} icon={<CircleCheck className="h-4 w-4" />} />
                  <StatCard title="Failed" value={creationLogStats.failed || 0} icon={<CircleX className="h-4 w-4" />} />
                  <StatCard title="Success Rate" value={`${creationLogStats.successRate || 0}%`} icon={<Activity className="h-4 w-4" />} />
                </div>

                {/* Filter */}
                <div className="rounded-2xl border border-yellow-500/10 bg-neutral-900/60 p-3 ring-1 ring-yellow-500/10">
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <SingleSelect label="Status" options={[
                        { key: "", label: "All" },
                        { key: "PENDING", label: "В очереди" },
                        { key: "CREATING", label: "Создание в Google" },
                        { key: "BROWSER_AUTH", label: "Авторизация" },
                        { key: "ADDING_RECOVERY", label: "Добавление recovery" },
                        { key: "WAITING_OTP", label: "Ожидание OTP" },
                        { key: "CONFIRMING_OTP", label: "Подтверждение OTP" },
                        { key: "SUCCESS", label: "Успешно" },
                        { key: "FAILED", label: "Ошибка" }
                      ]} value={creationLogStatusFilter} onChange={setCreationLogStatusFilter} icon={<Filter className="h-4 w-4" />} />
                    </div>
                    <button className="rounded-2xl bg-white/5 p-2 ring-1 ring-white/10 hover:bg-white/10" onClick={() => { loadCreationLogs(page); loadCreationLogStats(); }}>
                      <RefreshCcw className="h-4 w-4 text-yellow-400" />
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="rounded-2xl border border-yellow-500/10 bg-neutral-900/60 ring-1 ring-yellow-500/10 overflow-hidden">
                  <div className="overflow-auto">
                    <table className="min-w-[1000px] w-full">
                      <thead className="bg-black/30">
                        <tr className="text-left text-sm text-gray-300">
                          <th className="px-4 py-3">ID</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Step</th>
                          <th className="px-4 py-3">Workspace</th>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Duration</th>
                          <th className="px-4 py-3">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-yellow-500/10">
                        {creationLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-yellow-500/5">
                            <td className="px-4 py-3 text-sm text-gray-200">{log.logId}</td>
                            <td className="px-4 py-3 text-sm">
                              <Badge tone={log.status === "SUCCESS" ? "success" : log.status === "FAILED" ? "danger" : log.status === "PENDING" ? "neutral" : "warning"}>
                                {log.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-200">{log.currentStep || "—"}</td>
                            <td className="px-4 py-3 text-sm text-gray-200">{log.workspace?.domain || "—"}</td>
                            <td className="px-4 py-3 text-sm text-white">{log.email || "—"}</td>
                            <td className="px-4 py-3 text-sm text-gray-200">{log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                            <td className="px-4 py-3 text-sm text-gray-200">{d2str(log.createdAt)} {t2str(log.createdAt)}</td>
                          </tr>
                        ))}
                        {!creationLogs.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No creation logs found</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-3 border-t border-yellow-500/10 bg-black/20">
                    <Pagination page={currentPagination.page} totalPages={currentPagination.totalPages} onPage={(p) => { setPage(p); loadCreationLogs(p); }} />
                  </div>
                </div>
              </div>
            )}

            {/* Settings */}
            {tab === "settings" && (
              <div className="rounded-2xl border border-yellow-500/10 bg-neutral-900/60 p-5 ring-1 ring-yellow-500/10">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="inline-flex items-center gap-2 text-white font-semibold"><SlidersHorizontal className="h-5 w-5 text-yellow-400" /> Settings</h2>
                  <button onClick={saveSettings} className={ACTION_BTN}><Check className="h-4 w-4" /> Save</button>
                </div>

                {/* Stats */}
                <div className="mt-4 rounded-2xl border border-yellow-500/10 bg-black/30 p-4 ring-1 ring-yellow-500/10">
                  <div className="text-white font-semibold">Statistics</div>
                  <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-4">
                    <StatCard title="Accounts available" value={stats.accounts?.available || 0} hint={`Total: ${stats.accounts?.total || 0}`} icon={<Boxes className="h-4 w-4" />} />
                    <StatCard title="Workspaces" value={stats.workspaces?.total || 0} icon={<Users className="h-4 w-4" />} />
                    <StatCard title="Threads" value={settings.threads || 1} icon={<Activity className="h-4 w-4" />} />
                    <StatCard title="Recovery Emails" value={stats.recoveryEmails?.total || recoveryEmails.length} icon={<Mail className="h-4 w-4" />} />
                  </div>
                </div>

                {/* Recovery Emails */}
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-gray-200 font-medium">Recovery Emails</div>
                    <button onClick={openAddRec} className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10"><Plus className="h-4 w-4 text-yellow-400" /> Add</button>
                  </div>
                  <div className="mt-2 overflow-hidden rounded-2xl border border-yellow-500/10 bg-black/30 ring-1 ring-yellow-500/10">
                    <table className="w-full">
                      <thead className="bg-black/30"><tr className="text-left text-sm text-gray-300"><th className="px-4 py-3">Email</th><th className="px-4 py-3">IMAP Host</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                      <tbody className="divide-y divide-yellow-500/10">
                        {recoveryEmails.map((r) => (
                          <tr key={r.id} className="hover:bg-yellow-500/5">
                            <td className="px-4 py-3 text-sm text-white">{r.email}</td>
                            <td className="px-4 py-3 text-sm text-gray-200">{r.imapHost}:{r.imapPort}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button onClick={() => openEditRec(r)} className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10"><Edit3 className="h-4 w-4" /></button>
                                <button onClick={() => deleteRec(r.id)} className="inline-flex items-center gap-2 rounded-2xl bg-red-500/15 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/25 hover:bg-red-500/20"><Trash2 className="h-4 w-4" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!recoveryEmails.length && <tr><td colSpan={3} className="px-4 py-6 text-sm text-gray-400">No recovery emails. Click Add.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Settings Fields */}
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <TextInput label="Default Password" value={settings.defaultPassword || ""} onChange={(v) => setSettings(s => ({ ...s, defaultPassword: v }))} placeholder="Password for new accounts" icon={<LockKeyhole className="h-4 w-4" />} />
                  <TextInput label="Threads" value={String(settings.threads || 1)} onChange={(v) => setSettings(s => ({ ...s, threads: Math.max(1, Number(v) || 1) }))} placeholder="1" icon={<Activity className="h-4 w-4" />} />
                </div>

                {/* GoLogin Integration */}
                <div className="mt-4 rounded-2xl border border-green-500/10 bg-black/30 p-4 ring-1 ring-green-500/10">
                  <div className="flex items-center justify-between">
                    <div className="text-white font-semibold flex items-center gap-2">
                      <Fingerprint className="h-4 w-4 text-green-400" /> GoLogin (Antidetect Browser)
                    </div>
                    <button onClick={testGoLogin} className="px-3 py-1 text-xs rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
                      Test Connection
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Creates unique browser profiles for each account to avoid detection</p>
                  <div className="mt-3 grid grid-cols-1 gap-4">
                    <TextInput label="GoLogin API Token" value={settings.goLoginApiKey || ""} onChange={(v) => setSettings(s => ({ ...s, goLoginApiKey: v }))} placeholder="eyJhbGci..." icon={<KeyRound className="h-4 w-4" />} hint="Get from GoLogin Dashboard → Profile → API" type="password" />
                  </div>
                </div>

                {/* Webshare Proxy Integration */}
                <div className="mt-4 rounded-2xl border border-blue-500/10 bg-black/30 p-4 ring-1 ring-blue-500/10">
                  <div className="flex items-center justify-between">
                    <div className="text-white font-semibold flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-400" /> Webshare Proxy (Rotating Residential)
                    </div>
                    <button onClick={testProxy} className="px-3 py-1 text-xs rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                      Test Proxy
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Each request automatically gets a new IP address</p>
                  <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <TextInput label="Proxy Host" value={settings.proxyHost || ""} onChange={(v) => setSettings(s => ({ ...s, proxyHost: v }))} placeholder="p.webshare.io" icon={<PlugZap className="h-4 w-4" />} />
                    <TextInput label="Port" value={String(settings.proxyPort || "")} onChange={(v) => setSettings(s => ({ ...s, proxyPort: v }))} placeholder="80" icon={<Hash className="h-4 w-4" />} />
                    <TextInput label="Username" value={settings.proxyUsername || ""} onChange={(v) => setSettings(s => ({ ...s, proxyUsername: v }))} placeholder="iidwhezeresidential-rotate" icon={<User className="h-4 w-4" />} />
                    <TextInput label="Password" value={settings.proxyPassword || ""} onChange={(v) => setSettings(s => ({ ...s, proxyPassword: v }))} placeholder="password" icon={<KeyRound className="h-4 w-4" />} type="password" />
                    <div className="lg:col-span-2">
                      <label className="text-sm text-gray-400">Protocol</label>
                      <select value={settings.proxyProtocol || "socks5"} onChange={(e) => setSettings(s => ({ ...s, proxyProtocol: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-yellow-500 focus:outline-none">
                        <option value="socks5">SOCKS5</option>
                        <option value="http">HTTP</option>
                        <option value="https">HTTPS</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* API Logs */}
            {tab === "logs" && (
              <div className="rounded-2xl border border-yellow-500/10 bg-neutral-900/60 p-6 ring-1 ring-yellow-500/10">
                <div className="text-white font-semibold text-lg">API Logs</div>
                <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-neutral-900/60 ring-1 ring-yellow-500/10">
                  <table className="min-w-[1000px] w-full">
                    <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-400"><th className="px-4 py-3">ID</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Key</th><th className="px-4 py-3">Endpoint</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Latency</th></tr></thead>
                    <tbody>
                      {apiLogs.slice(0, 20).map((l) => (
                        <tr key={l.id} className="border-t border-white/10 text-sm">
                          <td className="px-4 py-3 text-gray-200">{l.logId}</td>
                          <td className="px-4 py-3 text-gray-200">{d2str(l.createdAt)} {t2str(l.createdAt)}</td>
                          <td className="px-4 py-3 text-gray-200">{l.key?.keyId || "—"}</td>
                          <td className="px-4 py-3 text-gray-200">{l.method} {l.endpoint}</td>
                          <td className="px-4 py-3"><Badge tone={l.status < 300 ? "success" : l.status < 500 ? "warning" : "danger"}>{l.status}</Badge></td>
                          <td className="px-4 py-3 text-right text-gray-200">{l.latencyMs}ms</td>
                        </tr>
                      ))}
                      {!apiLogs.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No logs found</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* API Example */}
            {tab === "api_example" && (
              <div className="space-y-6">
                {/* Header */}
                <div className="rounded-2xl border border-yellow-500/10 bg-black/30 p-6 ring-1 ring-yellow-500/10">
                  <div className="text-white font-semibold text-xl">API Documentation</div>
                  <div className="mt-2 text-sm text-gray-300">Base URL: <code className="bg-black/40 px-2 py-1 rounded text-yellow-300">http://localhost:3000/v1</code></div>
                  <div className="mt-3 text-sm text-gray-300">
                    Authentication: <code className="bg-black/40 px-2 py-1 rounded">X-API-Key: YOUR_KEY</code>
                  </div>
                </div>

                {/* Rules & Important Info */}
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 ring-1 ring-amber-500/10">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-lg">
                    <AlertTriangle className="h-5 w-5" />
                    Important Rules
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                      <div className="text-sm text-gray-200">
                        <span className="text-amber-200 font-medium">15-Minute Rule:</span> If you don't report an account as <code className="bg-black/40 px-1.5 py-0.5 rounded text-red-300">not_working</code> within 15 minutes of receiving it, the account is <span className="text-green-300 font-medium">automatically confirmed as working</span>.
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                      <div className="text-sm text-gray-200">
                        <span className="text-amber-200 font-medium">Rate Limit:</span> 100 requests per minute per API key. Headers <code className="bg-black/40 px-1.5 py-0.5 rounded">X-RateLimit-Remaining</code> and <code className="bg-black/40 px-1.5 py-0.5 rounded">X-RateLimit-Reset</code> are included in responses.
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                      <div className="text-sm text-gray-200">
                        <span className="text-amber-200 font-medium">Quota:</span> Each API key has a quota limit. Check your remaining quota with <code className="bg-black/40 px-1.5 py-0.5 rounded">GET /v1/quota</code>.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Codes */}
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 ring-1 ring-red-500/10">
                  <div className="flex items-center gap-2 text-red-300 font-semibold text-lg">
                    <CircleX className="h-5 w-5" />
                    Error Codes
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-black/30 p-3 border border-red-500/10">
                      <div className="text-2xl font-bold text-red-400">401</div>
                      <div className="text-sm text-gray-300 mt-1">Invalid or missing API key</div>
                    </div>
                    <div className="rounded-xl bg-black/30 p-3 border border-red-500/10">
                      <div className="text-2xl font-bold text-orange-400">403</div>
                      <div className="text-sm text-gray-300 mt-1">Quota exceeded</div>
                    </div>
                    <div className="rounded-xl bg-black/30 p-3 border border-red-500/10">
                      <div className="text-2xl font-bold text-yellow-400">404</div>
                      <div className="text-sm text-gray-300 mt-1">No available accounts</div>
                    </div>
                    <div className="rounded-xl bg-black/30 p-3 border border-red-500/10">
                      <div className="text-2xl font-bold text-purple-400">429</div>
                      <div className="text-sm text-gray-300 mt-1">Rate limit exceeded</div>
                    </div>
                  </div>
                </div>

                {/* API Endpoints */}
                <div className="rounded-2xl border border-yellow-500/10 bg-black/30 p-6 ring-1 ring-yellow-500/10">
                  <div className="text-white font-semibold text-lg mb-4">API Endpoints</div>

                  <div className="space-y-6">
                    {/* GET /v1/accounts */}
                    <div className="rounded-2xl border border-green-500/20 bg-neutral-900/60 p-5">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-lg bg-green-500/20 text-green-300 text-xs font-bold">GET</span>
                        <span className="text-white font-semibold text-lg">/v1/accounts</span>
                      </div>
                      <div className="mt-2 text-sm text-gray-400">Get available accounts from pool. Accounts are marked as ISSUED after retrieval.</div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Query Parameters</div>
                        <div className="text-sm text-gray-300">
                          <code className="bg-black/40 px-1.5 py-0.5 rounded">count</code> <span className="text-gray-500">(optional)</span> — Number of accounts (1-100, default: 1)
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Request Example</div>
                        <pre className="overflow-auto rounded-xl bg-black/60 p-4 text-[12px] leading-5 text-gray-100 ring-1 ring-white/10">{`curl -X GET "http://localhost:3000/v1/accounts?count=5" \\
  -H "X-API-Key: YOUR_KEY"`}</pre>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Response Example</div>
                        <pre className="overflow-auto rounded-xl bg-black/60 p-4 text-[12px] leading-5 text-green-200 ring-1 ring-green-500/20">{`{
  "success": true,
  "accounts": [
    {
      "email": "user1234567890@domain.com",
      "password": "SecurePass123!",
      "recovery": "recovery@gmail.com"
    }
  ],
  "count": 1,
  "quota": {
    "used": 15,
    "limit": 100,
    "remaining": 85
  }
}`}</pre>
                      </div>
                    </div>

                    {/* POST /v1/accounts/report */}
                    <div className="rounded-2xl border border-red-500/20 bg-neutral-900/60 p-5">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 text-xs font-bold">POST</span>
                        <span className="text-white font-semibold text-lg">/v1/accounts/report</span>
                      </div>
                      <div className="mt-2 text-sm text-gray-400">Report an account as not working. <span className="text-amber-300 font-medium">Must be done within 15 minutes!</span></div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Request Body</div>
                        <div className="text-sm text-gray-300">
                          <code className="bg-black/40 px-1.5 py-0.5 rounded">email</code> <span className="text-red-400">(required)</span> — Email of the account to report
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Request Example</div>
                        <pre className="overflow-auto rounded-xl bg-black/60 p-4 text-[12px] leading-5 text-gray-100 ring-1 ring-white/10">{`curl -X POST "http://localhost:3000/v1/accounts/report" \\
  -H "X-API-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "user1234567890@domain.com"}'`}</pre>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Response Example</div>
                        <pre className="overflow-auto rounded-xl bg-black/60 p-4 text-[12px] leading-5 text-green-200 ring-1 ring-green-500/20">{`{
  "success": true,
  "message": "Account marked as bad"
}`}</pre>
                      </div>
                    </div>

                    {/* GET /v1/quota */}
                    <div className="rounded-2xl border border-blue-500/20 bg-neutral-900/60 p-5">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 text-xs font-bold">GET</span>
                        <span className="text-white font-semibold text-lg">/v1/quota</span>
                      </div>
                      <div className="mt-2 text-sm text-gray-400">Check your current quota usage and remaining balance.</div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Request Example</div>
                        <pre className="overflow-auto rounded-xl bg-black/60 p-4 text-[12px] leading-5 text-gray-100 ring-1 ring-white/10">{`curl -X GET "http://localhost:3000/v1/quota" \\
  -H "X-API-Key: YOUR_KEY"`}</pre>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Response Example</div>
                        <pre className="overflow-auto rounded-xl bg-black/60 p-4 text-[12px] leading-5 text-green-200 ring-1 ring-green-500/20">{`{
  "keyId": "key_abc123",
  "workspace": "domain.com",
  "quota": {
    "used": 15,
    "limit": 100,
    "remaining": 85
  }
}`}</pre>
                      </div>
                    </div>

                    {/* GET /v1/accounts/history */}
                    <div className="rounded-2xl border border-purple-500/20 bg-neutral-900/60 p-5">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 text-xs font-bold">GET</span>
                        <span className="text-white font-semibold text-lg">/v1/accounts/history</span>
                      </div>
                      <div className="mt-2 text-sm text-gray-400">Get history of all accounts issued to your API key.</div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Query Parameters</div>
                        <div className="text-sm text-gray-300 space-y-1">
                          <div><code className="bg-black/40 px-1.5 py-0.5 rounded">page</code> <span className="text-gray-500">(optional)</span> — Page number (default: 1)</div>
                          <div><code className="bg-black/40 px-1.5 py-0.5 rounded">limit</code> <span className="text-gray-500">(optional)</span> — Items per page (default: 50)</div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Request Example</div>
                        <pre className="overflow-auto rounded-xl bg-black/60 p-4 text-[12px] leading-5 text-gray-100 ring-1 ring-white/10">{`curl -X GET "http://localhost:3000/v1/accounts/history?page=1&limit=10" \\
  -H "X-API-Key: YOUR_KEY"`}</pre>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Response Example</div>
                        <pre className="overflow-auto rounded-xl bg-black/60 p-4 text-[12px] leading-5 text-green-200 ring-1 ring-green-500/20">{`{
  "accounts": [
    {
      "email": "user1234567890@domain.com",
      "password": "SecurePass123!",
      "recovery": "recovery@gmail.com",
      "status": "WORKING",
      "issuedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "pages": 5
  }
}`}</pre>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Account Statuses */}
                <div className="rounded-2xl border border-yellow-500/10 bg-black/30 p-6 ring-1 ring-yellow-500/10">
                  <div className="text-white font-semibold text-lg mb-4">Account Statuses</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 text-center">
                      <div className="text-green-300 font-semibold">AVAILABLE</div>
                      <div className="text-xs text-gray-400 mt-1">Ready to issue</div>
                    </div>
                    <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-center">
                      <div className="text-blue-300 font-semibold">ISSUED</div>
                      <div className="text-xs text-gray-400 mt-1">Given to client</div>
                    </div>
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                      <div className="text-emerald-300 font-semibold">WORKING</div>
                      <div className="text-xs text-gray-400 mt-1">Confirmed OK</div>
                    </div>
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-center">
                      <div className="text-red-300 font-semibold">BAD</div>
                      <div className="text-xs text-gray-400 mt-1">Reported broken</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ======= Modals ======= */}

      {/* Manual Modal */}
      <Modal open={manualOpen} onClose={() => !manualRunning && setManualOpen(false)} closeOnOverlay={false} title="Ручная генерация аккаунтов" icon={<Plus className="h-5 w-5 text-yellow-300" />} size="xl"
        footer={<>
          <button onClick={() => setManualOpen(false)} className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10" disabled={manualRunning}>Закрыть</button>
          {manualRunning ? (
            <button onClick={manualStop} className="inline-flex items-center gap-2 rounded-2xl bg-red-500/20 px-4 py-2 text-sm font-medium text-red-200 ring-1 ring-red-400/30 hover:bg-red-500/30"><CircleX className="h-4 w-4" /> Остановить</button>
          ) : (
            <button onClick={manualGenerate} className={ACTION_BTN}><Check className="h-4 w-4" /> Запустить</button>
          )}
          <button onClick={() => manualResult && downloadText(manualResult.filename, manualResult.text)} className={classNames("inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium ring-1", manualResult ? ACTION_BTN : "bg-white/5 text-gray-400 ring-white/10 cursor-not-allowed")} disabled={!manualResult}><Download className="h-4 w-4" /> Скачать TXT</button>
        </>}>

        {/* Service Status */}
        {manualStatus && (
          <div className="mb-4 rounded-2xl border border-yellow-500/10 bg-black/30 p-4 ring-1 ring-yellow-500/10">
            <div className="text-sm font-medium text-white mb-3">Статус сервисов</div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="flex items-center gap-2">
                {manualStatus.status?.googleApi ? <CircleCheck className="h-4 w-4 text-green-400" /> : <CircleX className="h-4 w-4 text-red-400" />}
                <span className="text-sm text-gray-200">Google API</span>
              </div>
              <div className="flex items-center gap-2">
                {manualStatus.status?.proxyApi ? <CircleCheck className="h-4 w-4 text-green-400" /> : <AlertTriangle className="h-4 w-4 text-yellow-400" />}
                <span className="text-sm text-gray-200">Proxy API</span>
              </div>
              <div className="flex items-center gap-2">
                {manualStatus.status?.goLoginApi ? <CircleCheck className="h-4 w-4 text-green-400" /> : <AlertTriangle className="h-4 w-4 text-yellow-400" />}
                <span className="text-sm text-gray-200">GoLogin API</span>
              </div>
              <div className="flex items-center gap-2">
                {manualStatus.status?.redis ? <CircleCheck className="h-4 w-4 text-green-400" /> : <AlertTriangle className="h-4 w-4 text-yellow-400" />}
                <span className="text-sm text-gray-200">Redis Queue</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone={manualStatus.mode === 'full' ? 'success' : 'warning'}>
                {manualStatus.mode === 'full' ? 'Полный режим (7 шагов)' : 'Простой режим (только Google API)'}
              </Badge>
              <span className="text-xs text-gray-400">Потоков: {manualStatus.status?.threads || 1}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextInput label="Количество" type="number" value={manualDraft.qty} onChange={(v) => setManualDraft(d => ({ ...d, qty: v }))} placeholder="10" icon={<Boxes className="h-4 w-4" />} hint="Лимит: 1-500" disabled={manualRunning} />
          <SingleSelect label="Workspace" options={workspaces.map(w => ({ key: w.id, label: `${w.domain}` }))} value={manualDraft.workspaceId} onChange={(v) => setManualDraft(d => ({ ...d, workspaceId: v }))} icon={<Users className="h-4 w-4" />} />
        </div>

        {/* Progress Section */}
        <div className="mt-4 rounded-2xl border border-yellow-500/10 bg-black/30 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-200">Прогресс</span>
            <span className="text-gray-300">{manualProgress}%</span>
          </div>
          <div className="mt-2 h-3 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-yellow-500 to-amber-600 transition-all duration-300" style={{ width: `${manualProgress}%` }} />
          </div>

          {/* Current Step */}
          {manualCurrentStep && (
            <div className="mt-3 flex items-center gap-2">
              {manualRunning && <div className="h-4 w-4 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />}
              <span className="text-sm text-yellow-200">{manualCurrentStep}</span>
            </div>
          )}

          {/* Stats */}
          <div className="mt-3 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-green-400" />
              <span className="text-sm text-gray-200">Создано: <b className="text-green-300">{manualCreated}</b></span>
            </div>
            <div className="flex items-center gap-2">
              <CircleX className="h-4 w-4 text-red-400" />
              <span className="text-sm text-gray-200">Ошибок: <b className="text-red-300">{manualFailed}</b></span>
            </div>
          </div>

          {/* Result Info */}
          {!manualRunning && manualResult && (
            <div className="mt-3 rounded-xl bg-green-500/10 border border-green-400/20 p-3">
              <div className="flex items-center gap-2 text-green-200">
                <CircleCheck className="h-5 w-5" />
                <span className="font-medium">Готово! Создано {manualResult.count} аккаунтов</span>
              </div>
              <div className="mt-1 text-xs text-green-300/70">Нажмите "Скачать TXT" для загрузки файла</div>
            </div>
          )}

          {/* Hint */}
          {!manualRunning && !manualResult && (
            <div className="mt-2 text-xs text-gray-400">Нажмите "Запустить" для начала генерации</div>
          )}
        </div>
      </Modal>

      {/* Key Modal */}
      <Modal open={keyModalOpen} onClose={() => setKeyModalOpen(false)} title={keyEdit?.id ? "Edit Key" : "Create Key"} icon={<KeyRound className="h-5 w-5 text-yellow-300" />} size="lg"
        footer={<>
          <button onClick={() => setKeyModalOpen(false)} className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10">Cancel</button>
          <button onClick={saveKey} className={ACTION_BTN}><Check className="h-4 w-4" /> Save</button>
        </>}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextInput label="Key" value={keyEdit?.key || ""} onChange={(v) => setKeyEdit(d => ({ ...d, key: v }))} placeholder="Auto-generated" icon={<KeyRound className="h-4 w-4" />} disabled={!!keyEdit?.id}
            right={!keyEdit?.id && <button className="rounded-xl bg-white/10 px-2 py-1 text-xs" onClick={() => setKeyEdit(d => ({ ...d, key: genKey() }))}>New</button>} />
          <SingleSelect label="Workspace" options={[{ key: null, label: "—" }, ...workspaces.map(w => ({ key: w.id, label: w.domain }))]} value={keyEdit?.workspaceId} onChange={(v) => setKeyEdit(d => ({ ...d, workspaceId: v }))} icon={<Users className="h-4 w-4" />} />
          <TextInput label="Quota Limit" type="number" value={keyEdit?.quotaLimit ?? 100} onChange={(v) => setKeyEdit(d => ({ ...d, quotaLimit: v }))} placeholder="100" icon={<Shield className="h-4 w-4" />} />
          <div className="lg:col-span-2"><TextArea label="Note" value={keyEdit?.note || ""} onChange={(v) => setKeyEdit(d => ({ ...d, note: v }))} placeholder="Notes..." /></div>
        </div>
      </Modal>

      {/* Key Delete */}
      <Modal open={keyDeleteOpen} onClose={() => setKeyDeleteOpen(false)} title="Delete Key?" icon={<Trash2 className="h-5 w-5 text-yellow-300" />}
        footer={<>
          <button onClick={() => setKeyDeleteOpen(false)} className="rounded-xl bg-white/10 px-4 py-2 text-gray-200">Cancel</button>
          <button onClick={confirmDeleteKey} className="rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-4 py-2 font-medium text-white">Delete</button>
        </>}>
        <div className="text-sm text-gray-200">Delete key <b>{keyToDelete?.keyId}</b>? This cannot be undone.</div>
      </Modal>

      {/* Workspace Modal */}
      <Modal open={wsModalOpen} onClose={() => setWsModalOpen(false)} title={wsEdit?.id ? "Edit Workspace" : "Create Workspace"} icon={<Users className="h-5 w-5 text-yellow-300" />} size="lg"
        footer={<>
          <button onClick={() => setWsModalOpen(false)} className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10">Cancel</button>
          <button onClick={saveWs} className={ACTION_BTN}><Check className="h-4 w-4" /> Save</button>
        </>}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextInput label="Domain" value={wsEdit?.domain || ""} onChange={(v) => setWsEdit(d => ({ ...d, domain: v }))} placeholder="example.com" icon={<Users className="h-4 w-4" />} readOnly={!!wsEdit?.id} />
          <TextInput label="Admin Email" value={wsEdit?.adminEmail || ""} onChange={(v) => setWsEdit(d => ({ ...d, adminEmail: v }))} placeholder="admin@example.com" icon={<Mail className="h-4 w-4" />} />
          <SingleSelect label="Recovery Email" options={[{ key: null, label: "—" }, ...recoveryEmails.map(r => ({ key: r.id, label: r.email }))]} value={wsEdit?.recoveryEmailId} onChange={(v) => setWsEdit(d => ({ ...d, recoveryEmailId: v }))} icon={<Mail className="h-4 w-4" />} />
          <div className="lg:col-span-2"><TextArea label="Service Account JSON" value={wsEdit?.serviceAccountJson || ""} onChange={(v) => setWsEdit(d => ({ ...d, serviceAccountJson: v }))} placeholder="Paste service account JSON..." /></div>
          <div className="lg:col-span-2"><TextArea label="Note" value={wsEdit?.note || ""} onChange={(v) => setWsEdit(d => ({ ...d, note: v }))} placeholder="Notes..." /></div>
        </div>
      </Modal>

      {/* Workspace Delete */}
      <Modal open={wsDeleteOpen} onClose={() => setWsDeleteOpen(false)} title="Delete Workspace?" icon={<Trash2 className="h-5 w-5 text-yellow-300" />}
        footer={<>
          <button onClick={() => setWsDeleteOpen(false)} className="rounded-xl bg-white/10 px-4 py-2 text-gray-200">Cancel</button>
          <button onClick={confirmDeleteWs} className="rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-4 py-2 font-medium text-white">Delete</button>
        </>}>
        <div className="text-sm text-gray-200">Delete workspace <b>{wsToDelete?.domain}</b>? This cannot be undone.</div>
      </Modal>

      {/* Recovery Email Modal */}
      <Modal open={recModalOpen} onClose={() => setRecModalOpen(false)} title={recEdit ? "Edit Recovery Email" : "Add Recovery Email"} icon={<Mail className="h-5 w-5 text-yellow-300" />} size="lg"
        footer={<>
          <button onClick={() => setRecModalOpen(false)} className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10">Cancel</button>
          <button onClick={saveRec} className={ACTION_BTN}><Check className="h-4 w-4" /> Save</button>
        </>}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextInput label="Email" value={recDraft.email} onChange={(v) => setRecDraft(d => ({ ...d, email: v }))} placeholder="recovery@gmail.com" icon={<Mail className="h-4 w-4" />} />
          <TextInput label="IMAP Host" value={recDraft.imapHost} onChange={(v) => setRecDraft(d => ({ ...d, imapHost: v }))} placeholder="imap.gmail.com" />
          <TextInput label="IMAP Port" type="number" value={recDraft.imapPort} onChange={(v) => setRecDraft(d => ({ ...d, imapPort: Number(v) }))} placeholder="993" />
          <TextInput label="IMAP User" value={recDraft.imapUser} onChange={(v) => setRecDraft(d => ({ ...d, imapUser: v }))} placeholder="user@gmail.com" />
          <TextInput label="IMAP Password" type="password" value={recDraft.imapPass} onChange={(v) => setRecDraft(d => ({ ...d, imapPass: v }))} placeholder="App password" />
        </div>
      </Modal>

      <Toast toast={toast} clear={() => setToast(null)} />
    </div>
  );
}
