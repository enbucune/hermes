// Giao diện sáng / tối (28/11/2026). Chạy trong <head> để trang không chớp trắng khi mở ở chế độ tối.
// Chưa chọn thì theo máy (chế độ tối của điện thoại / máy tính). Nút đổi nằm trên thanh đầu trang (app.js: btnTheme).
(function () {
  var t = null;
  try { t = localStorage.getItem('web_theme'); } catch (e) { /* bỏ */ }
  if (t !== 'dark' && t !== 'light') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
})();
