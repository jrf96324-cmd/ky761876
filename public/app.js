const state = { data: { vehicles: [], trips: [], updatedAt: null }, editing: null, saveTimer: null };
const $ = (selector) => document.querySelector(selector);
const els = {
  syncState: $("#syncState"), todayCount: $("#todayCount"), pendingCount: $("#pendingCount"), vehicleCount: $("#vehicleCount"), seatCount: $("#seatCount"), lastUpdated: $("#lastUpdated"),
  vehicleList: $("#vehicleList"), tripTable: $("#tripTable"), activityFilter: $("#activityFilter"), dateFilter: $("#dateFilter"), searchInput: $("#searchInput"), statusFilter: $("#statusFilter"),
  refreshBtn: $("#refreshBtn"), exportBtn: $("#exportBtn"), copyLineBtn: $("#copyLineBtn"), logoutBtn: $("#logoutBtn"), addVehicleBtn: $("#addVehicleBtn"), addTripBtn: $("#addTripBtn"),
  dialog: $("#editorDialog"), dialogTitle: $("#dialogTitle"), form: $("#editorForm"), fields: $("#formFields"), deleteBtn: $("#deleteBtn"), closeDialogBtn: $("#closeDialogBtn"), cancelBtn: $("#cancelBtn"),
  lineDialog: $("#lineDialog"), lineText: $("#lineText"), closeLineDialogBtn: $("#closeLineDialogBtn"), closeLineBtn: $("#closeLineBtn"), copyLineTextBtn: $("#copyLineTextBtn")
};
const STATUS_PENDING = "待確認";
const statusClass = { "待確認": "pending", "已確認": "confirmed", "已完成": "done", "取消": "cancelled" };
const vehicleFields = [
  { key: "plate", label: "車牌 / 車名", type: "text", required: true },
  { key: "driver", label: "司機姓名", type: "text", required: true },
  { key: "seats", label: "可坐人數", type: "number", min: 1 },
  { key: "note", label: "備註", type: "textarea", full: true }
];
function tripFields() {
  return [
    { key: "activity", label: "活動", type: "text", required: true, full: true },
    { key: "date", label: "日期", type: "date", required: true },
    { key: "time", label: "時間", type: "time", required: true },
    { key: "route", label: "路線", type: "text", required: true, full: true },
    { key: "vehicleId", label: "車輛 / 司機", type: "select", options: [["", "未指定"], ...state.data.vehicles.map((v) => [v.id, `${v.plate} / ${v.driver}`])] },
    { key: "status", label: "狀態", type: "select", options: ["待確認", "已確認", "已完成", "取消"].map((x) => [x, x]) },
    { key: "passengers", label: "乘車道親", type: "textarea", full: true },
    { key: "note", label: "備註", type: "textarea", full: true }
  ];
}
function setSync(text) { els.syncState.textContent = text; }
function normalizeTrip(trip) {
  return { id: trip.id || crypto.randomUUID(), activity: trip.activity || "未分類活動", date: trip.date || new Date().toISOString().slice(0, 10), time: trip.time || "07:30", route: trip.route || "", vehicleId: trip.vehicleId || "", passengers: trip.passengers || "", status: trip.status || STATUS_PENDING, note: trip.note || "" };
}
function createBlankTrip(overrides = {}) { return normalizeTrip({ id: crypto.randomUUID(), activity: "", date: new Date().toISOString().slice(0, 10), time: "07:30", route: "", vehicleId: "", passengers: "", status: STATUS_PENDING, note: "", ...overrides }); }
function findVehicle(id) { return state.data.vehicles.find((vehicle) => vehicle.id === id); }
async function loadData() {
  setSync("讀取中");
  const res = await fetch("/api/arrangements", { cache: "no-store" });
  if (res.status === 401) { location.href = "/login.html"; return; }
  state.data = await res.json();
  state.data.vehicles ??= [];
  state.data.trips = (state.data.trips || []).map(normalizeTrip);
  render();
  setSync("已同步");
}
async function saveData() {
  setSync("儲存中");
  const res = await fetch("/api/arrangements", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state.data) });
  if (res.status === 401) { location.href = "/login.html"; return; }
  state.data = await res.json();
  state.data.trips = (state.data.trips || []).map(normalizeTrip);
  render();
  setSync("已儲存");
}
function scheduleSave() { clearTimeout(state.saveTimer); state.saveTimer = setTimeout(saveData, 180); }
async function logout() { await fetch("/api/logout", { method: "POST" }); location.href = "/login.html"; }
function renderSummary() {
  const today = new Date().toISOString().slice(0, 10);
  els.todayCount.textContent = state.data.trips.filter((t) => t.date === today).length;
  els.pendingCount.textContent = state.data.trips.filter((t) => t.status === STATUS_PENDING).length;
  els.vehicleCount.textContent = state.data.vehicles.length;
  els.seatCount.textContent = state.data.vehicles.reduce((sum, v) => sum + Number(v.seats || 0), 0);
  els.lastUpdated.textContent = state.data.updatedAt ? `最後更新：${new Date(state.data.updatedAt).toLocaleString("zh-TW")}` : "尚未同步";
}
function renderVehicles() {
  if (!state.data.vehicles.length) { els.vehicleList.innerHTML = '<div class="empty">尚未建立車輛資料</div>'; return; }
  els.vehicleList.innerHTML = state.data.vehicles.map((v) => `<button class="vehicle-card" type="button" data-edit-vehicle="${escAttr(v.id)}"><strong>${esc(v.plate)} / ${esc(v.driver)}</strong><span>${Number(v.seats || 0)} 位</span>${v.note ? `<span>${esc(v.note)}</span>` : ""}</button>`).join("");
}
function getVisibleTrips() {
  const activity = els.activityFilter.value.trim().toLowerCase();
  const date = els.dateFilter.value;
  const search = els.searchInput.value.trim().toLowerCase();
  const status = els.statusFilter.value;
  return [...state.data.trips].map(normalizeTrip)
    .sort((a, b) => `${a.activity} ${a.date} ${a.time}`.localeCompare(`${b.activity} ${b.date} ${b.time}`, "zh-Hant"))
    .filter((t) => !activity || t.activity.toLowerCase().includes(activity))
    .filter((t) => !date || t.date === date)
    .filter((t) => !status || t.status === status)
    .filter((t) => {
      const v = findVehicle(t.vehicleId);
      return !search || [t.activity, t.date, t.time, t.route, t.passengers, t.note, t.status, v?.plate, v?.driver].join(" ").toLowerCase().includes(search);
    });
}
function getAllTripsForAnnouncement() { return [...state.data.trips].map(normalizeTrip).sort((a, b) => `${a.activity} ${a.date} ${a.time}`.localeCompare(`${b.activity} ${b.date} ${b.time}`, "zh-Hant")); }
function renderTrips() {
  const trips = getVisibleTrips();
  if (!trips.length) { els.tripTable.innerHTML = '<tr><td colspan="9" class="empty">沒有符合條件的趟次</td></tr>'; return; }
  let currentGroup = "";
  els.tripTable.innerHTML = trips.map((trip) => {
    const group = `${trip.activity}｜${trip.date}`;
    const groupRow = group === currentGroup ? "" : `<tr class="group-row"><td colspan="9"><button class="group-title" type="button" data-add-group="${escAttr(trip.activity)}" data-group-date="${escAttr(trip.date)}">${esc(trip.activity)}｜${esc(trip.date)}</button><span class="group-hint">點活動名新增同活動同日期車輛</span></td></tr>`;
    currentGroup = group;
    const v = findVehicle(trip.vehicleId);
    const vehicleText = v ? `${esc(v.plate)}<br><small>${esc(v.driver)}</small>` : "未指定";
    return groupRow + `<tr><td>${esc(trip.activity)}</td><td>${esc(trip.date)}</td><td>${esc(trip.time)}</td><td>${esc(trip.route)}</td><td>${vehicleText}</td><td>${esc(trip.passengers)}</td><td><span class="status ${statusClass[trip.status] || "pending"}">${esc(trip.status)}</span></td><td>${esc(trip.note)}</td><td class="row-actions"><button class="edit-link" type="button" data-copy-trip="${escAttr(trip.id)}">複製</button><button class="edit-link" type="button" data-edit-trip="${escAttr(trip.id)}">編輯</button></td></tr>`;
  }).join("");
}
function render() { renderSummary(); renderVehicles(); renderTrips(); }
function openEditor(type, id = null, template = null) {
  const collection = type === "vehicle" ? "vehicles" : "trips";
  const fields = type === "vehicle" ? vehicleFields : tripFields();
  const existing = id ? state.data[collection].find((entry) => entry.id === id) : null;
  const item = (existing && type === "trip" ? normalizeTrip(existing) : existing) || template || (type === "vehicle" ? { id: crypto.randomUUID(), plate: "", driver: "", seats: 4, note: "" } : createBlankTrip());
  state.editing = { type, id: item.id, isNew: !existing };
  els.dialogTitle.textContent = `${existing ? "編輯" : "新增"}${type === "vehicle" ? "車輛" : "趟次"}`;
  els.deleteBtn.hidden = !existing;
  els.fields.innerHTML = fields.map((field) => renderField(field, item[field.key] ?? "")).join("");
  els.dialog.showModal();
}
function renderField(field, value) {
  const common = `name="${field.key}" id="field-${field.key}" ${field.required ? "required" : ""}`;
  let input = "";
  if (field.type === "textarea") input = `<textarea ${common}>${esc(value)}</textarea>`;
  else if (field.type === "select") input = `<select ${common}>${field.options.map(([val, label]) => `<option value="${escAttr(val)}" ${String(value) === String(val) ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
  else input = `<input ${common} type="${field.type}" value="${escAttr(value)}" ${field.min ? `min="${field.min}"` : ""} />`;
  return `<div class="field ${field.full ? "full" : ""}"><label for="field-${field.key}">${field.label}</label>${input}</div>`;
}
function closeDialog() { state.editing = null; els.dialog.close(); }
function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(els.form);
  const { type, id, isNew } = state.editing;
  const collection = type === "vehicle" ? "vehicles" : "trips";
  const next = { id };
  for (const [key, value] of formData.entries()) next[key] = key === "seats" ? Number(value || 0) : String(value).trim();
  if (type === "trip") Object.assign(next, normalizeTrip(next));
  if (isNew) state.data[collection].push(next);
  else state.data[collection] = state.data[collection].map((item) => item.id === id ? next : item);
  closeDialog(); render(); scheduleSave();
}
function deleteEditing() {
  const { type, id } = state.editing;
  if (type === "vehicle") {
    state.data.vehicles = state.data.vehicles.filter((v) => v.id !== id);
    state.data.trips = state.data.trips.map((t) => t.vehicleId === id ? { ...t, vehicleId: "" } : t);
  } else state.data.trips = state.data.trips.filter((t) => t.id !== id);
  closeDialog(); render(); scheduleSave();
}
function openGroupTrip(activity, date) {
  const base = state.data.trips.find((t) => normalizeTrip(t).activity === activity && normalizeTrip(t).date === date);
  openEditor("trip", null, createBlankTrip({ activity, date, time: base?.time || "07:30", route: base?.route || "", note: base?.note || "" }));
}
function copyTrip(id) { const base = state.data.trips.find((t) => t.id === id); if (base) openEditor("trip", null, createBlankTrip({ ...base, id: crypto.randomUUID(), status: STATUS_PENDING })); }
function exportCsv() {
  const rows = [["活動", "日期", "時間", "路線", "車牌", "司機", "乘車道親", "狀態", "備註"]];
  getVisibleTrips().forEach((t) => { const v = findVehicle(t.vehicleId) || {}; rows.push([t.activity, t.date, t.time, t.route, v.plate, v.driver, t.passengers, t.status, t.note]); });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `全道親車輛安排-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
}
async function copyLineAnnouncement() {
  let trips = getVisibleTrips(); let usedAllTrips = false;
  if (!trips.length && state.data.trips.length) { trips = getAllTripsForAnnouncement(); usedAllTrips = true; }
  if (!trips.length) { setSync("無資料"); return; }
  const lines = ["全道親車輛安排狀況", `更新時間：${new Date().toLocaleString("zh-TW")}`, ""];
  if (usedAllTrips) lines.push("目前篩選無資料，以下為全部趟次。", "");
  let currentGroup = ""; let groupIndex = 0;
  trips.forEach((t) => {
    const v = findVehicle(t.vehicleId); const group = `${t.activity}｜${t.date}`;
    if (group !== currentGroup) { if (currentGroup) lines.push(""); lines.push(`【活動：${t.activity}】`); lines.push(`日期：${t.date}`); currentGroup = group; groupIndex = 0; }
    groupIndex += 1;
    lines.push(`${groupIndex}. ${t.time}　${t.route || "未填路線"}`);
    lines.push(`車輛司機：${v ? `${v.plate} / ${v.driver}` : "未指定"}`);
    lines.push(`道親：${t.passengers || "未填"}`); lines.push(`狀態：${t.status}`); if (t.note) lines.push(`備註：${t.note}`); lines.push("");
  });
  const text = lines.join("\n").trim(); els.lineText.value = text;
  try { await navigator.clipboard.writeText(text); setSync(usedAllTrips ? "已複製全部" : "已複製"); } catch { setSync(fallbackCopy(text) ? "已複製" : "請手動複製"); }
  els.lineDialog.showModal(); els.lineText.focus(); els.lineText.select();
}
function fallbackCopy(text) { const textarea = document.createElement("textarea"); textarea.value = text; textarea.style.position = "fixed"; textarea.style.opacity = "0"; document.body.append(textarea); textarea.select(); const copied = document.execCommand("copy"); textarea.remove(); return copied; }
async function copyLineDialogText() { try { await navigator.clipboard.writeText(els.lineText.value); setSync("已複製"); } catch { setSync(fallbackCopy(els.lineText.value) ? "已複製" : "請手動複製"); } }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]); }
function escAttr(value) { return esc(value).replace(/`/g, "&#096;"); }
els.addVehicleBtn.addEventListener("click", () => openEditor("vehicle"));
els.addTripBtn.addEventListener("click", () => openEditor("trip"));
els.refreshBtn.addEventListener("click", loadData); els.exportBtn.addEventListener("click", exportCsv); els.copyLineBtn.addEventListener("click", copyLineAnnouncement); els.logoutBtn.addEventListener("click", logout);
els.activityFilter.addEventListener("input", renderTrips); els.dateFilter.addEventListener("change", renderTrips); els.searchInput.addEventListener("input", renderTrips); els.statusFilter.addEventListener("change", renderTrips);
els.form.addEventListener("submit", handleSubmit); els.deleteBtn.addEventListener("click", deleteEditing); els.closeDialogBtn.addEventListener("click", closeDialog); els.cancelBtn.addEventListener("click", closeDialog);
els.closeLineDialogBtn.addEventListener("click", () => els.lineDialog.close()); els.closeLineBtn.addEventListener("click", () => els.lineDialog.close()); els.copyLineTextBtn.addEventListener("click", copyLineDialogText);
document.addEventListener("click", (event) => {
  const vehicleButton = event.target.closest("[data-edit-vehicle]"); const tripButton = event.target.closest("[data-edit-trip]"); const copyButton = event.target.closest("[data-copy-trip]"); const groupButton = event.target.closest("[data-add-group]");
  if (vehicleButton) openEditor("vehicle", vehicleButton.dataset.editVehicle);
  if (tripButton) openEditor("trip", tripButton.dataset.editTrip);
  if (copyButton) copyTrip(copyButton.dataset.copyTrip);
  if (groupButton) openGroupTrip(groupButton.dataset.addGroup, groupButton.dataset.groupDate);
});
loadData().catch((error) => { setSync("錯誤"); console.error(error); });
