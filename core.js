/* CHAmp-Lite core, part 1 of the app.
 * What it does: talks to the same Supabase database as CHAmp, and holds saves on the phone
 * when there is no signal, sending them later. Behavior is copied from CHAmp's api() and
 * pending-writes queue. It has no screens in it.
 *
 * IMPORTANT: CHAmp and CHAmp-Lite live on the same web domain, so they share the phone's
 * saved storage. Every storage name here starts with "champlite_" so the two apps can never
 * read, send, or erase each other's held saves or saved copies.
 */
(function(){
  'use strict';

  var SUPABASE_URL = 'https://nuutfigyhjyqhtxotuln.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_jvBVaIs5ZYmOUuE8o28mqQ_RMipD5Xw';   // public key, same one CHAmp uses
  var REST = SUPABASE_URL + '/rest/v1';
  var HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  var QUEUE_KEY = 'champlite_pending_writes_v1';
  var CACHE_PREFIX = 'champlite_cache_v1_';
  var CACHE_TIME_KEY = 'champlite_cache_time_v1';
  var READ_TIMEOUT_MS = 15000;   // reads give up after 15 seconds and use the phone's saved copy

  // The tables Lite reads, with the same query CHAmp uses for each one.
  var TABLES = {
    cows:            '/cows?select=*&order=number.asc',
    treatments:      '/treatments?select=*',
    calvings:        '/calvings?select=*',
    general_notes:   '/general_notes?select=*',
    weights:         '/weights?select=*',
    breeding_records:'/breeding_records?select=*',
    cow_photos:      '/cow_photos?select=*',
    herd_tally:      '/herd_tally?select=*',
    calf_treatments: '/calf_treatments?select=*',
    calf_weights:    '/calf_weights?select=*',
    bulls:           '/bulls?select=*&order=name.asc',
    medicines:       '/medicines?select=*&order=name.asc',
    locations:       '/locations?select=*&order=name.asc',
    owners:          '/owners?select=*&order=name.asc',
    cow_groups:      '/cow_groups?select=*&order=name.asc',
    med_reasons:     '/med_reasons?select=*&order=name.asc',
    buyers:          '/buyers?select=*&order=name.asc',
    heat_log:        '/heat_log?select=*&order=heated_at.desc',
    home_stats_settings: '/home_stats_settings?select=*&limit=1',
    app_settings:    '/app_settings?select=*'
  };

  var Lite = { data: {}, TABLES: TABLES, version: 1 };

  // ---------- small helpers ----------
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function emit(name, detail){
    try{ document.dispatchEvent(new CustomEvent(name, { detail: detail })); }catch(e){}
  }
  function setStatus(state, message){ emit('lite:status', { state: state, message: message || '' }); }
  function storeGet(key){ try{ return localStorage.getItem(key); }catch(e){ return null; } }
  function storeSet(key, val){ try{ localStorage.setItem(key, val); return true; }catch(e){ return false; } }
  Lite.makeLocalId = function(prefix){
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  };

  // ---------- talking to the database (same retry rules as CHAmp's api) ----------
  // Network failure: tried 3 times (pause 0.4s, then 0.8s), then the error is marked isNetworkFailure.
  // Server error (database said no): thrown as an ordinary error with .status.
  Lite.api = async function(path, options){
    var opts = options || {};
    var isRead = !opts.method || String(opts.method).toUpperCase() === 'GET';
    setStatus('busy');
    var maxAttempts = 3;
    var res;
    for(var attempt = 1; attempt <= maxAttempts; attempt++){
      var timer = null, ctrl = null;
      try{
        var init = Object.assign({ headers: HEADERS }, opts);
        // Only reads get a time limit. A save is never cut off part-way, so it can't be sent twice.
        if(isRead && typeof AbortController !== 'undefined'){
          ctrl = new AbortController();
          init.signal = ctrl.signal;
          timer = setTimeout(function(){ ctrl.abort(); }, READ_TIMEOUT_MS);
        }
        res = await fetch(REST + path, init);
        if(timer) clearTimeout(timer);
        break;
      }catch(networkErr){
        if(timer) clearTimeout(timer);
        if(attempt < maxAttempts){ await sleep(400 * attempt); continue; }
        networkErr.isNetworkFailure = true;
        setStatus('err', 'Could not reach the database. Check your signal. Your last change may not have saved yet.');
        throw networkErr;
      }
    }
    if(!res.ok){
      var errText = '';
      try{ errText = await res.text(); }catch(e){}
      var err = new Error('Supabase error ' + res.status + ': ' + errText);
      err.status = res.status;
      setStatus('err', 'The database did not accept that. Try again.');
      throw err;
    }
    setStatus('ok');
    var text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  // ---------- held saves (the queue) ----------
  // Each entry looks like CHAmp's: { localId, kind: 'insert'|'update'|'delete', table, path, method,
  //   body, tempId?, recordId?, cowNumber?, field? }
  Lite.getPending = function(){
    try{
      var raw = storeGet(QUEUE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    }catch(e){ return []; }
  };
  function savePending(list){ storeSet(QUEUE_KEY, JSON.stringify(list)); }
  Lite.pendingCount = function(){ return Lite.getPending().length; };
  Lite.queueWrite = function(entry){
    if(!entry.localId) entry.localId = Lite.makeLocalId('w');
    var list = Lite.getPending();
    list.push(entry);
    savePending(list);
    emit('lite:queue', { count: list.length });
    return entry.localId;
  };
  function removePending(localId){
    var list = Lite.getPending().filter(function(w){ return w.localId !== localId; });
    savePending(list);
    emit('lite:queue', { count: list.length });
  }

  // Send held saves in order. If the signal is still gone, stop and keep the rest.
  // If the database refuses one (a real error), drop that one and keep going, same as CHAmp.
  var flushing = false;
  Lite.flush = async function(){
    if(flushing) return { sent: 0, left: Lite.pendingCount() };
    var queue = Lite.getPending();
    if(queue.length === 0) return { sent: 0, left: 0 };
    flushing = true;
    var sent = 0;
    try{
      for(var i = 0; i < queue.length; i++){
        var entry = queue[i];
        try{
          var opts = { method: entry.method, headers: Object.assign({}, HEADERS, { 'Prefer': 'return=representation' }) };
          if(entry.method !== 'DELETE') opts.body = JSON.stringify(entry.body);
          var result = await Lite.api(entry.path, opts);
          removePending(entry.localId);
          sent++;
          emit('lite:synced', { entry: entry, result: result });
        }catch(err){
          if(err && err.isNetworkFailure){ break; }   // still no signal: keep the rest for later
          console.error('A held save was refused and dropped', entry, err);
          removePending(entry.localId);
          emit('lite:dropped', { entry: entry, error: String(err && err.message || err) });
        }
      }
    } finally {
      flushing = false;
    }
    return { sent: sent, left: Lite.pendingCount() };
  };

  // ---------- loading data (with the phone's saved copy as the fallback) ----------
  function cacheWrite(name, rows){ storeSet(CACHE_PREFIX + name, JSON.stringify(rows)); }
  function cacheRead(name){
    var raw = storeGet(CACHE_PREFIX + name);
    if(!raw) return null;
    try{ return JSON.parse(raw); }catch(e){ return null; }
  }
  Lite.cacheSavedAt = function(){ return storeGet(CACHE_TIME_KEY); };

  // Load the named tables in parallel. Each one that loads is saved on the phone.
  // Each one that fails uses the phone's saved copy instead (if there is one).
  // Returns { live: [names], saved: [names], missing: [names] }.
  Lite.load = async function(names){
    var list = names || Object.keys(TABLES);
    var out = { live: [], saved: [], missing: [] };
    await Promise.all(list.map(async function(name){
      var path = TABLES[name];
      if(!path){ out.missing.push(name); return; }
      try{
        var rows = await Lite.api(path, { method: 'GET' });
        Lite.data[name] = rows || [];
        cacheWrite(name, Lite.data[name]);
        out.live.push(name);
      }catch(e){
        var cached = cacheRead(name);
        if(cached){ Lite.data[name] = cached; out.saved.push(name); }
        else { if(!Lite.data[name]) Lite.data[name] = []; out.missing.push(name); }
      }
    }));
    if(out.live.length) storeSet(CACHE_TIME_KEY, new Date().toISOString());
    emit('lite:loaded', out);
    return out;
  };

  // Try to send held saves whenever the signal comes back.
  try{
    window.addEventListener('online', function(){ Lite.flush(); });
  }catch(e){}

  window.Lite = Lite;
})();
