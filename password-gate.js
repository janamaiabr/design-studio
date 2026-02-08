(function() {
  var PWD = 'JanaJuli@2026!';
  var KEY = 'design_studio_auth';
  
  if (localStorage.getItem(KEY) === 'true') return;
  
  document.documentElement.innerHTML = '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design Studio - Login</title></head>' +
  '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">' +
    '<div style="background:rgba(255,255,255,0.05);padding:2.5rem;border-radius:1rem;width:100%;max-width:380px;border:1px solid rgba(255,255,255,0.1);">' +
      '<h1 style="font-size:1.5rem;margin-bottom:.5rem;color:#00d4ff;">🎨 Design Studio</h1>' +
      '<p style="color:#888;margin-bottom:1.5rem;font-size:.9rem;">Protected preview. Enter password to continue.</p>' +
      '<div id="error" style="color:#e94560;font-size:.85rem;margin-bottom:1rem;display:none;"></div>' +
      '<form id="loginForm">' +
        '<input id="pwd" type="password" placeholder="Password" autofocus required style="width:100%;padding:.75rem 1rem;border:1px solid rgba(255,255,255,0.1);border-radius:.5rem;background:#16213e;color:#e0e0e0;font-size:1rem;margin-bottom:1rem;box-sizing:border-box;">' +
        '<button type="submit" style="width:100%;padding:.75rem;background:#00d4ff;color:#1a1a2e;border:none;border-radius:.5rem;font-size:1rem;cursor:pointer;font-weight:600;">Enter</button>' +
      '</form>' +
    '</div>' +
  '</body>';

  setTimeout(function() {
    document.getElementById('loginForm').addEventListener('submit', function(e) {
      e.preventDefault();
      if (document.getElementById('pwd').value === PWD) {
        localStorage.setItem(KEY, 'true');
        location.reload();
      } else {
        var err = document.getElementById('error');
        err.textContent = 'Wrong password. Try again.';
        err.style.display = 'block';
        document.getElementById('pwd').value = '';
      }
    });
  }, 100);
})();
