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
    k = prompt('Nhập mã truy cập (WEB_KEY):') || '';
    localStorage.setItem('web_key', k.trim());
    k = k.trim();
  }
  return k;
}

// ===== JSONP =====
let _n = 0;
function api(params, timeoutMs) {
  return new Promise(function (resolve, reject) {
    let url, key;
    try { url = getUrl(); key = getKey(); } catch (e) { reject(e); return; }
    const cb = '__cb' + (++_n) + '_' + Date.now();
    const q = new URLSearchParams(Object.assign({ key: key, callback: cb }, params));
    const script = document.createElement('script');
    let done = false, timer;
    const clean = function () { done = true; delete window[cb]; script.remove(); clearTimeout(timer); };
    window[cb] = function (data) { clean(); data && data.ok ? resolve(data) : reject(new Error((data && data.error) || 'Lỗi không xác định')); };
    script.onerror = function () { if (!done) { clean(); reject(new Error('Không kết nối được API. Kiểm tra: (1) URL đúng và đã Deploy bản mới, (2) Who has access = Anyone, (3) đã bấm Allow quyền trong editor.')); } };
    timer = setTimeout(function () { if (!done) { clean(); reject(new Error('Hết thời gian chờ')); } }, timeoutMs || 120000);
    script.src = url + '?' + q.toString();
    document.body.appendChild(script);
  });
}

// ===== KHỞI TẠO =====
const d = new Date();
$('date').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function loadRoutes() {
  api({ action: 'routes' }).then(function (res) {
    const favSet = new Set(res.fav), favs = res.routes.filter(r => favSet.has(r.code)), rest = res.routes.filter(r => !favSet.has(r.code));
    const opt = r => '<option value="' + esc(r.id) + '" data-code="' + esc(r.code) + '">Tuyến ' + esc(r.code) + (r.name ? ' — ' + esc(r.name) : '') + '</option>';
    $('route').innerHTML = (favs.length ? '<optgroup label="Hay dùng">' + favs.map(opt).join('') + '</optgroup>' : '') +
      '<optgroup label="Tất cả">' + rest.map(opt).join('') + '</optgroup>';
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); });
}
loadRoutes();

function sel() { const o = $('route').selectedOptions[0]; return o ? { id: o.value, code: o.dataset.code } : {}; }

$('btnKey').onclick = function () { getKey(true); loadRoutes(); };

$('btnLoad').onclick = function () {
  const s = sel(); if (!s.id || !$('date').value) return;
  $('btnLoad').disabled = true; msg('Đang tải...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'load', routeId: s.id, label: s.code, date: $('date').value }).then(function (res) {
    DATA = res; CUR = s; MODE = 'trips'; msg('✅ Tuyến ' + s.code + ' — ' + $('date').value, 'ok'); render();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnLoad').disabled = false; });
};

$('q').oninput = $('onlyWarn').onchange = function () { rerender(); };

// ===== SO SÁNH EBMS =====
let EB = null, MODE = 'trips';
function rerender() { if (MODE === 'ebms' && EB) renderEbms(); else if (DATA) render(); }

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
  const s = sel(); if (!s.id || !$('date').value) return;
  $('btnEbms').disabled = true; msg('Đang đăng nhập EBMS và so sánh (có thể mất 20-40 giây)...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'ebms', routeId: s.id, label: s.code, date: $('date').value }, 180000).then(function (res) {
    EB = res; MODE = 'ebms';
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
