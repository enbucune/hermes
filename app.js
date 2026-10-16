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

// ===== KHỞI TẠO =====
const d = new Date();
$('date').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

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
function sel() {
  const v = $('route').value.trim().toLowerCase();
  if (!v || !ROUTES.length) return {};
  const nz = x => String(x).toLowerCase().replace(/^0+(?=\d)/, '');
  let r = ROUTES.find(x => routeText(x).toLowerCase() === v) ||
          ROUTES.find(x => x.code.toLowerCase() === v) ||
          ROUTES.find(x => nz(x.code) === nz(v));
  if (!r) {
    const m = ROUTES.filter(x => routeText(x).toLowerCase().indexOf(v) !== -1);
    if (m.length === 1) r = m[0];
  }
  if (!r) return {};
  localStorage.setItem('last_route', routeText(r));
  return { id: String(r.id), code: r.code };
}

$('route').onfocus = function () { this.select(); }; // bấm vào ô là bôi đen sẵn, gõ đè luôn
$('route').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btnLoad').click(); } };

$('btnKey').onclick = function () { getKey(true); loadRoutes(); };

$('btnLoad').onclick = function () {
  const s = sel(); if (!s.id || !$('date').value) { msg('❌ Chưa nhập đúng tuyến/ngày, hoặc danh sách tuyến chưa tải xong. Bấm "🔑 Đổi mã" nếu sai mã.', 'err'); return; }
  $('btnLoad').disabled = true; msg('Đang tải...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'load', routeId: s.id, label: s.code, date: $('date').value }).then(function (res) {
    DATA = res; CUR = s; MODE = 'trips'; $('btnCopy').style.display = 'none'; msg('✅ Tuyến ' + s.code + ' — ' + $('date').value, 'ok'); render();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnLoad').disabled = false; });
};

$('q').oninput = $('onlyWarn').onchange = function () { rerender(); };

// ===== SO SÁNH EBMS =====
let EB = null, MODE = 'trips';
let NV = null;
let LV = null;
function rerender() {
  if (MODE === 'ebms' && EB) renderEbms();
  else if (MODE === 'nv' && NV) renderNv();
  else if (MODE === 'lvc' && LV) renderLvc();
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
  const s = sel(); if (!s.id || !$('date').value) { msg('❌ Chưa nhập đúng tuyến/ngày, hoặc danh sách tuyến chưa tải xong. Bấm "🔑 Đổi mã" nếu sai mã.', 'err'); return; }
  $('btnEbms').disabled = true; msg('Đang đăng nhập EBMS và so sánh (có thể mất 20-40 giây)...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'ebms', routeId: s.id, label: s.code, date: $('date').value }, 180000).then(function (res) {
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
  const s = sel(); if (!s.id || !$('date').value) { msg('❌ Chưa nhập đúng tuyến/ngày, hoặc danh sách tuyến chưa tải xong. Bấm "🔑 Đổi mã" nếu sai mã.', 'err'); return; }
  const nd = $('nguoiDo').value.trim(); localStorage.setItem('nguoi_do', nd);
  $('btnNv').disabled = true; msg('Đang trích xuất nhân viên...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'nv', routeId: s.id, label: s.code, date: $('date').value, nguoiDo: nd }).then(function (res) {
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
  if (!NV) return;
  const clean = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
  const text = nvVisible().map(r => [r.ngay, r.tuyen, r.gioDi, r.gioXuatBen, r.thoiGianDo, r.ten, r.chucVu,
    r.trangThai ? 'TRUE' : 'FALSE', r.viPham ? 'TRUE' : 'FALSE', r.nguoiDo].map(clean).join('\t')).join('\n');
  const done = function () { msg('📋 Đã copy ' + nvVisible().length + ' dòng, qua Google Sheet bấm Ctrl+V', 'ok'); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(function (e) { msg('❌ Không copy được: ' + e.message, 'err'); });
  else { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { msg('❌ Không copy được', 'err'); } ta.remove(); }
};

// ===== KIỂM TRA LỆNH VẬN CHUYỂN (chỉ tuyến + ngày đang chọn) =====
$('btnLvc').onclick = function () {
  const s = sel(); if (!s.id || !$('date').value) { msg('❌ Chưa nhập đúng tuyến/ngày, hoặc danh sách tuyến chưa tải xong. Bấm "🔑 Đổi mã" nếu sai mã.', 'err'); return; }
  $('btnLvc').disabled = true; msg('Đang kiểm tra lệnh vận chuyển tuyến ' + s.code + ' (có thể mất 20-40 giây)...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'lvc', routeId: s.id, label: s.code, date: $('date').value }, 180000).then(function (res) {
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

// ===== CHUYỂN NGÀY TRƯỚC / SAU =====
function shiftDay(n) {
  const v = $('date').value; if (!v) return;
  const p = v.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  $('date').value = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
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
