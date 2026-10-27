// ===== CẤU HÌNH: URL Web App của Apps Script (kết thúc /exec) =====
const API_URL = 'https://script.google.com/macros/s/AKfycbxWzYaiYmEQiVrl4oNgFCBBxOHUnX8_nIZK396IrXbFDx-H0sz-BAhhozyo14wrWLAs/exec';
function getUrl() { return API_URL; }

let DATA = null, CUR = null;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function msg(t, cls) { $('msg').className = cls || ''; $('msg').textContent = t || ''; }

// ===== MÃ TRUY CẬP (khớp Script Property WEB_KEY) =====
function getKey(reset) {
  let k = localStorage.getItem('web_key');
  if (!k || reset) {
    const input = prompt('Nhập mã truy cập (WEB_KEY):');
    if (input !== null) { // bấm Hủy thì giữ nguyên mã cũ, không ghi đè bằng chuỗi rỗng
      k = input.trim();
      localStorage.setItem('web_key', k);
    }
  }
  return k || '';
}

// ===== JSONP (tự thử lại khi lỗi kết nối) =====
let _n = 0;
function apiOnce(params, timeoutMs) {
  return new Promise(function (resolve, reject) {
    let url, key;
    try { url = getUrl(); key = getKey(); } catch (e) { reject(e); return; }
    const cb = '__cb' + (++_n) + '_' + Date.now();
    const q = new URLSearchParams(Object.assign({ key: key, callback: cb }, params));
    const script = document.createElement('script');
    let done = false, timer;
    const clean = function () { done = true; delete window[cb]; script.remove(); clearTimeout(timer); };
    window[cb] = function (data) { clean(); data && data.ok ? resolve(data) : reject(new Error((data && data.error) || 'Lỗi không xác định')); };
    script.onerror = function () {
      if (!done) {
        clean();
        const e = new Error('Không kết nối được tới máy chủ (Google hoặc mạng đang chập chờn). Thử lại sau ít giây; nếu vẫn lỗi, mở trang bằng cửa sổ ẩn danh.');
        e.net = true;
        reject(e);
      }
    };
    timer = setTimeout(function () { if (!done) { clean(); reject(new Error('Hết thời gian chờ')); } }, timeoutMs || 120000);
    script.src = url + '?' + q.toString();
    document.body.appendChild(script);
  });
}

function api(params, timeoutMs, tries) {
  tries = tries == null ? 2 : tries; // thử lại tối đa 2 lần
  return apiOnce(params, timeoutMs).catch(function (e) {
    if (e.net && tries > 0) {
      msg('Kết nối chập chờn, đang thử lại...');
      return new Promise(function (r) { setTimeout(r, 1500); })
        .then(function () { return api(params, timeoutMs, tries - 1); });
    }
    throw e;
  });
}

// ===== NGÀY: hiện dd/mm/yyyy, tính theo giờ Việt Nam =====
function vnToday() { // dd/mm/yyyy theo giờ VN, bất kể máy để múi giờ nào
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
}
function isoDate() { // dd/mm/yyyy -> yyyy-mm-dd cho server, rỗng nếu gõ sai
  const m = $('date').value.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '';
}

// ===== KHỞI TẠO =====
$('date').value = vnToday();

let ROUTES = [];
const routeText = r => r.code + (r.name ? ' — ' + r.name : '');

function loadRoutes() {
  api({ action: 'routes' }).then(function (res) {
    const favSet = new Set(res.fav);
    // tuyến "Hay dùng" lên đầu danh sách gợi ý
    ROUTES = res.routes.filter(r => favSet.has(r.code)).concat(res.routes.filter(r => !favSet.has(r.code)));
    $('routeList').innerHTML = ROUTES.map(r => '<option value="' + esc(routeText(r)) + '"></option>').join('');
    const last = localStorage.getItem('last_route');
    if (last && !$('route').value) $('route').value = last;
    $('route').placeholder = 'Nhập số tuyến (vd: 30, 01, 60-1) hoặc chọn từ danh sách';
    msg('');
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); });
}
loadRoutes();

// Đổi chữ người dùng gõ thành tuyến: khớp đúng cả dòng, hoặc đúng mã tuyến (gõ "1" cũng ra "01"), hoặc chỉ có 1 tuyến chứa chữ đó
function findRoute(text) {
  const v = String(text || '').trim().toLowerCase();
  if (!v || !ROUTES.length) return null;
  const nz = x => String(x).toLowerCase().replace(/^0+(?=\d)/, '');
  let r = ROUTES.find(x => routeText(x).toLowerCase() === v) ||
          ROUTES.find(x => x.code.toLowerCase() === v) ||
          ROUTES.find(x => nz(x.code) === nz(v));
  if (!r) {
    const m = ROUTES.filter(x => routeText(x).toLowerCase().indexOf(v) !== -1);
    if (m.length === 1) r = m[0];
  }
  return r || null;
}
function sel() {
  const r = findRoute($('route').value);
  if (!r) return {};
  localStorage.setItem('last_route', routeText(r));
  return { id: String(r.id), code: r.code };
}

$('route').onfocus = function () { this.select(); }; // bấm vào ô là bôi đen sẵn, gõ đè luôn
$('route').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btnLoad').click(); } };
$('date').onfocus = function () { this.select(); };
$('date').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btnLoad').click(); } };

$('btnKey').onclick = function () { getKey(true); loadRoutes(); };

$('btnLoad').onclick = function () {
  const s = sel(); if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy), hoặc danh sách tuyến chưa tải xong. Bấm "🔑 Đổi mã" nếu sai mã.', 'err'); return; }
  $('btnLoad').disabled = true; msg('Đang tải...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'load', routeId: s.id, label: s.code, date: isoDate() }).then(function (res) {
    DATA = res; CUR = s; MODE = 'trips'; $('btnCopy').style.display = 'none'; msg('✅ Tuyến ' + s.code + ' — ' + $('date').value, 'ok'); render();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnLoad').disabled = false; });
};

$('q').oninput = $('onlyWarn').onchange = function () { rerender(); };

// ===== SO SÁNH EBMS =====
let EB = null, MODE = 'trips';
let NV = null;
let LV = null;
let ED = null;
let BT = null;
let GP = null;
function rerender() {
  if (MODE === 'ebms' && EB) renderEbms();
  else if (MODE === 'nv' && NV) renderNv();
  else if (MODE === 'lvc' && LV) renderLvc();
  else if (MODE === 'edit' && ED) renderEdit();
  else if (MODE === 'auto') { if (AU) renderAuto(); }
  else if (MODE === 'bt' && BT) renderBt();
  else if (MODE === 'gps' && GP) renderGps();
  else if (DATA) render();
}

function catOf(loai) {
  loai = String(loai || '');
  if (loai.includes('KHỚP')) return 'ok';
  if (loai.includes('LỆCH GIỜ KẾ HOẠCH')) return 'plan';
  if (loai.includes('LỆCH')) return 'warn';
  if (loai.includes('KHÔNG CÓ PHÂN CÔNG')) return 'nopc';
  if (loai.includes('THIẾU EBMS')) return 'noebms';
  return '';
}

$('btnEbms').onclick = function () {
  const s = sel(); if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy), hoặc danh sách tuyến chưa tải xong. Bấm "🔑 Đổi mã" nếu sai mã.', 'err'); return; }
  $('btnEbms').disabled = true; msg('Đang đăng nhập EBMS và so sánh (có thể mất 20-40 giây)...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'ebms', routeId: s.id, label: s.code, date: isoDate() }, 180000).then(function (res) {
    if (!res.results) throw new Error('Server chưa có action "ebms". Thêm dòng router vào Web.gs, dán Ebms.gs, rồi Deploy lại BẢN MỚI.');
    EB = res; MODE = 'ebms'; $('btnCopy').style.display = 'none';
    msg('✅ So sánh EBMS tuyến ' + s.code + ' — ngày ' + res.ngay + ' (PC: ' + res.pcCount + ' chuyến, EBMS: ' + res.ebmsCount + ' chuyến)', 'ok');
    renderEbms();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnEbms').disabled = false; });
};

function renderEbms() {
  const cnt = { ok: 0, warn: 0, plan: 0, nopc: 0, noebms: 0 };
  EB.results.forEach(function (r) { const c = catOf(r.loai); if (cnt[c] != null) cnt[c]++; });
  $('stats').innerHTML = [['Tổng dòng', EB.results.length, ''], ['Khớp', cnt.ok, 'e-ok'], ['Lệch giờ', cnt.warn + cnt.plan, 'e-warn'],
    ['Thiếu phân công', cnt.nopc, 'e-nopc'], ['Thiếu EBMS', cnt.noebms, 'e-noebms']]
    .map(x => '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');

  const q = $('q').value.trim().toLowerCase(), only = $('onlyWarn').checked;
  let html = '';
  EB.results.forEach(function (r) {
    const c = catOf(r.loai);
    if (only && c === 'ok') return;
    const f = [r.loai, r.khDi, r.khDen, r.khXe, r.thXe, r.thDi, r.thDen, r.benDau, r.trangThaiEBMS, r.lichChayPC, r.xePC, r.benXuatPhatPC,
      r.gioDiPC, r.gioDenPC, r.chenhLechDi, r.chenhLechDen, r.soBen];
    if (q && (f.join(' ') + ' ' + r.ghi).toLowerCase().indexOf(q) === -1) return;
    html += '<tr class="e-' + c + '">' + f.map(v => '<td>' + esc(v) + '</td>').join('') + '<td class="notes">' + esc(r.ghi) + '</td></tr>';
  });
  const heads = ['Loại', 'KH Đi', 'KH Đến', 'KH Xe', 'TH Xe', 'TH Đi', 'TH Đến', 'Bến đầu', 'TT EBMS', 'Lịch chạy PC', 'Xe PC', 'Bến PC', 'Giờ đi PC', 'Giờ đến PC', 'Lệch Đi', 'Lệch Về', 'So bến', 'Ghi chú'];
  $('out').innerHTML = '<table><thead><tr>' + heads.map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>' +
    (html || '<tr><td colspan="18">Không có dòng nào</td></tr>') + '</tbody></table>';
}

// ===== RENDER =====
function render() {
  const st = DATA.stats;
  $('stats').innerHTML = [['Tổng chuyến', st.total], ['Có cảnh báo', st.warn], ['Cặp trùng giờ', st.conflicts], ['Mất chuyến', st.missed]]
    .map(x => '<div class="stat"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');

  const q = $('q').value.trim().toLowerCase(), only = $('onlyWarn').checked;
  let band = false, prev = null, html = '';
  DATA.rows.forEach(function (r) {
    if (r.xe !== prev) { band = !band; prev = r.xe; }
    if (q && r.xe.toLowerCase().indexOf(q) === -1) return;
    if (only && !r.k.join('')) return;
    const cells = r.t.map((v, i) => '<td class="' + r.k[i] + '"' + (r.n[i] ? ' title="' + esc(r.n[i]) + '"' : '') + '>' + esc(v) + '</td>').join('');
    const ch = r.chenh == null ? '' : (r.chenh > 0 ? '+' : '') + r.chenh + ' phút';
    html += '<tr class="' + (band ? 'bandB' : '') + '"><td>' + esc(r.xe) + '</td><td>' + esc(r.lich) + '</td>' + cells +
      '<td class="' + (r.k[1] === 'green' ? 'green' : '') + '">' + ch + '</td></tr>';
  });
  let out = '<table><thead><tr><th>Xe</th><th>Lịch chạy</th><th>Giờ điều xe</th><th>Giờ đi</th><th>Giờ đến</th><th>Giờ về bến</th><th>Chênh lệch giờ đi</th></tr></thead><tbody>' +
    (html || '<tr><td colspan="7">Không có dòng nào</td></tr>') + '</tbody></table>';

  if (DATA.missed.length) {
    out += '<h3>⚠️ Chuyến mất / đề xuất mất (' + DATA.missed.length + ')</h3><table><thead><tr><th>Mã chuyến</th><th>Lịch chạy</th><th>Bến</th><th>Xe</th><th>Loại</th><th>Tài xế</th><th>Tiếp viên</th><th>Trạng thái</th></tr></thead><tbody>' +
      DATA.missed.map(m => '<tr><td>' + esc(m.maChuyen) + '</td><td>' + esc(m.lichChay) + '</td><td>' + esc(m.benXuatPhat) + '</td><td>' + esc(m.xe) +
        '</td><td>' + esc(m.loaiChuyen) + '</td><td>' + esc(m.taiXe) + '</td><td>' + esc(m.tiepVien) + '</td><td class="red">' + esc(m.trangThai) + '</td></tr>').join('') +
      '</tbody></table>';
  }
  $('out').innerHTML = out;
}


// ===== TRÍCH XUẤT NHÂN VIÊN =====
(function () { const v = localStorage.getItem('nguoi_do'); if (v) $('nguoiDo').value = v; })();

$('btnNv').onclick = function () {
  const s = sel(); if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy), hoặc danh sách tuyến chưa tải xong. Bấm "🔑 Đổi mã" nếu sai mã.', 'err'); return; }
  const nd = $('nguoiDo').value.trim(); localStorage.setItem('nguoi_do', nd);
  $('btnNv').disabled = true; msg('Đang trích xuất nhân viên...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'nv', routeId: s.id, label: s.code, date: isoDate(), nguoiDo: nd }).then(function (res) {
    if (!res.rows) throw new Error('Server chưa có action "nv". Thêm dòng router vào Web.gs, dán Nv.gs, rồi Deploy lại BẢN MỚI.');
    NV = res; MODE = 'nv'; $('btnCopy').style.display = '';
    msg('✅ Tuyến ' + s.code + ' — ' + res.ngay + ': ' + res.stats.total + ' nhân viên (từ ' + res.tripCount + ' chuyến, đã bỏ chuyến mất và trùng)', 'ok');
    renderNv();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnNv').disabled = false; });
};

function nvVisible() {
  const q = $('q').value.trim().toLowerCase();
  return NV.rows.filter(r => !q || (r.ten + ' ' + r.chucVu).toLowerCase().indexOf(q) !== -1);
}

function renderNv() {
  const st = NV.stats;
  $('stats').innerHTML = [['Tổng nhân viên', st.total], ['Lái xe', st.drivers], ['Tiếp viên', st.attendants], ['Trùng tên khác SĐT', st.ambiguous]]
    .map(x => '<div class="stat"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');
  const body = nvVisible().map(r => '<tr class="' + (r.isAmbiguous ? 'e-amb' : '') + '"><td>' + esc(r.ngay) + '</td><td>' + esc(r.tuyen) + '</td><td>' + esc(r.gioDi) +
    '</td><td>' + esc(r.gioXuatBen) + '</td><td>' + esc(r.thoiGianDo) + '</td><td class="left">' + esc(r.ten) + '</td><td>' + esc(r.chucVu) +
    '</td><td>' + (r.trangThai ? '✅' : '⬜') + '</td><td>' + (r.viPham ? '⚠️' : '⬜') + '</td><td>' + esc(r.nguoiDo) + '</td></tr>').join('');
  $('out').innerHTML = '<table><thead><tr>' + ['Ngày', 'Tuyến', 'Giờ đi', 'Giờ xuất bến', 'Thời gian đo', 'Tên', 'Chức vụ', 'Trạng thái', 'Vi phạm', 'Người đo']
    .map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>' + (body || '<tr><td colspan="10">Không có nhân viên nào</td></tr>') + '</tbody></table>';
}

$('btnCopy').onclick = function () {
  if (MODE === 'bt' && BT) { copyText(btGrid().map(r => r.join('\t')).join('\n'), '📋 Đã copy bảng tài, qua Google Sheet bấm Ctrl+V'); return; }
  if (!NV) return;
  const clean = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
  const text = nvVisible().map(r => [r.ngay, r.tuyen, r.gioDi, r.gioXuatBen, r.thoiGianDo, r.ten, r.chucVu,
    r.trangThai ? 'TRUE' : 'FALSE', r.viPham ? 'TRUE' : 'FALSE', r.nguoiDo].map(clean).join('\t')).join('\n');
  copyText(text, '📋 Đã copy ' + nvVisible().length + ' dòng, qua Google Sheet bấm Ctrl+V');
};
function copyText(text, okMsg) {
  const done = function () { msg(okMsg, 'ok'); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(function (e) { msg('❌ Không copy được: ' + e.message, 'err'); });
  else { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { msg('❌ Không copy được', 'err'); } ta.remove(); }
}

// ===== KIỂM TRA LỆNH VẬN CHUYỂN (chỉ tuyến + ngày đang chọn) =====
$('btnLvc').onclick = function () {
  const s = sel(); if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy), hoặc danh sách tuyến chưa tải xong. Bấm "🔑 Đổi mã" nếu sai mã.', 'err'); return; }
  $('btnLvc').disabled = true; msg('Đang kiểm tra lệnh vận chuyển tuyến ' + s.code + ' (có thể mất 20-40 giây)...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'lvc', routeId: s.id, label: s.code, date: isoDate() }, 180000).then(function (res) {
    if (!res.rows) throw new Error('Server chưa có action "lvc". Thêm dòng router vào Web.gs, dán Lvc.gs, rồi Deploy lại BẢN MỚI.');
    LV = res; MODE = 'lvc'; $('btnCopy').style.display = 'none';
    if (res.rows.length) msg('✅ Lệnh tuyến ' + s.code + ' — ngày ' + res.ngay + ' (' + res.rows.length + ' lệnh)', 'ok');
    else msg('⚠️ Tuyến ' + s.code + ' — ngày ' + res.ngay + ' không có lệnh vận chuyển nào', 'err');
    renderLvc();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnLvc').disabled = false; });
};

function renderLvc() {
  const c = { ok: 0, warn: 0, bad: 0 };
  LV.rows.forEach(function (r) { c[r.level]++; });
  $('stats').innerHTML = [['Tổng lệnh', LV.rows.length, ''], ['Đạt', c.ok, 'e-ok'], ['Cảnh báo', c.warn, 'e-warn'], ['Lỗi', c.bad, 'e-nopc']]
    .map(x => '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');

  const q = $('q').value.trim().toLowerCase(), only = $('onlyWarn').checked;
  const tag = { ok: '✅ ĐẠT', warn: '🟠 CẢNH BÁO', bad: '🔴 LỖI' }, cls = { ok: 'e-ok', warn: 'e-warn', bad: 'e-nopc' };
  let html = '';
  LV.rows.forEach(function (r) {
    if (only && r.level === 'ok') return;
    if (q && [r.xe, r.code, r.lai, r.loi.join(' '), r.cb.join(' ')].join(' ').toLowerCase().indexOf(q) === -1) return;
    const notes = r.loi.map(x => '<div>❌ ' + esc(x) + '</div>').concat(r.cb.map(x => '<div>⚠️ ' + esc(x) + '</div>')).join('');
    html += '<tr class="' + cls[r.level] + '"><td>' + esc(r.xe) + '</td><td>' + esc(r.code) + '</td><td class="left">' + esc(r.lai) +
      '</td><td>' + (r.soChuyen == null ? '' : r.soChuyen) + '</td><td>' + tag[r.level] + '</td><td class="notes">' + notes + '</td></tr>';
  });
  $('out').innerHTML = '<table><thead><tr>' + ['Biển số', 'Mã lệnh', 'Lái xe', 'Số chuyến', 'Kết quả', 'Chi tiết'].map(x => '<th>' + x + '</th>').join('') +
    '</tr></thead><tbody>' + (html || '<tr><td colspan="6">Không có dòng nào</td></tr>') + '</tbody></table>';
}

// ===== TÍNH NĂNG ẨN: SỬA LỆNH =====
// Mở khoá: bấm 5 lần liên tiếp vào biểu tượng 🚌 ở đầu trang, nhập EDIT_KEY. Mã được server kiểm tra (không chỉ ẩn nút).
function getEkey() { try { return localStorage.getItem('edit_key') || ''; } catch (e) { return ''; } }
function setUnlocked(on) {
  $('btnEdit').hidden = !on; $('btnAuto').hidden = !on; $('fPlate').hidden = !on; $('btnLock').hidden = !on;
  $('fFrom').hidden = !on; $('fTo').hidden = !on;
  $('actions').classList.toggle('has-edit', on);
  if (!on && (MODE === 'edit' || MODE === 'auto')) { MODE = 'trips'; ED = null; AU = null; $('out').innerHTML = ''; $('stats').innerHTML = ''; }
}
function tryUnlock(ekey, silent) {
  return api({ action: 'editauth', ekey: ekey }, 30000, 1).then(function () {
    localStorage.setItem('edit_key', ekey); setUnlocked(true);
    if (!silent) msg('🔓 Đã mở khoá tính năng sửa lệnh', 'ok');
  }).catch(function (e) {
    if (silent) { if (!e.net) { localStorage.removeItem('edit_key'); setUnlocked(false); } return; }
    msg('❌ ' + e.message, 'err');
  });
}
(function () {
  let n = 0, timer = null;
  $('brandMark').onclick = function () {
    n++; clearTimeout(timer); timer = setTimeout(function () { n = 0; }, 3000);
    if (n < 5) return;
    n = 0;
    const input = prompt('Nhập mã mở khoá:');
    if (input && input.trim()) tryUnlock(input.trim(), false);
  };
  $('btnLock').onclick = function () { localStorage.removeItem('edit_key'); setUnlocked(false); msg('🔒 Đã khoá lại', 'ok'); };
  if (getEkey()) setTimeout(function () { tryUnlock(getEkey(), true); }, 800); // mã cũ còn đúng thì tự mở lại
})();

$('btnEdit').onclick = function () {
  const s = sel(); const plate = $('plate').value.trim();
  if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy).', 'err'); return; }
  if (!plate) { msg('❌ Nhập biển số xe cần sửa.', 'err'); $('plate').focus(); return; }
  $('btnEdit').disabled = true; msg('Đang tải lệnh của xe ' + plate + '...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  loadEdit(s, plate).then(function () { msg('✅ Xe ' + ED.plate + ' — ' + ED.ngay + ': ' + ED.orders.length + ' lệnh. Sửa giờ rồi bấm Lưu.', 'ok'); })
    .catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnEdit').disabled = false; });
};
$('plate').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btnEdit').click(); } };

function loadEdit(s, plate) {
  return api({ action: 'editlist', ekey: getEkey(), routeId: s.id, label: s.code, date: isoDate(), plate: plate }, 180000).then(function (res) {
    if (!res.orders) throw new Error('Server chưa có action "editlist". Dán Edit.gs, thêm router vào Web.gs, rồi Deploy lại BẢN MỚI.');
    ED = res; ED.sel = s; ED.iso = isoDate(); MODE = 'edit'; $('btnCopy').style.display = 'none';
    renderEdit();
  });
}

const hm5 = v => String(v || '').slice(-5);
function renderEdit() {
  let nTrips = 0; ED.orders.forEach(function (o) { nTrips += o.trips.length; });
  $('stats').innerHTML = [['Biển số', ED.plate], ['Lệnh', ED.orders.length], ['Chuyến', nTrips]]
    .map(x => '<div class="stat"><b>' + esc(x[1]) + '</b>' + x[0] + '</div>').join('');
  // (nút "Điền Giờ về bến = Giờ đến" đã bỏ: theo luật mới, bình thường về bến = đến + 1 phút -> dùng "⚡ Tự chỉnh theo luật")
  let out = '<div class="edit-bar">' +
    '<button class="edit-btn big" data-act="saveAll">💾 Lưu tất cả thay đổi</button>' +
    '<span class="edit-hint">Chỉ tính các chuyến đang hiện (trong khoảng giờ). Có xác nhận trước khi lưu.</span></div>';
  ED.orders.forEach(function (o) {
    out += '<div class="ord-h">Lệnh ' + esc(o.lenh) + '<small>' + esc(o.code) + '</small></div>';
    if (o.canhBao.length) out += '<div class="ord-warn">⚠️ Danh sách chuyến bất thường: ' + esc(o.canhBao.join('; ')) + ' — kiểm tra kỹ mã chuyến trước khi sửa.</div>';
    out += '<table><thead><tr>' + ['STT', 'Mã chuyến', 'Lịch tài', 'Giờ điều xe', 'Sửa điều xe', 'Giờ đi', 'Giờ đến', 'Giờ về bến', 'Sửa về bến']
      .map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>';
    o.trips.forEach(function (t) {
      const sm = String(t.tai || '').match(/^(\d{1,2}):(\d{2})/);
      const st = sm ? (+sm[1] * 60 + +sm[2]) : '';
      const ended = !!(t.den && t.veben);
      const base = ' data-oid="' + esc(o.id) + '" data-tid="' + esc(t.id) + '"';
      out += '<tr data-start="' + st + '" data-den="' + esc(hm5(t.den)) + '"><td>' + t.stt + '</td><td>' + esc(t.code) + '</td><td>' + esc(t.tai) + '</td><td>' + esc(hm5(t.dieuxe)) + '</td>' +
        (ended
          ? '<td class="edcell"><input class="edit-in" value="' + esc(hm5(t.dieuxe)) + '" maxlength="5" data-f="dieuxe" data-orig="' + esc(hm5(t.dieuxe)) + '"' + base + '><button class="edit-btn" data-save="dieuxe"' + base + '>Lưu</button></td>'
          : '<td class="ed-off">chưa kết thúc</td>') +
        '<td>' + esc(hm5(t.di)) + '</td><td>' + esc(hm5(t.den)) + '</td><td>' + esc(hm5(t.veben)) + '</td>' +
        (t.den
          ? '<td class="edcell"><input class="edit-in" value="' + esc(hm5(t.veben)) + '" maxlength="5" data-f="veben" data-orig="' + esc(hm5(t.veben)) + '"' + base + '><button class="edit-btn" data-save="veben"' + base + '>Lưu</button></td>'
          : '<td class="ed-off">chưa có giờ đến</td>') + '</tr>';
    });
    out += '</tbody></table>';
  });
  $('out').innerHTML = out;
  applyRange();
}

// --- Lọc theo khoảng giờ lịch chạy (chỉ ẩn/hiện dòng, không mất giờ đang gõ) ---
function parseHM(s) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{1,2})$/);
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}
function applyRange() {
  if (MODE !== 'edit') return;
  const from = parseHM($('tFrom').value), to = parseHM($('tTo').value);
  const has = from !== null || to !== null;
  $('out').querySelectorAll('tr[data-start]').forEach(function (tr) {
    let show = true;
    if (has) {
      const s = tr.dataset.start === '' ? null : +tr.dataset.start;
      if (s === null) show = false;
      else if (from !== null && to !== null) show = from <= to ? (s >= from && s <= to) : (s >= from || s <= to); // qua nửa đêm
      else if (from !== null) show = s >= from;
      else show = s <= to;
    }
    tr.hidden = !show;
  });
}
$('tFrom').oninput = $('tTo').oninput = applyRange;

// --- Lưu hàng loạt (có xác nhận) ---
function collectChanges() {
  const list = [];
  $('out').querySelectorAll('input.edit-in').forEach(function (inp) {
    const tr = inp.closest('tr');
    if (tr && tr.hidden) return;
    const v = (inp.value || '').trim();
    if (v === inp.dataset.orig) return;
    list.push({ field: inp.dataset.f, oid: inp.dataset.oid, tid: inp.dataset.tid, hhmm: v, input: inp });
  });
  return list;
}
function findTrip(oid, tid) {
  const order = ED.orders.find(o => String(o.id) === String(oid));
  return { order: order, trip: order && order.trips.find(t => String(t.id) === String(tid)) };
}
function runBatch(ch) {
  const btns = $('out').querySelectorAll('button'); btns.forEach(x => x.disabled = true);
  const okN = [], bad = [];
  let i = 0;
  function next() {
    if (i >= ch.length) return Promise.resolve();
    const c = ch[i++], f = findTrip(c.oid, c.tid);
    const name = c.field === 'dieuxe' ? 'Giờ điều xe' : 'Giờ về bến';
    const tag = f.trip ? 'Lệnh ' + f.order.lenh + ' · chuyến ' + f.trip.stt + ' · ' + name : name;
    if (!f.trip) { bad.push(tag + ': không thấy chuyến, tải lại bảng'); return next(); }
    msg('Đang lưu ' + i + '/' + ch.length + '...');
    return api({ action: 'edit', ekey: getEkey(), routeId: ED.sel.id, date: ED.iso, orderId: c.oid, tripId: c.tid, field: c.field, hhmm: c.hhmm, snap: f.trip.snap }, 120000, 0)
      .then(function (r) {
        (r.same || r.ok ? okN : bad).push(tag + ': ' + r.message);
        const nx = ch[i];
        if (nx && nx.tid === c.tid) return loadEdit(ED.sel, ED.plate); // cùng chuyến: nạp lại để có snap mới
      })
      .catch(function (e) { bad.push(tag + ': ' + e.message); })
      .then(next);
  }
  return next()
    .then(function () { return loadEdit(ED.sel, ED.plate); })
    .then(function () {
      msg((bad.length ? '⚠️ ' : '✅ ') + 'Đã xử lý ' + ch.length + ' thay đổi: ' + okN.length + ' thành công, ' + bad.length + ' lỗi' +
        (bad.length ? '\n' + bad.join('\n') : ''), bad.length ? 'err' : 'ok');
    })
    .catch(function (e) { msg('❌ ' + e.message, 'err'); btns.forEach(x => x.disabled = false); });
}

$('out').addEventListener('click', function (ev) {
  const a = ev.target.closest && ev.target.closest('button[data-act]');
  if (!a || MODE !== 'edit' || !ED) return;
  if (a.dataset.act === 'saveAll') {
    const ch = collectChanges();
    if (!ch.length) { msg('Chưa có thay đổi nào để lưu (trong khoảng giờ đang hiện).', 'err'); return; }
    for (let k = 0; k < ch.length; k++) {
      if (parseHM(ch[k].hhmm) === null) { msg('❌ Giờ phải dạng HH:mm (vd 22:36)', 'err'); ch[k].input.focus(); return; }
    }
    const lines = ch.map(function (c) {
      const f = findTrip(c.oid, c.tid);
      const name = c.field === 'dieuxe' ? 'Giờ điều xe' : 'Giờ về bến';
      return '• Lệnh ' + f.order.lenh + ' · chuyến ' + f.trip.stt + ' (' + f.trip.code + ') · ' + name + ': ' + c.input.dataset.orig + ' → ' + c.hhmm;
    });
    const range = ($('tFrom').value.trim() || $('tTo').value.trim()) ? '\nKhoảng giờ lịch chạy: ' + ($('tFrom').value.trim() || '…') + ' – ' + ($('tTo').value.trim() || '…') : '';
    if (!confirm('Xe ' + ED.plate + ' · ' + ED.ngay + range + '\nSẽ lưu ' + ch.length + ' thay đổi lên hệ thống FUTA:\n\n' + lines.join('\n') + '\n\nXác nhận lưu?')) return;
    runBatch(ch);
  }
});

$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('button[data-save]');
  if (!b || MODE !== 'edit' || !ED) return;
  const field = b.dataset.save, oid = b.dataset.oid, tid = b.dataset.tid;
  const input = b.parentNode.querySelector('input[data-f="' + field + '"]');
  const hhmm = (input.value || '').trim();
  const order = ED.orders.find(o => String(o.id) === oid);
  const trip = order && order.trips.find(t => String(t.id) === tid);
  if (!trip) return;
  const name = field === 'dieuxe' ? 'Giờ điều xe' : 'Giờ về bến';
  const curV = field === 'dieuxe' ? trip.dieuxe : trip.veben;
  if (!/^\d{1,2}:\d{1,2}$/.test(hhmm)) { msg('❌ Giờ phải dạng HH:mm (vd 22:36)', 'err'); input.focus(); return; }
  if (!confirm('Xe ' + ED.plate + ' · lệnh ' + order.lenh + ' · chuyến ' + trip.stt + ' (' + trip.code + ')\n' + name + ': ' + hm5(curV) + '  →  ' + hhmm + '\n\nLưu lên hệ thống FUTA?')) return;

  const btns = $('out').querySelectorAll('button'); btns.forEach(x => x.disabled = true);
  msg('Đang lưu...');
  api({ action: 'edit', ekey: getEkey(), routeId: ED.sel.id, date: ED.iso, orderId: oid, tripId: tid, field: field, hhmm: hhmm, snap: trip.snap }, 120000, 0)
    .then(function (r) {
      const cls = r.same || r.ok ? 'ok' : 'err';
      msg(r.message + (r.warn ? '\n⚠️ ' + r.warn : ''), cls);
      return loadEdit(ED.sel, ED.plate).then(function () { msg(r.message + (r.warn ? '\n⚠️ ' + r.warn : ''), cls); }); // nạp lại bảng, giữ thông báo
    })
    .catch(function (e) { msg('❌ ' + e.message, 'err'); btns.forEach(x => x.disabled = false); });
});

// ===== CHUYỂN NGÀY TRƯỚC / SAU =====
function shiftDay(n) {
  const v = isoDate(); if (!v) return;
  const p = v.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  $('date').value = String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
}
$('btnPrev').onclick = function () { shiftDay(-1); };
$('btnNext').onclick = function () { shiftDay(1); };

// ===== CHÚ THÍCH MÀU: chỉ hiện ở màn Bảng xe =====
(function () {
  const lg = document.querySelector('.legend');
  const sync = function () {
    lg.style.display = (MODE === 'trips' && $('out').children.length) ? '' : 'none';
  };
  new MutationObserver(sync).observe($('out'), { childList: true });
  sync();
})();

// ===== KHUNG TIÊU CHÍ: hiện ngay khi bấm "Kiểm tra lệnh", ẩn khi bấm nút khác =====
$('actions').addEventListener('click', function (e) {
  const b = e.target.closest && e.target.closest('button');
  if (b) { $('lvcRules').hidden = (b.id !== 'btnLvc'); $('btnXlsx').style.display = 'none'; }
});

// ===== TỰ CHỈNH THEO LUẬT (gọi autoplan / autosave trong edit.gs) =====
// Hiện cùng nút "✏️ Sửa lệnh" sau khi mở khoá. Ô "Biển số xe" trống = cả tuyến; có biển = chỉ xe đó.
// Luật: cặp chuyến (trước, sau), đến >= lịch - 1p = quay đầu: về bến = đến, điều xe = đi = đến + 1p;
// ngược lại: về bến = đến + 1p, điều xe = lịch - 1p, đi = lịch. Đầu ngày: điều xe = lịch - 1p, đi = lịch.
// Cuối ngày: về bến = đến + 1p. Về bến trống (chưa xác nhận) để nguyên. Giờ đến không bao giờ đổi.
let AU = null;

$('btnAuto').onclick = function () { autoPlan(''); };

function autoPlan(prefix) {
  const s = sel();
  if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy).', 'err'); return Promise.resolve(); }
  const plate = $('plate').value.trim().toUpperCase();
  $('btnAuto').disabled = true;
  msg((prefix ? prefix + '\n' : '') + 'Đang đọc lệnh ' + (plate ? 'xe ' + plate : 'cả tuyến ' + s.code) + ' và lập kế hoạch (chưa ghi gì)...');
  $('out').innerHTML = ''; $('stats').innerHTML = '';
  return api({ action: 'autoplan', ekey: getEkey(), routeId: s.id, date: isoDate(), plate: plate }, 180000).then(function (res) {
    if (!res.stats) throw new Error('Server chưa có action "autoplan". Dán edit.gs mới, thêm router vào web.gs, rồi Deploy lại BẢN MỚI.');
    AU = res; AU.sel = s; MODE = 'auto'; $('btnCopy').style.display = 'none';
    renderAuto();
    const st = res.stats;
    msg((prefix ? prefix + '\n' : '') + (st.sua ? '✅ ' : '✅ Không còn gì cần sửa. ') +
      (plate ? 'Xe ' + plate : 'Tuyến ' + s.code + ' (' + st.xe + ' xe)') + ' — ' + res.ngay + ': sẽ sửa ' + st.sua + ' chuyến, đã đúng ' + st.dung +
      (st.canXem ? ', CẦN XEM ' + st.canXem : '') + (st.loi ? ', LỖI ' + st.loi : '') + '. Chưa ghi gì lên hệ thống.',
      st.canXem || st.loi ? 'err' : 'ok');
  }).catch(function (e) { msg((prefix ? prefix + '\n' : '') + '❌ ' + e.message, 'err'); })
    .then(function () { $('btnAuto').disabled = false; });
}

function renderAuto() {
  const st = AU.stats;
  $('stats').innerHTML = [['Xe', st.xe, ''], ['Sẽ sửa', st.sua, 'e-warn'], ['Đã đúng', st.dung, 'e-ok'],
    ['Cần xem / lỗi', st.canXem + st.loi, 'e-nopc']]
    .map(function (x) { return '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>'; }).join('');

  const q = $('q').value.trim().toLowerCase();
  const hit = function (r) { return !q || (r.plate + ' ' + r.code + ' ' + r.sched).toLowerCase().indexOf(q) !== -1; };
  const cell = function (r, label) {
    const d = r.diff.filter(function (x) { return x.label === label; })[0];
    return d ? '<td class="green">' + esc(d.from) + ' → ' + esc(d.to) + '</td>' : '<td></td>';
  };

  let out = '';
  if (AU.errors.length || AU.problems.length) {
    out += '<h3>⚠️ Cần xem / lỗi (không tự sửa)</h3><div class="ord-warn">' +
      AU.errors.map(function (e) { return '<div>❌ ' + esc(e) + '</div>'; }).join('') +
      AU.problems.map(function (r) { return '<div>⚠️ ' + esc(r.plate + ' lệnh ' + r.lenh + ' chuyến ' + r.stt + ' (' + r.code + '): ' + r.reason) + '</div>'; }).join('') +
      '</div>';
  }
  if (AU.warns.length) out += '<div class="ord-warn">' + AU.warns.map(function (w) { return '<div>⚠️ ' + esc(w) + '</div>'; }).join('') + '</div>';
  if (AU.planId) {
    out += '<div class="edit-bar"><button class="edit-btn big" data-auto="save">💾 Lưu ' + st.sua + ' chuyến theo luật</button>' +
      '<span class="edit-hint">Lưu xong tự đọc lại để kiểm. Dòng nào vừa bị đổi kể từ lúc xem sẽ KHÔNG lưu. Kế hoạch giữ 15 phút.</span></div>';
  }
  let body = '', band = false, prev = null;
  AU.changes.forEach(function (r) {
    if (!hit(r)) return;
    if (r.plate !== prev) { band = !band; prev = r.plate; }
    body += '<tr class="' + (band ? 'bandB' : '') + '"><td>' + esc(r.plate) + '</td><td>' + esc(r.lenh) + '</td><td>' + r.stt + '</td><td>' + esc(r.code) +
      '</td><td>' + esc(r.sched) + '</td><td class="left">' + esc(r.mode) + '</td>' +
      cell(r, 'Giờ điều xe') + cell(r, 'Giờ đi') + cell(r, 'Giờ về bến') +
      '<td class="notes">' + esc([r.note, r.warn && '⚠️ ' + r.warn].filter(Boolean).join(' | ')) + '</td></tr>';
  });
  out += '<table><thead><tr>' + ['Xe', 'Lệnh', 'STT', 'Mã chuyến', 'Lịch', 'Chế độ', 'Giờ điều xe', 'Giờ đi', 'Giờ về bến', 'Ghi chú']
    .map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
    (body || '<tr><td colspan="10">Không có chuyến nào cần sửa</td></tr>') + '</tbody></table>';
  $('out').innerHTML = out;
}

$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('button[data-auto="save"]');
  if (!b || MODE !== 'auto' || !AU || !AU.planId) return;
  const who = AU.plate ? 'xe ' + AU.plate : 'cả tuyến ' + AU.sel.code + ' (' + AU.stats.xe + ' xe)';
  if (!confirm('Lưu ' + AU.stats.sua + ' chuyến của ' + who + ' · ' + AU.ngay + ' lên hệ thống FUTA theo luật?\n\n' +
               'Giờ đến không bị đổi. Dòng nào vừa bị đổi kể từ lúc xem sẽ bỏ qua.')) return;
  $('out').querySelectorAll('button').forEach(function (x) { x.disabled = true; });
  $('btnAuto').disabled = true;
  msg('Đang lưu ' + AU.stats.sua + ' chuyến (có thể mất 1-3 phút, đừng đóng trang)...');
  api({ action: 'autosave', ekey: getEkey(), planId: AU.planId }, 360000, 0).then(function (r) {
    const bad = r.verifyBad.concat(r.failed, r.skipped);
    const line = (bad.length || r.stopped ? '⚠️ ' : '✔ ') + 'Đã lưu + kiểm khớp ' + r.saved + ' chuyến (' + r.elapsed + 's)' +
      (r.verifyBad.length ? ', VERIFY LỆCH ' + r.verifyBad.length : '') + (r.failed.length ? ', lỗi lưu ' + r.failed.length : '') +
      (r.skipped.length ? ', bỏ qua ' + r.skipped.length : '') + (r.stopped ? ', chưa kịp lưu ' + r.stopped + ' (hết giờ, bấm lại)' : '') +
      (bad.length ? '\n' + bad.join('\n') : '');
    return autoPlan(line); // lập lại kế hoạch: bình thường còn 0 chuyến cần sửa
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); $('btnAuto').disabled = false; });
});

// ===== BẢNG TÀI GHÉP TUYẾN (gọi bangtai trong bangtai.gs) =====
// Chọn 2-3 tuyến + ngày ở trên -> ghép ngang thành 1 bảng: mỗi bến 2 cột GIỜ XB | BKS, 1 cột trống giữa các bến.
const BT_IDS = ['bt1', 'bt2', 'bt3'];
BT_IDS.forEach(function (id) {
  const v = localStorage.getItem('bt_' + id); if (v) $(id).value = v;
  $(id).onfocus = function () { this.select(); };
  $(id).onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btnBt').click(); } };
});

$('btnBt').onclick = function () {
  if (!isoDate()) { msg('❌ Ngày gõ dạng dd/mm/yyyy.', 'err'); return; }
  if (!ROUTES.length) { msg('❌ Danh sách tuyến chưa tải xong. Bấm "🔑 Đổi mã" nếu sai mã.', 'err'); return; }
  const list = [], bad = [];
  BT_IDS.forEach(function (id, i) {
    const v = $(id).value.trim(); localStorage.setItem('bt_' + id, v);
    if (!v) return;
    const r = findRoute(v);
    if (!r) bad.push('Tuyến ' + (i + 1) + ' "' + v + '"');
    else if (!list.some(x => x.id === String(r.id))) list.push({ id: String(r.id), code: r.code });
  });
  if (bad.length) { msg('❌ Không nhận ra: ' + bad.join(', ') + '. Gõ số tuyến (vd 161) hoặc chọn từ danh sách.', 'err'); return; }
  if (!list.length) { msg('❌ Nhập ít nhất 1 tuyến (thường 2-3 tuyến).', 'err'); $('bt1').focus(); return; }
  const iso = isoDate();
  $('btnBt').disabled = true; $('lvcRules').hidden = true; $('btnXlsx').style.display = 'none';
  msg('Đang lấy lịch chạy ' + list.map(x => x.code).join(', ') + '...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  Promise.all(list.map(s => api({ action: 'bangtai', routeId: s.id, label: s.code, date: iso }, 180000))).then(function (res) {
    if (!res[0].ben) throw new Error('Server chưa có action "bangtai". Dán bangtai.gs, thêm dòng vào RO trong Web.gs, rồi Deploy lại BẢN MỚI.');
    BT = { ngay: res[0].ngay, iso: iso, routes: res }; MODE = 'bt';
    $('btnCopy').style.display = ''; $('btnXlsx').style.display = '';
    const empty = res.filter(r => !r.ben.length).map(r => r.tuyen);
    msg((empty.length ? '⚠️ Tuyến ' + empty.join(', ') + ' không có chuyến nào. ' : '✅ ') + 'Bảng tài ' + res.map(r => r.tuyen).join(' + ') + ' — ' + BT.ngay +
      '. Bấm "⬇️ Tải Excel" hoặc "📋 Copy".', empty.length ? 'err' : 'ok');
    renderBt();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnBt').disabled = false; });
};

// Màu theo đầu xuất phát: xe chạy chuyến đầu ngày ở bến nào thì mang màu bến đó cả ngày (kể cả lúc chạy ở đầu kia)
const BT_COLORS = ['CFE2FF', 'FFDDB0', 'C8F0D4', 'F9D2E4', 'E3D7FB', 'FFF1A8'];
function btBlocks() { // mỗi bến của mỗi tuyến = 1 khối 2 cột, theo thứ tự Tuyến 1 -> 3
  const out = [];
  BT.routes.forEach(function (r) {
    const home = {}, first = {}, base = out.length;
    r.ben.forEach(function (b, bi) {
      b.rows.forEach(function (x) { if (x.xe && (first[x.xe] == null || x.gio < first[x.xe])) { first[x.xe] = x.gio; home[x.xe] = bi; } });
    });
    r.ben.forEach(function (b, bi) {
      out.push({
        tuyen: r.tuyen, ten: b.ten, mau: BT_COLORS[(base + bi) % BT_COLORS.length],
        nXe: Object.keys(home).filter(x => home[x] === bi).length,
        rows: b.rows.map(x => ({ gio: x.gio, xe: x.xe, mau: x.xe ? BT_COLORS[(base + home[x.xe]) % BT_COLORS.length] : '' }))
      });
    });
  });
  return out;
}

// Lưới 2 chiều dùng chung cho màn hình, copy và Excel. Dòng 0: "161 · Văn Thánh", dòng 1: GIỜ XB | BKS, sau đó là dữ liệu.
function btGrid() {
  const bl = btBlocks(), n = Math.max(0, ...bl.map(b => b.rows.length));
  const row = f => { const a = []; bl.forEach(function (b, i) { if (i) a.push(''); a.push.apply(a, f(b)); }); return a; };
  const g = [row(b => [b.tuyen + ' · ' + b.ten + ' (' + b.nXe + ' xe)', '']), row(() => ['GIỜ XB', 'BKS'])];
  for (let k = 0; k < n; k++) g.push(row(b => b.rows[k] ? [b.rows[k].gio, b.rows[k].xe] : ['', '']));
  return g;
}

function renderBt() {
  const bl = btBlocks();
  $('stats').innerHTML = BT.routes.map(r => '<div class="stat"><b>' + r.ben.reduce((s, b) => s + b.rows.length, 0) + '</b>Chuyến tuyến ' + esc(r.tuyen) + '</div>').join('');
  const q = $('q').value.trim().toLowerCase().replace(/[\s.\-]/g, '');
  const gap = '<th class="bt-gap"></th>', gapd = '<td class="bt-gap"></td>';
  let head1 = '', head2 = '';
  bl.forEach(function (b, i) {
    head1 += (i ? gap : '') + '<th class="bt-ben" colspan="2" style="background:#' + b.mau + '">' + esc(b.tuyen + ' · ' + b.ten + ' (' + b.nXe + ' xe)') + '</th>';
    head2 += (i ? gap : '') + '<th>GIỜ XB</th><th>BKS</th>';
  });
  let body = '';
  btGrid().slice(2).forEach(function (r, k) {
    body += '<tr>' + r.map(function (v, j) {
      const c = j % 3; // 0 = giờ, 1 = BKS, 2 = cột trống
      if (c === 2) return gapd;
      const hit = c === 1 && q && v && v.toLowerCase().replace(/[\s.\-]/g, '').indexOf(q) !== -1;
      const x = c === 1 && bl[(j - 1) / 3].rows[k];
      return '<td class="' + (c === 0 ? 'bt-gio' : '') + (hit ? ' bt-hit' : '') + '"' + (x && x.mau ? ' style="background:#' + x.mau + '"' : '') + '>' + esc(v) + '</td>';
    }).join('') + '</tr>';
  });
  $('out').innerHTML = bl.length
    ? '<table class="bt"><thead><tr>' + head1 + '</tr><tr>' + head2 + '</tr></thead><tbody>' + body + '</tbody></table>'
    : '<table><tbody><tr><td>Không có chuyến nào</td></tr></tbody></table>';
}

// --- Tải Excel (ExcelJS chỉ nạp khi bấm lần đầu) ---
let _xl = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (_xl) return _xl;
  _xl = new Promise(function (resolve, reject) {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    sc.onload = function () { resolve(window.ExcelJS); };
    sc.onerror = function () { _xl = null; reject(new Error('Không tải được thư viện Excel, kiểm tra mạng rồi bấm lại')); };
    document.head.appendChild(sc);
  });
  return _xl;
}

$('btnXlsx').onclick = function () {
  if (MODE !== 'bt' || !BT) return;
  $('btnXlsx').disabled = true; msg('Đang tạo file Excel...');
  loadExcelJS().then(function (ExcelJS) {
    const g = btGrid(), bl = btBlocks(), nBlk = bl.length;
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Bảng tài', { views: [{ state: 'frozen', ySplit: 2 }] });
    const font = { name: 'Times New Roman', size: 12 }, mid = { horizontal: 'center', vertical: 'middle' };
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + argb } });
    g.forEach(function (r, i) {
      const row = ws.getRow(i + 1);
      r.forEach(function (v, j) {
        const c = j % 3;
        if (c === 2) return;
        const cell = row.getCell(j + 1);
        if (i >= 2 && c === 0 && v) { // giờ lưu dạng thời gian thật để Excel tính/sắp được
          const p = v.split(':'); cell.value = (+p[0] * 60 + +p[1]) / 1440; cell.numFmt = 'h:mm';
        } else cell.value = v;
        cell.font = Object.assign({}, font, { bold: i < 2 || c === 0 });
        cell.alignment = mid;
        const b = bl[(j - c) / 3], x = i >= 2 && c === 1 && b.rows[i - 2];
        if (i === 0) cell.fill = fill(b.mau); // tiêu đề bến mang màu của xe xuất phát ở bến đó
        else if (x && x.mau) cell.fill = fill(x.mau);
      });
      row.height = i === 0 ? 30 : 18;
    });
    for (let k = 0; k < nBlk; k++) {
      ws.mergeCells(1, k * 3 + 1, 1, k * 3 + 2);
      ws.getCell(1, k * 3 + 1).alignment = Object.assign({ wrapText: true }, mid);
      ws.getColumn(k * 3 + 1).width = 9; ws.getColumn(k * 3 + 2).width = 13;
      if (k < nBlk - 1) ws.getColumn(k * 3 + 3).width = 3;
    }
    ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: 'portrait', paperSize: 9 };
    return wb.xlsx.writeBuffer();
  }).then(function (buf) {
    const name = 'bang-tai_' + BT.routes.map(r => r.tuyen).join('-') + '_' + BT.ngay.replace(/\//g, '-') + '.xlsx';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    msg('⬇️ Đã tải ' + name, 'ok');
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnXlsx').disabled = false; });
};

// ===== CHỤP GPS MẤT CHUYẾN (gọi gps / gpsstatus trong gps.gs -> GitHub Actions) =====
// Bấm nút: liệt kê chuyến có tài xế / tiếp viên / trạng thái "mất chuyến" của tuyến + ngày đang chọn (chưa chụp).
// Bấm "Chụp": GitHub chụp lộ trình, ảnh lên Drive, link ghi vào Google Sheet như chay.command trên Mac.
$('btnGps').onclick = function () {
  const s = sel(); if (!s.id || !isoDate()) { msg('❌ Chưa nhập đúng tuyến/ngày (ngày gõ dạng dd/mm/yyyy), hoặc danh sách tuyến chưa tải xong. Bấm "🔑 Đổi mã" nếu sai mã.', 'err'); return; }
  $('btnGps').disabled = true; msg('Đang tìm chuyến mất chuyến tuyến ' + s.code + '...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'gps', dry: '1', routeId: s.id, label: s.code, date: isoDate() }, 180000).then(function (res) {
    if (!res.trips) throw new Error('Server chưa có action "gps". Dán gps.gs, thêm router vào Web.gs, rồi Deploy lại BẢN MỚI.');
    GP = res; GP.sel = s; GP.iso = isoDate(); GP.run = null; MODE = 'gps'; $('btnCopy').style.display = 'none';
    if (!res.trips.length) msg('✅ Tuyến ' + s.code + ' — ' + res.ngay + ' không có chuyến mất nào.', 'ok');
    else msg('Tuyến ' + s.code + ' — ' + res.ngay + ': ' + res.trips.length + ' chuyến mất, chụp được ' + res.nChup + '. Bấm "🛰 Chụp" để gửi lên GitHub.', res.nChup ? 'ok' : 'err');
    renderGps();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnGps').disabled = false; });
};

function renderGps() {
  const daCo = GP.trips.filter(t => t.daCo).length, khongXe = GP.trips.filter(t => !t.chup).length;
  $('stats').innerHTML = [['Chuyến mất', GP.trips.length, ''], ['Đã có ảnh trên Sheet', daCo, 'e-ok'], ['Sẽ chụp', GP.nChup, 'e-warn'], ['Không có xe', khongXe, 'e-nopc']]
    .map(x => '<div class="stat ' + x[2] + '"><b>' + x[1] + '</b>' + x[0] + '</div>').join('');
  let out = '';
  const r = GP.run;
  if (r && r.status === 'completed') {
    out += '<div class="edit-bar gps-links">' + (r.conclusion === 'success' ? '✅ Chụp xong. ' : '⚠️ Lần chạy báo lỗi. ') +
      (r.sheet ? '<a href="' + esc(r.sheet) + '" target="_blank" rel="noopener">📄 Mở Google Sheet</a>' : '') +
      (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">🔎 Xem log GitHub</a>' : '') + '</div>';
  } else if (r) {
    out += '<div class="edit-bar"><span class="edit-hint">⏳ GitHub đang chụp (' + esc(r.status) + ')... có thể mất vài phút, cứ để trang mở.</span>' +
      (r.url ? '<span class="gps-links"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">🔎 Xem tiến độ</a></span>' : '') + '</div>';
  } else if (GP.nChup) {
    out += '<div class="edit-bar"><button class="edit-btn big" data-gps="go">🛰 Chụp ' + GP.nChup + ' chuyến mất</button>' +
      '<span class="edit-hint">Không cần bấm cũng được: hệ thống tự quét mỗi giờ. Bấm để chụp ngay. Ảnh lên Drive + link ghi vào Google Sheet.</span></div>';
  }
  const q = $('q').value.trim().toLowerCase();
  const body = GP.trips.filter(t => !q || [t.xe, t.lich, t.taiXe, t.tiepVien].join(' ').toLowerCase().indexOf(q) !== -1).map(t =>
    '<tr class="' + (!t.chup ? 'e-nopc' : t.daCo ? 'e-ok' : '') + '"><td>' + esc(t.daCo ? '✅ đã có' : t.chup ? '⏳ chưa' : '❌') + '</td><td>' + esc(t.lich) + '</td><td>' + esc(t.xe || '(không có xe)') + '</td><td class="left">' + esc(t.ben) +
    '</td><td>' + esc(t.ma) + '</td><td class="left">' + esc(t.taiXe) + '</td><td class="left">' + esc(t.tiepVien) + '</td><td>' + esc(t.trangThai) + '</td></tr>').join('');
  out += '<table><thead><tr>' + ['Ảnh GPS', 'Lịch chạy', 'Xe', 'Bến', 'Mã chuyến', 'Tài xế', 'Tiếp viên', 'Trạng thái'].map(x => '<th>' + x + '</th>').join('') +
    '</tr></thead><tbody>' + (body || '<tr><td colspan="8">Không có chuyến mất nào</td></tr>') + '</tbody></table>';
  $('out').innerHTML = out;
}

$('out').addEventListener('click', function (ev) {
  const b = ev.target.closest && ev.target.closest('button[data-gps="go"]');
  if (!b || MODE !== 'gps' || !GP) return;
  if (!confirm('Gửi ' + GP.nChup + ' chuyến mất của tuyến ' + GP.sel.code + ' · ' + GP.ngay + ' lên GitHub để chụp GPS?\n\nẢnh lên Drive, link ghi vào Google Sheet như chạy trên Mac.')) return;
  b.disabled = true; msg('Đang gửi lên GitHub...');
  const g = GP;
  api({ action: 'gps', routeId: g.sel.id, label: g.sel.code, date: g.iso }, 180000).then(function (res) {
    if (!res.started) { msg('⚠️ Không có chuyến nào để chụp.', 'err'); return; }
    g.run = { status: 'queued' }; renderGps();
    msg('🛰 Đã gửi ' + res.nChup + ' chuyến lên GitHub, đang chờ chụp...', 'ok');
    const title = g.sel.code + ' ' + res.ngay, t0 = Date.now();
    (function poll() {
      if (GP !== g) return; // đã bấm sang việc khác thì thôi theo dõi
      api({ action: 'gpsstatus', since: res.since, title: title }, 60000).then(function (st) {
        g.run = st; if (MODE === 'gps' && GP === g) renderGps();
        if (st.status === 'completed') {
          msg(st.conclusion === 'success' ? '✅ Chụp GPS xong tuyến ' + title + '. Mở Google Sheet để xem link ảnh.' : '⚠️ GitHub báo lỗi (' + st.conclusion + '). Bấm "Xem log GitHub" để xem.', st.conclusion === 'success' ? 'ok' : 'err');
        } else if (Date.now() - t0 < 60 * 60000) setTimeout(poll, 15000);
        else msg('⚠️ Đã chờ 60 phút chưa xong, mở "Xem tiến độ" để kiểm tra.', 'err');
      }).catch(function () { if (Date.now() - t0 < 60 * 60000) setTimeout(poll, 20000); });
    })();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); b.disabled = false; });
});
