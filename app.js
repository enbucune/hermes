// ===== CẤU HÌNH: có thể để trống, lần đầu mở web sẽ tự hỏi URL Web App (kết thúc /exec) =====
const API_URL = '';

function getUrl(reset) {
  let u = (reset ? '' : (API_URL || localStorage.getItem('web_url') || '')).trim();
  while (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) {
    const inp = prompt('Dán URL Web App của Apps Script (dạng https://script.google.com/macros/s/.../exec):', '');
    if (inp === null) throw new Error('Chưa có URL Web App');
    u = inp.trim().split('?')[0];
    if (!/\/exec$/.test(u)) alert('URL phải kết thúc bằng /exec (lấy ở Deploy → Manage deployments)');
  }
  localStorage.setItem('web_url', u);
  return u;
}

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
    script.onerror = function () { if (!done) { clean(); reject(new Error('Không kết nối được API. Kiểm tra: (1) URL đúng và đã Deploy bản mới, (2) Who has access = Anyone, (3) đã bấm Allow quyền trong editor. Bấm "🔑 Đổi mã" để nhập lại URL.')); } };
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

$('btnKey').onclick = function () { try { getUrl(true); getKey(true); } catch (e) { msg('❌ ' + e.message, 'err'); return; } loadRoutes(); };

$('btnLoad').onclick = function () {
  const s = sel(); if (!s.id || !$('date').value) return;
  $('btnLoad').disabled = true; msg('Đang tải...'); $('out').innerHTML = ''; $('stats').innerHTML = '';
  api({ action: 'load', routeId: s.id, label: s.code, date: $('date').value }).then(function (res) {
    DATA = res; CUR = s; msg('✅ Tuyến ' + s.code + ' — ' + $('date').value, 'ok'); render();
  }).catch(function (e) { msg('❌ ' + e.message, 'err'); })
    .then(function () { $('btnLoad').disabled = false; });
};

$('q').oninput = $('onlyWarn').onchange = function () { if (DATA) render(); };

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
