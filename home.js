/* CHAmp-Lite, part 3: the home screen.
 * Number pad, Profile button, and the 11 status tiles. Counts use CHAmp's own rules.
 * Tiles, Profile, and Add Cow open their screens in later steps; for now they show a short message.
 * Go finds the cow and shows a simple list. The full cow screen comes in step 4. */
(function(){
  'use strict';
  var H = Lite.escapeHtml;

  // Which tables each group of tiles needs.
  var HOME_FIRST  = ['cows'];
  var HOME_REST   = ['breeding_records', 'calvings', 'treatments', 'general_notes', 'weights',
                     'calf_treatments', 'calf_weights', 'home_stats_settings', 'app_settings'];
  var HOME_ALL    = HOME_FIRST.concat(HOME_REST);
  var NEEDS = {
    calved: ['cows'], flagged: ['cows'], sell: ['cows'], inHeat: ['cows'],
    open: ['cows', 'breeding_records'],
    dueSoon: ['cows', 'breeding_records', 'calvings'],
    calvedSince: ['cows', 'calvings', 'home_stats_settings'],
    activity: ['cows', 'treatments', 'calvings', 'general_notes', 'weights', 'breeding_records',
               'calf_treatments', 'calf_weights', 'app_settings']
  };

  function rows(n){ return Lite.data[n] || []; }
  function isActive(cow){ return !cow.status || cow.status === 'Active'; }
  function todayDate(){ var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function daysAgo(iso){
    var d = new Date(iso + 'T00:00:00');
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((now - d) / 86400000);
  }
  function fmtDateShort(iso){
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
  }
  function byCow(list, key){
    var m = {};
    list.forEach(function(r){ (m[r[key]] = m[r[key]] || []).push(r); });
    return m;
  }
  function latestBreeding(list){
    return list.slice().sort(function(a, b){ return String(b.breed_date || '').localeCompare(String(a.breed_date || '')); })[0];
  }

  // The counts, worked out the same way CHAmp works them out.
  Lite.homeCounts = function(){
    var cows = rows('cows'), breeding = byCow(rows('breeding_records'), 'cow_number'), calv = byCow(rows('calvings'), 'cow_number');
    var out = {};
    out.calved  = cows.filter(function(c){ return c.calved; }).length;
    out.flagged = cows.filter(function(c){ return c.needs_entry; }).length;
    out.sell    = cows.filter(function(c){ return c.sell; }).length;
    out.inHeat  = cows.filter(function(c){ return c.in_heat; }).length;

    out.open = 0;
    cows.forEach(function(cow){
      if(!isActive(cow)) return;
      var latest = latestBreeding(breeding[cow.number] || []);
      if(latest && latest.pregnancy_status === 'Open') out.open++;
    });

    var cutoff = todayDate(); cutoff.setDate(cutoff.getDate() + 14);
    out.dueSoon = 0;
    cows.forEach(function(cow){
      if(!isActive(cow)) return;
      var list = (breeding[cow.number] || []).filter(function(b){ return b.expected_due_date; });
      if(list.length === 0) return;
      var latest = latestBreeding(list);
      var alreadyCalved = (calv[cow.number] || []).some(function(c){ return c.calving_date >= latest.breed_date; });
      if(alreadyCalved) return;
      var due = new Date(latest.expected_due_date + 'T00:00:00');
      if(due > cutoff) return;
      out.dueSoon++;
    });

    var settings = rows('home_stats_settings')[0];
    out.calvedSinceDate = settings && settings.calved_since_date ? settings.calved_since_date : null;
    out.calvedSince = 0;
    if(out.calvedSinceDate){
      var seen = {};
      var since = out.calvedSinceDate;
      rows('calvings').filter(function(c){ return c.calving_date >= since; })
        .sort(function(a, b){ return b.calving_date.localeCompare(a.calving_date); })
        .forEach(function(c){
          if(seen[c.cow_number]) return;
          seen[c.cow_number] = true;
          var cow = cows.filter(function(cw){ return cw.number === c.cow_number; })[0];
          if(!cow || !isActive(cow)) return;
          out.calvedSince++;
        });
    }

    var hideLa = true;
    rows('app_settings').forEach(function(s){ if(s.key === 'hide_la_breeding_activity') hideLa = (s.value !== 'false'); });
    var laCows = {};
    cows.forEach(function(c){ if(c.owner === 'LA') laCows[c.number] = true; });
    out.activity = 0;
    rows('treatments').forEach(function(t){ if(daysAgo(t.date) === 0) out.activity++; });
    rows('calvings').forEach(function(c){ if(daysAgo(c.calving_date) === 0) out.activity++; });
    rows('general_notes').forEach(function(n){ if(daysAgo(n.note_date) === 0) out.activity++; });
    rows('weights').forEach(function(w){ if(daysAgo(w.weigh_date) === 0) out.activity++; });
    rows('breeding_records').forEach(function(b){ if(daysAgo(b.breed_date) === 0 && !(hideLa && laCows[b.cow_number])) out.activity++; });
    rows('calf_treatments').forEach(function(t){ if(daysAgo(t.date) === 0) out.activity++; });
    rows('calf_weights').forEach(function(w){ if(daysAgo(w.weigh_date) === 0) out.activity++; });
    return out;
  };

  // Same search CHAmp uses on the home number pad: exact match first, else every number that contains it.
  Lite.searchCows = function(query){
    var q = String(query || '').trim().toLowerCase();
    if(!q) return [];
    var cows = rows('cows');
    var exact = cows.filter(function(c){ return String(c.number).toLowerCase() === q; })[0];
    if(exact) return [exact];
    return cows.filter(function(c){ return String(c.number).toLowerCase().indexOf(q) >= 0; })
      .sort(function(a, b){ return (isActive(b) - isActive(a)) || Lite.cowNumCmp(a.number, b.number); });
  };

  // ---------- look ----------
  var BLUE = 'linear-gradient(135deg,#2E88C4,#0C5A8E)';
  var tileBox = 'background:' + BLUE + ';border:2px solid #fff;border-radius:10px;min-height:62px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#fff;cursor:pointer;min-width:0;';
  var numStyle = 'font-size:30px;font-weight:400;line-height:1;';
  var lblStyle = 'font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;text-align:center;line-height:1.1;';
  var keyStyle = 'background:#fff;color:#0C5A8E;border:2px solid #2E88C4;border-radius:10px;font-family:Arial,sans-serif;font-size:28px;font-weight:400;padding:12px 0;cursor:pointer;';

  function countTile(key, label){
    return '<div class="lite-tile" data-tile="' + key + '" role="button" style="' + tileBox + '">' +
      '<span id="n-' + key + '" style="' + numStyle + '">&ndash;</span>' +
      '<span id="l-' + key + '" style="' + lblStyle + '">' + label + '</span></div>';
  }
  function iconTile(key, icon, label){
    return '<div class="lite-tile" data-tile="' + key + '" role="button" style="' + tileBox + '">' +
      '<span style="font-size:24px;line-height:1;">' + icon + '</span>' +
      '<span style="' + lblStyle + 'white-space:nowrap;">' + label + '</span></div>';
  }
  var ROW = 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;';

  function homeHtml(){
    var digits = '';
    ['1','2','3','4','5','6','7','8','9'].forEach(function(d){
      digits += '<button type="button" class="lite-digit" data-digit="' + d + '" style="' + keyStyle + '">' + d + '</button>';
    });
    return '' +
    '<div id="liteHome" style="font-family:Arial,sans-serif;">' +
      '<div id="liteProfile" role="button" style="' + tileBox + 'min-height:62px;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:18px;">Profile</div>' +
      '<div style="max-width:280px;margin:0 auto 14px;padding:16px 16px 8px;background:' + BLUE + ';border:2px solid #fff;border-radius:20px;">' +
        '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:8px;">' +
          '<div id="liteDisplay" style="grid-column:span 2;background:#fff;border:2px solid #2E88C4;border-radius:10px;padding:0 4px;height:52px;box-sizing:border-box;font-size:30px;font-weight:700;color:#0C5A8E;text-align:center;display:flex;align-items:center;justify-content:center;">&nbsp;</div>' +
          '<button type="button" id="liteBack" style="' + keyStyle + 'font-size:28px;">&#9003;</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:8px;">' + digits +
          '<div id="liteAddCow" role="button" style="background:#3C9142;border:2px solid #fff;border-radius:10px;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;"><span style="font-size:26px;font-weight:700;line-height:1;">+</span><span style="font-size:14px;font-weight:700;text-transform:uppercase;">Add Cow</span></div>' +
          '<button type="button" class="lite-digit" data-digit="0" style="' + keyStyle + '">0</button>' +
          '<button type="button" id="liteGo" style="background:#3C9142;color:#fff;border:2px solid #fff;border-radius:10px;font-family:Arial,sans-serif;font-size:26px;padding:12px 0;cursor:pointer;">Go</button>' +
        '</div>' +
      '</div>' +
      '<div style="' + ROW + 'margin-bottom:6px;">' +
        countTile('calved', 'Calved') + countTile('dueSoon', 'Due Soon') + countTile('calvedSince', 'Calved Since') + countTile('activity', 'Activity') +
      '</div>' +
      '<div style="' + ROW + 'margin-bottom:6px;">' +
        countTile('flagged', 'Flagged') + countTile('open', 'Open') + countTile('sell', 'Sell') + iconTile('fieldCount', '&#9989;', 'Field Cnt') +
      '</div>' +
      '<div style="' + ROW + '">' +
        iconTile('tally', '&#128290;', 'Tally') + iconTile('bulk', '&#128295;', 'Bulk') + countTile('inHeat', 'In Heat') +
      '</div>' +
      '<div id="liteStatus" style="margin-top:14px;text-align:center;font-size:12px;color:#0C5A8E;min-height:16px;"></div>' +
    '</div>';
  }

  var TILE_NOTES = {
    calved: 'The Calved list', dueSoon: 'The Due Soon list', calvedSince: 'Calved Since', activity: 'Today\'s Activity',
    flagged: 'The Flagged list', open: 'The Open list', sell: 'The Sell list', fieldCount: 'Field Count',
    tally: 'Herd Tally', bulk: 'Bulk Entry', inHeat: 'The In Heat list'
  };

  function ageLabel(iso){
    if(!iso) return 'an earlier visit';
    var d = new Date(iso);
    if(isNaN(d.getTime())) return 'an earlier visit';
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if(mins < 1) return 'just now';
    if(mins < 60) return mins + ' minute' + (mins === 1 ? '' : 's') + ' ago';
    var hrs = Math.round(mins / 60);
    if(hrs < 24) return hrs + ' hour' + (hrs === 1 ? '' : 's') + ' ago';
    var days = Math.round(hrs / 24);
    return days + ' day' + (days === 1 ? '' : 's') + ' ago';
  }

  // ---------- the screen ----------
  Lite.register('home', function(root){
    root.innerHTML = homeHtml();
    var value = '';
    var have = {};            // tables that are ready to count (from a saved copy or loaded live)
    var live = {};            // tables loaded live this visit
    var home = document.getElementById('liteHome');
    function alive(){ return document.getElementById('liteHome') === home && !!home; }

    function showValue(){ document.getElementById('liteDisplay').innerHTML = value ? H(value) : '&nbsp;'; }
    function cap(n){ return n > 99 ? '99+' : String(n); }
    function ready(key){ return NEEDS[key].every(function(t){ return have[t]; }); }

    function updateCounts(){
      if(!alive()) return;
      var c = Lite.homeCounts();
      ['calved', 'dueSoon', 'calvedSince', 'activity', 'flagged', 'open', 'sell', 'inHeat'].forEach(function(key){
        var el = document.getElementById('n-' + key);
        if(el) el.textContent = ready(key) ? cap(c[key]) : '–';
      });
      var lbl = document.getElementById('l-calvedSince');
      if(lbl && ready('calvedSince')) lbl.textContent = c.calvedSinceDate ? fmtDateShort(c.calvedSinceDate) : 'Set date';
    }
    function updateStatus(){
      if(!alive()) return;
      var el = document.getElementById('liteStatus');
      var pending = Lite.pendingCount();
      var parts = [];
      if(live.cows) parts.push('Up to date');
      else if(have.cows) parts.push('Saved copy from ' + ageLabel(Lite.cacheSavedAt()) + ', waiting for signal');
      else parts.push('Loading…');
      if(pending) parts.push(pending + ' save' + (pending === 1 ? '' : 's') + ' waiting to send');
      el.textContent = parts.join(' · ');
    }
    function absorb(res){
      (res.live || []).forEach(function(t){ have[t] = true; live[t] = true; });
      (res.saved || []).forEach(function(t){ have[t] = true; });
      updateCounts(); updateStatus();
    }

    // Number pad
    home.addEventListener('click', function(e){
      var digit = e.target.closest('.lite-digit');
      if(digit){ if(value.length < 6){ value += digit.getAttribute('data-digit'); showValue(); } return; }
      if(e.target.closest('#liteBack')){ value = value.slice(0, -1); showValue(); return; }
      if(e.target.closest('#liteGo')){
        if(!value.trim()){ Lite.toast('Enter a cow number'); return; }
        if(!have.cows){ Lite.toast('Cows are still loading'); return; }
        var found = Lite.searchCows(value);
        if(!found.length){ Lite.toast('No cow found matching "' + value + '"'); return; }
        Lite.show('cowResults', { cows: found, query: value });
        return;
      }
      if(e.target.closest('#liteAddCow')){ Lite.toast('Add Cow opens in a later step'); return; }
      if(e.target.closest('#liteProfile')){ Lite.toast('The cattle list opens in the next step'); return; }
      var tile = e.target.closest('.lite-tile');
      if(tile){ Lite.toast((TILE_NOTES[tile.getAttribute('data-tile')] || 'That screen') + ' opens in a later step'); }
    });

    // Instant: saved copy first. Then fresh cows, then the rest, so the pad is useful right away.
    Lite.useSaved(HOME_ALL).forEach(function(t){ have[t] = true; });
    updateCounts(); updateStatus();
    Lite.load(HOME_FIRST).then(function(r){
      absorb(r);
      return Lite.load(HOME_REST);
    }).then(function(r){
      absorb(r);
      return Lite.flush();
    }).then(function(){ updateStatus(); });

    var onQueue = function(){ if(alive()) updateStatus(); else document.removeEventListener('lite:queue', onQueue); };
    document.addEventListener('lite:queue', onQueue);
  });

  // Temporary list for step 3: the cows Go found. Replaced by the real cow screen in step 4.
  Lite.register('cowResults', function(root, args){
    var items = args.cows.map(function(c){
      var status = isActive(c) ? '' : '<span style="background:#A32D2D;color:#fff;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700;margin-left:8px;text-transform:uppercase;">' + H(c.status) + '</span>';
      return '<div class="lite-cow" data-n="' + H(c.number) + '" style="background:#fff;border:2px solid #2E88C4;border-radius:12px;padding:12px 14px;margin-bottom:8px;color:#0C5A8E;font-size:18px;cursor:pointer;">' +
        '<b>#' + H(c.number) + '</b>' + status +
        (c.lot ? '<div style="font-size:13px;color:#6b6350;margin-top:2px;">' + H(c.lot) + '</div>' : '') + '</div>';
    }).join('');
    root.innerHTML = '<div style="font-family:Arial,sans-serif;">' +
      '<div id="liteHomeBtn" role="button" style="' + tileBox + 'min-height:52px;font-size:16px;font-weight:700;margin-bottom:14px;">Home</div>' +
      '<div style="color:#0C5A8E;font-size:14px;margin-bottom:10px;">' + args.cows.length + ' cow' + (args.cows.length === 1 ? '' : 's') + ' matching "' + H(args.query) + '"</div>' +
      items + '</div>';
    root.addEventListener('click', function handler(e){
      if(e.target.closest('#liteHomeBtn')){ root.removeEventListener('click', handler); Lite.show('home'); return; }
      if(e.target.closest('.lite-cow')){ Lite.toast('The cow screen opens in the next step'); }
    });
  });
})();
