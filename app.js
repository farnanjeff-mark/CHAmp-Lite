/* CHAmp-Lite, part 2: the app screens.
 * Step 2 placeholder: proves the core works by loading the cows and showing how many there are.
 * The real home screen replaces this in step 3. */
(function(){
  'use strict';
  var root = document.getElementById('app');
  var box = 'background:linear-gradient(135deg,#2E88C4,#0C5A8E);color:#fff;border:2px solid #fff;border-radius:14px;padding:16px;margin-bottom:12px;';

  function render(state){
    root.innerHTML =
      '<div style="' + box + '">' +
        '<div style="font-size:22px;font-weight:700;">CHAmp Lite</div>' +
        '<div style="font-size:14px;margin-top:4px;">Step 2 check: shell and core</div>' +
      '</div>' +
      '<div style="' + box + '">' +
        '<div style="font-size:30px;">' + state.cows + '</div>' +
        '<div style="font-size:14px;">cows loaded (' + state.source + ')</div>' +
      '</div>' +
      '<div style="' + box + '">' +
        '<div style="font-size:30px;">' + state.pending + '</div>' +
        '<div style="font-size:14px;">saves waiting to send</div>' +
      '</div>';
  }

  async function start(){
    var state = { cows: 0, source: 'loading', pending: Lite.pendingCount() };
    render(state);
    var res = await Lite.load(['cows']);
    state.cows = (Lite.data.cows || []).length;
    state.source = res.live.length ? 'live from the database' : (res.saved.length ? 'from this phone\'s saved copy' : 'nothing yet, no signal');
    state.pending = Lite.pendingCount();
    render(state);
    Lite.flush().then(function(){ state.pending = Lite.pendingCount(); render(state); });
  }
  start();
})();
