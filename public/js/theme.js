// Dark mode by default. The visitor's choice is kept in this browser's own
// storage (never sent to the server). Loaded in <head> to avoid a flash.
(function () {
  var KEY = 'privacypls-theme';
  var root = document.documentElement;
  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked: fine */ }
  }
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      var next = theme === 'dark' ? 'light' : 'dark';
      btn.textContent = next === 'light' ? 'Light mode' : 'Dark mode';
      btn.setAttribute('aria-label', 'Switch to ' + next + ' mode');
    }
  }
  apply(read() === 'light' ? 'light' : 'dark');
  document.addEventListener('DOMContentLoaded', function () {
    apply(root.getAttribute('data-theme'));
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      save(next);
      apply(next);
    });
  });
})();
