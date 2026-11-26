/* CHAmp-Lite, part 2: the screen switcher.
 * Small helpers every screen uses: switch screens, show a short message, escape text.
 * Each screen lives in its own part (home.js, and later cows.js, records.js, ...) and registers
 * itself here by name. */
(function(){
  'use strict';
  var root = document.getElementById('app');
  var toastEl = null, toastTimer = null;

  Lite.screens = {};
  Lite.register = function(name, fn){ Lite.screens[name] = fn; };
  Lite.show = function(name, args){
    var fn = Lite.screens[name];
    if(!fn){ Lite.toast('That screen is not built yet'); return; }
    root.innerHTML = '';
    window.scrollTo(0, 0);
    fn(root, args || {});
  };

  Lite.escapeHtml = function(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  };

  // Same cow-number order as CHAmp: by first character, then ascending (369, 3001, 3102).
  Lite.cowNumCmp = function(a, b){
    var x = String(a == null ? '' : a).toUpperCase(), y = String(b == null ? '' : b).toUpperCase();
    var fx = x.charAt(0), fy = y.charAt(0);
    if(fx !== fy) return fx < fy ? -1 : 1;
    return x.localeCompare(y, undefined, { numeric: true });
  };

  Lite.toast = function(msg){
    if(!toastEl){
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:86%;background:#0C5A8E;color:#fff;border:2px solid #fff;border-radius:12px;padding:10px 16px;font-family:Arial,sans-serif;font-size:14px;text-align:center;z-index:50;display:none;';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.style.display = 'none'; }, 2600);
  };

  // Pop-up box used by the forms (same look as CHAmp's pop-ups; the style rules come with cows.js).
  // Pop-ups stack like CHAmp's: a form opened from the Calf Record sits on top of it, and closing it shows the Calf Record again.
  var modalStack = [];
  Lite.closeModal = function(){ var top = modalStack.pop(); if(top) top.remove(); };
  Lite.openModal = function(html){
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = '<div class="modal">' + html + '</div>';
    backdrop.addEventListener('click', function(e){ if(e.target === backdrop && modalStack[modalStack.length - 1] === backdrop) Lite.closeModal(); });
    document.body.appendChild(backdrop);
    modalStack.push(backdrop);
    return backdrop.querySelector('.modal');
  };
})();
