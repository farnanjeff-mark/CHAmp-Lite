/* CHAmp-Lite, part 6: the report lists behind the home tiles (Today's Activity, Calved, Due Soon, Calved Since, Flagged, Open, Sell, In Heat) and Print.
 * The lists are CHAmp's own code, copied over. Tap a cow and you go to her profile; Back brings the list back.
 * No Export, no Text, no Show Cards pop-ups: Lite only prints. */
(function(){
  'use strict';
  var D = Lite.data;
  var HEADERS = Lite.HEADERS;
  ['cows','breeding_records','calvings','treatments','general_notes','weights','heat_log','home_stats_settings','calf_treatments','calf_weights','app_settings','herd_tally'].forEach(function(n){ if(!D[n]) D[n] = []; });
  function showToast(m){ Lite.toast(m); }
  function openModal(html){ return Lite.openModal(html); }
  function closeModal(){ Lite.closeModal(); }
  function escapeHtml(s){ return Lite.escapeHtml(s); }
  function daysAgo(iso){
    var d = new Date(iso+'T00:00:00'); var now = new Date(); now.setHours(0,0,0,0);
    return Math.round((now-d)/86400000);
  }
  // "Hide LA breeding activity" setting (on unless turned off), same rule as the Activity count on the home screen
  function breedingHiddenFor(num){
    var hide = true;
    D.app_settings.forEach(function(r){ if(r.key === 'hide_la_breeding_activity') hide = (r.value !== 'false'); });
    if(!hide) return false;
    var cow = D.cows.find(function(c){ return c.number === num; });
    return !!(cow && cow.owner === 'LA');
  }
  function hss(){ return D.home_stats_settings[0] || null; }
  function setHss(row){ D.home_stats_settings = [row]; Lite.saveCopy('home_stats_settings'); document.dispatchEvent(new CustomEvent('lite:report-date')); }
  function closeAllModals(){ while(document.querySelector('.modal-backdrop')) Lite.closeModal(); }
  // a cow tapped in a report: her profile opens, and Back returns to the same report
  function openCow(num, returnAction, returnLabel){
    closeAllModals();
    Lite.cowBack = { screen: 'reportback', args: { action: returnAction }, label: returnLabel || '← Back' };
    Lite.show('cow', { num: num });
  }
  Lite.register('reportback', function(root, args){ Lite.show('home'); setTimeout(function(){ if(args && args.action) args.action(); }, 30); });
  var PRINT_CSS = 'body.printing-list #app, body.printing-list .modal-backdrop{ display:none !important; } body.printing-list #printListOutput{ display:block !important; } #printListOutput{ display:none; }';
  (function(){ var st = document.createElement('style'); st.textContent = PRINT_CSS; document.head.appendChild(st);
    var out = document.createElement('div'); out.id = 'printListOutput'; document.body.appendChild(out);
    window.addEventListener('afterprint', function(){ document.body.classList.remove('printing-list'); }); })();
  // Print button row that sits above Close in a report pop-up
  function addReportOutputRow(modal, title, tableContainerSel){
    var row = document.createElement('div');
    row.className = 'modal-actions';
    row.innerHTML = '<button class="btn btn-outline btn-full" data-report-out="print">🖨️ Print</button>';
    var closeRow = modal.querySelector('.modal-actions');
    closeRow.parentNode.insertBefore(row, closeRow);
    row.querySelector('[data-report-out]').addEventListener('click', function(){
      var data = reportDataFromTable(modal.querySelector(tableContainerSel));
      if(!data){ showToast('Nothing in this report yet'); return; }
      printReportData(typeof title === 'function' ? title() : title, data);
    });
  }

  // ---- state the copied Field Count / Herd Tally code uses ----
  var FIELD_COUNT_STORE_KEY = 'champlite_field_count_checked_v1';   // Lite's own key; CHAmp's checkmarks are never touched
  var fieldCountChecked = new Set();
  try{ var savedChecks = JSON.parse(localStorage.getItem(FIELD_COUNT_STORE_KEY) || '[]'); if(Array.isArray(savedChecks)) fieldCountChecked = new Set(savedChecks); }catch(e){}
  function saveFieldCountChecked(){ try{ localStorage.setItem(FIELD_COUNT_STORE_KEY, JSON.stringify(Array.from(fieldCountChecked))); }catch(e){} }
  var fieldCountHideSnapshot = null, lastFieldCountMatched = [], lastFieldCountCalvesOnly = false;
  var herdTally = D.herd_tally;
  // ---- CHAmp's code, copied ----
    function populateFieldCountFilters(){
      const locSel = document.getElementById('fieldCountLocationFilter');
      const grpSel = document.getElementById('fieldCountGroupFilter');
      const usedLots = [...new Set(D.cows.map(c=>c.lot).filter(Boolean))].sort();
      const usedGroups = [...new Set(D.cows.map(c=>c.cow_group).filter(Boolean))].sort();
      locSel.innerHTML = `<option value="">All Locations</option>` + usedLots.map(l=>`<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
      grpSel.innerHTML = `<option value="">All Groups</option>` + usedGroups.map(g=>`<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    }
    function activeCalfFor(num){
      return calvingsFor(num).filter(c=>!c.promoted_to_cow_number && !c.calf_outcome).sort((a,b)=>b.calving_date.localeCompare(a.calving_date))[0] || null;
    }
    function setFieldCountHide(on){
      fieldCountHideSnapshot = on ? new Set(fieldCountChecked) : null;
      const btn = document.getElementById('fieldCountHideBtn');
      btn.textContent = on ? 'Hide checked: ON' : 'Hide checked: OFF';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      renderFieldCountList();
    }
    function renderFieldCountList(){
      const locVal = document.getElementById('fieldCountLocationFilter').value;
      const grpVal = document.getElementById('fieldCountGroupFilter').value;
      const calvesOnly = document.getElementById('fieldCountCalvesOnly').checked;
      let matched = D.cows.filter(c=> isActiveStatus(c) && (!locVal || c.lot===locVal) && (!grpVal || c.cow_group===grpVal));
      if(calvesOnly){
        matched = matched
          .map(c=> ({ cow:c, calf: activeCalfFor(c.number) }))
          .filter(x=> x.calf)
          .map(x=> x.cow);
      }
      matched.sort((a,b)=> Lite.cowNumCmp(a.number, b.number));
      const shown = fieldCountHideSnapshot ? matched.filter(c=>!fieldCountHideSnapshot.has(c.number)) : matched;
      lastFieldCountMatched = shown;
      lastFieldCountCalvesOnly = calvesOnly;
      const listEl = document.getElementById('fieldCountList');
      const noneEl = document.getElementById('noFieldCountCows');
      listEl.innerHTML = '';
      noneEl.classList.toggle('hidden', shown.length !== 0);
      shown.forEach(cow=>{
        const isChecked = fieldCountChecked.has(cow.number);
        const calf = calvesOnly ? activeCalfFor(cow.number) : null;
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:10px;background:${isChecked ? '#EAF3DE' : '#fff'};border:1px solid ${isChecked ? '#C0DD97' : '#ddd'};border-radius:10px;padding:10px 12px;cursor:pointer;`;
        row.innerHTML = `
          <input type="checkbox" ${isChecked ? 'checked' : ''} style="width:20px;height:20px;accent-color:${isChecked ? '#27500A' : '#0274BA'};pointer-events:none;">
          <span style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:${isChecked ? '#27500A' : '#333'};">#${escapeHtml(cow.number)}</span>
          ${calf ? `<span style="font-family:Arial,sans-serif;font-size:12px;color:${isChecked ? '#6b8f4a' : '#6b6350'};">— ${calfSexLabel(calf.calf_sex).charAt(0)} calf, born ${fmtDateShort(calf.calving_date)}</span>` : ''}
        `;
        row.addEventListener('click', ()=>{
          if(fieldCountChecked.has(cow.number)) fieldCountChecked.delete(cow.number);
          else fieldCountChecked.add(cow.number);
          saveFieldCountChecked();
          renderFieldCountList();
        });
        listEl.appendChild(row);
      });
      document.getElementById('fieldCountTally').textContent = `${matched.filter(c=>fieldCountChecked.has(c.number)).length} of ${matched.length} checked`;
    }
    function renderHerdTally(){
      const el = document.getElementById('herdTallyContent');
      const emptyEl = document.getElementById('herdTallyEmptyState');
      if(!el) return;
      D.herd_tally = herdTally; Lite.saveCopy('herd_tally');
      const sorted = [...herdTally].sort((a,b)=> a.location.localeCompare(b.location));
      emptyEl.classList.toggle('hidden', sorted.length !== 0);
      el.innerHTML = sorted.map(entry=>{
        const loc = entry.location;
        return `
          <div class="farm-tally-card" style="position:relative;">
            <button class="record-del herd-tally-remove-btn" data-loc="${escapeHtml(loc)}" title="Remove location" style="top:12px;right:12px;">&times;</button>
            <div class="farm-tally-name">${escapeHtml(loc)}</div>
            <div class="farm-tally-numbers">
              <div class="farm-tally-item" data-loc="${escapeHtml(loc)}" data-field="cows">
                <span class="farm-tally-num">${entry.cows||0}</span>
                <span class="farm-tally-label">Cows</span>
              </div>
              <div class="farm-tally-item" data-loc="${escapeHtml(loc)}" data-field="calves">
                <span class="farm-tally-num">${entry.calves||0}</span>
                <span class="farm-tally-label">Calves</span>
              </div>
              <div class="farm-tally-item" data-loc="${escapeHtml(loc)}" data-field="bulls">
                <span class="farm-tally-num">${entry.bulls||0}</span>
                <span class="farm-tally-label">Bulls</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
      el.querySelectorAll('.farm-tally-item').forEach(item=>{
        item.addEventListener('click', ()=> editHerdTallyFieldModal(item.dataset.loc, item.dataset.field));
      });
      el.querySelectorAll('.herd-tally-remove-btn').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          e.stopPropagation();
          removeHerdTallyLocation(btn.dataset.loc);
        });
      });
    }
    function addHerdTallyLocationModal(){
      const modal = openModal(`
        <div class="modal-title">Add Location</div>
        <div class="field">
          <label>Location Name</label>
          <input type="text" id="newHerdTallyLoc" placeholder="e.g. Back Forty" autofocus/>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelAddHerdTallyLoc">Cancel</button>
          <button class="btn btn-barn" id="confirmAddHerdTallyLoc">Add Location</button>
        </div>
      `);
      modal.querySelector('#cancelAddHerdTallyLoc').addEventListener('click', closeModal);
      modal.querySelector('#confirmAddHerdTallyLoc').addEventListener('click', async ()=>{
        const name = modal.querySelector('#newHerdTallyLoc').value.trim();
        if(!name){ showToast('Enter a location name'); return; }
        if(herdTally.some(t=>t.location.toLowerCase()===name.toLowerCase())){ showToast('That location already exists'); return; }
        const btn = modal.querySelector('#confirmAddHerdTallyLoc');
        btn.disabled = true;
        try{
          const inserted = await Lite.api('/herd_tally', {
            method:'POST',
            headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
            body: JSON.stringify({ location: name, cows:0, calves:0, bulls:0 })
          });
          herdTally.push(inserted[0]);
          closeModal();
          renderHerdTally();
          showToast('Location added');
        }catch(e){
          btn.disabled = false;
          showToast('Could not add — try again');
        }
      });
    }
    async function removeHerdTallyLocation(loc){
      if(!confirm(`Remove "${loc}" from Herd Tally? This can't be undone.`)) return;
      try{
        const existing = herdTally.find(t=>t.location===loc);
        if(existing){
          await Lite.api('/herd_tally?id=eq.' + encodeURIComponent(existing.id), { method:'DELETE' });
          herdTally = herdTally.filter(t=>t.id!==existing.id); D.herd_tally = herdTally;
        }
        renderHerdTally();
        showToast('Location removed');
      }catch(e){
        showToast('Could not remove — try again');
      }
    }
    function editHerdTallyFieldModal(loc, field){
      const entry = herdTally.find(t=>t.location===loc) || { cows:0, calves:0, bulls:0 };
      const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);
      const modal = openModal(`
        <div class="modal-title">${escapeHtml(loc)} — ${fieldLabel}</div>
        <div class="field">
          <label>${fieldLabel} Count</label>
          <input type="number" id="tallyFieldValue" min="0" value="${entry[field]||0}" autofocus/>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelTallyField">Cancel</button>
          <button class="btn btn-barn" id="confirmTallyField">Save</button>
        </div>
      `);
      modal.querySelector('#cancelTallyField').addEventListener('click', closeModal);
      modal.querySelector('#confirmTallyField').addEventListener('click', async ()=>{
        const val = parseInt(modal.querySelector('#tallyFieldValue').value, 10) || 0;
        const btn = modal.querySelector('#confirmTallyField');
        btn.disabled = true;
        try{
          const existing = herdTally.find(t=>t.location===loc);
          if(existing){
            const updated = await Lite.api('/herd_tally?id=eq.' + encodeURIComponent(existing.id), {
              method:'PATCH',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify({ [field]: val })
            });
            const idx = herdTally.findIndex(t=>t.id===existing.id);
            if(idx !== -1) herdTally[idx] = updated[0];
          } else {
            const body = { location: loc, cows:0, calves:0, bulls:0 };
            body[field] = val;
            const inserted = await Lite.api('/herd_tally', {
              method:'POST',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(body)
            });
            herdTally.push(inserted[0]);
          }
          closeModal();
          renderHerdTally();
          showToast('Tally updated');
        }catch(e){
          btn.disabled = false;
          showToast('Could not save — check your signal and try again');
        }
      });
    }
    function headcountByOwnerModal(){
      const counts = {};
      D.cows.filter(isActiveStatus).forEach(c=>{
        const owner = c.owner || 'Unassigned';
        counts[owner] = (counts[owner]||0) + 1;
      });
      const entries = Object.entries(counts).sort((a,b)=> b[1]-a[1]);
      const modal = openModal(`
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Headcount by Owner</span>
          <button class="modal-top-close-btn" style="background:none;border:none;font-size:26px;color:#a08f6b;cursor:pointer;line-height:1;padding:0 2px;">&times;</button>
        </div>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#8a8163;margin-bottom:10px;">Every active cow, grouped and counted by owner.</div>
        <div style="margin-bottom:16px;">
          ${entries.map(([owner,count])=>`
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);font-family:Arial,sans-serif;">
              <span>${escapeHtml(owner)}</span><span style="font-weight:700;">${count}</span>
            </div>
          `).join('')}
          <div style="display:flex;justify-content:space-between;padding:10px 0;font-family:Arial,sans-serif;font-weight:700;">
            <span>Total</span><span>${D.cows.filter(isActiveStatus).length}</span>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-barn btn-full" id="closeHeadcountBtn">Close</button>
        </div>
      `);
      modal.querySelector('#closeHeadcountBtn').addEventListener('click', closeModal);
      modal.querySelector('.modal-top-close-btn').addEventListener('click', closeModal);
    }
    function todaysActivityModal(){
      const modal = openModal(`
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Today's Activity</span>
          <button class="modal-top-close-btn" style="background:none;border:none;font-size:26px;color:#a08f6b;cursor:pointer;line-height:1;padding:0 2px;">&times;</button>
        </div>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#8a8163;margin-bottom:10px;">Every treatment, weight, note, breeding, and calving entry (cow and calf) for active cows, logged within the time frame you pick below.</div>
        <div class="field">
          <label>Time Frame</label>
          <select id="todaysActivityTimeframe">
            <option value="0" selected>Today</option>
            <option value="7">1 Week</option>
            <option value="30">1 Month</option>
          </select>
        </div>
        <div id="todaysActivityCount" style="font-family:Arial,sans-serif;font-size:13px;color:#6b6350;margin-bottom:10px;"></div>
        <div id="todaysActivityTable" style="overflow-x:auto;margin-bottom:14px;"></div>
        <div id="todaysActivityResults" style="margin-bottom:14px;"></div>
        <div class="modal-actions">
          <button class="btn btn-barn btn-full" id="closeTodaysActivityBtn">Close</button>
        </div>
      `);
      function currentEntries(){
        const days = parseInt(modal.querySelector('#todaysActivityTimeframe').value, 10);
        const entries = [];
        function cowIsActive(num){
          const cow = D.cows.find(c=>c.number===num);
          return cow ? isActiveStatus(cow) : true;
        }
        D.treatments.forEach(t=>{
          if(daysAgo(t.date) <= days && daysAgo(t.date) >= 0 && cowIsActive(t.cow_number)){
            const desc = t.medicine ? `${t.medicine}${t.reason ? ' / '+t.reason : ''}` : (t.notes||'note');
            entries.push({ date: t.date, num: t.cow_number, type: 'Med', details: desc });
          }
        });
        D.calvings.forEach(c=>{
          if(daysAgo(c.calving_date) <= days && daysAgo(c.calving_date) >= 0 && cowIsActive(c.cow_number)){
            const parts = [`${calfSexLabel(c.calf_sex)} calf`];
            if(c.birth_weight!=null) parts.push(c.birth_weight+' lbs');
            entries.push({ date: c.calving_date, num: c.cow_number, type: 'Calving', details: parts.join(', ') });
          }
        });
        D.general_notes.forEach(n=>{
          if(daysAgo(n.note_date) <= days && daysAgo(n.note_date) >= 0 && cowIsActive(n.cow_number)){
            entries.push({ date: n.note_date, num: n.cow_number, type: 'Note', details: n.note||'' });
          }
        });
        D.weights.forEach(w=>{
          if(daysAgo(w.weigh_date) <= days && daysAgo(w.weigh_date) >= 0 && cowIsActive(w.cow_number)){
            entries.push({ date: w.weigh_date, num: w.cow_number, type: 'Weight', details: w.weight!=null ? w.weight+' lbs' : '' });
          }
        });
        D.breeding_records.forEach(b=>{
          if(daysAgo(b.breed_date) <= days && daysAgo(b.breed_date) >= 0 && cowIsActive(b.cow_number) && !breedingHiddenFor(b.cow_number)){
            entries.push({ date: b.breed_date, num: b.cow_number, type: 'Breeding', details: b.bred_to ? 'Bred to: '+b.bred_to : '' });
          }
        });
        D.calf_treatments.forEach(t=>{
          if(daysAgo(t.date) <= days && daysAgo(t.date) >= 0){
            const cv = D.calvings.find(c=>c.id===t.calving_id);
            if(!cv || !cowIsActive(cv.cow_number)) return;
            const desc = t.medicine ? `${t.medicine}${t.reason ? ' / '+t.reason : ''}` : (t.notes||'note');
            entries.push({ date: t.date, num: cv.cow_number, type: 'Calf Med', details: desc });
          }
        });
        D.calf_weights.forEach(w=>{
          if(daysAgo(w.weigh_date) <= days && daysAgo(w.weigh_date) >= 0){
            const cv = D.calvings.find(c=>c.id===w.calving_id);
            if(!cv || !cowIsActive(cv.cow_number)) return;
            entries.push({ date: w.weigh_date, num: cv.cow_number, type: 'Calf Weight', details: w.weight!=null ? w.weight+' lbs' : '' });
          }
        });
        entries.sort((a,b)=> b.date.localeCompare(a.date));
        return entries;
      }
      function refresh(){
        const entries = currentEntries();
        const countEl = modal.querySelector('#todaysActivityCount');
        const tableEl = modal.querySelector('#todaysActivityTable');
        const resultsEl = modal.querySelector('#todaysActivityResults');
        countEl.textContent = `${entries.length} entr${entries.length!==1?'ies':'y'} matched`;
        if(entries.length === 0){
          tableEl.innerHTML = '';
          resultsEl.innerHTML = '<p class="empty">No activity in this timeframe.</p>';
        } else {
          tableEl.innerHTML = `
            <table style="width:auto;min-width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;white-space:nowrap;">
              <thead><tr style="background:#EFE8D8;"><th style="text-align:left;padding:8px;">Date</th><th style="text-align:left;padding:8px;">Cow #</th><th style="text-align:left;padding:8px;">Type</th><th style="text-align:left;padding:8px;">Details</th></tr></thead>
              <tbody>
                ${entries.map((e,i)=>`
                  <tr style="background:${i%2===0?'#fff':'#F7F2E6'};">
                    <td style="padding:8px;">${fmtDateShort(e.date)}</td>
                    <td style="padding:8px;">#${escapeHtml(e.num)}</td>
                    <td style="padding:8px;">${escapeHtml(e.type)}</td>
                    <td style="padding:8px;white-space:normal;">${escapeHtml(e.details)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          const seen = new Set();
          const cowList = [];
          entries.forEach(e=>{
            if(seen.has(e.num)) return;
            seen.add(e.num);
            const cow = D.cows.find(cw=>cw.number===e.num);
            if(cow) cowList.push(cow);
          });
          resultsEl.innerHTML = '';
          wireTableRowsToCards(tableEl, todaysActivityModal, '← Back to Report');
        }
      }
      refresh();
      modal.querySelector('#todaysActivityTimeframe').addEventListener('change', refresh);
      modal.querySelector('#closeTodaysActivityBtn').addEventListener('click', closeModal);
      modal.querySelector('.modal-top-close-btn').addEventListener('click', closeModal);
      addReportOutputRow(modal, ()=>{
        const sel = modal.querySelector('#todaysActivityTimeframe');
        return "Today's Activity — " + sel.options[sel.selectedIndex].text;
      }, '#todaysActivityTable');
    }
    function bredToText(b){
      if(!b) return '';
      if(b.pregnancy_method === 'BB') return b.natural_sire ? 'BB \u2014 ' + b.natural_sire : 'BB';
      return b.bred_to || b.natural_sire || '';
    }
    function todayDate(){
      const d = new Date(); d.setHours(0,0,0,0); return d;
    }
    function dueSoonEntries(){
      const today = todayDate();
      const cutoff = new Date(today); cutoff.setDate(cutoff.getDate()+14);
      const entries = [];
      D.cows.forEach(cow=>{
        if(!isActiveStatus(cow)) return;
        const list = breedingFor(cow.number).filter(b=>b.expected_due_date);
        if(list.length === 0) return;
        const latest = [...list].sort((a,b)=> b.breed_date.localeCompare(a.breed_date))[0];
        const alreadyCalved = calvingsFor(cow.number).some(c=> c.calving_date >= latest.breed_date);
        if(alreadyCalved) return;
        const dueDate = new Date(latest.expected_due_date+'T00:00:00');
        if(dueDate > cutoff) return;
        entries.push({ cow, breeding: latest, dueDate });
      });
      entries.sort((a,b)=> a.dueDate - b.dueDate);
      return entries;
    }
    function dueSoonModal(){
      const today = todayDate();
      const entries = dueSoonEntries();
      const rows = entries.map((e,i)=>{
        const daysUntil = Math.round((e.dueDate - today)/86400000);
        const daysUntilHtml = daysUntil < 0
          ? `<span style="color:var(--barn);font-weight:700;">${daysUntil}</span>`
          : daysUntil;
        return `<tr style="background:${i%2===0?'#fff':'#F7F2E6'};"><td style="padding:8px;">#${escapeHtml(e.cow.number)}</td><td style="padding:8px;">${fmtDateShort(e.breeding.expected_due_date)}</td><td style="padding:8px;">${daysUntilHtml}</td><td style="padding:8px;">${escapeHtml(bredToText(e.breeding))}</td><td style="padding:8px;">${escapeHtml(e.breeding.pregnancy_method||'')}</td></tr>`;
      }).join('');
      reportCardModal('Due Soon (Next 14 Days)', entries.map(e=>e.cow), ['Cow #','Due Date','Days Until','Bred To','Method'], rows, dueSoonModal, 'Active, bred cows due to calve within 14 days, based on each cow\'s expected due date.');
    }
    function calvedSinceEntries(){
      if(!hss() || !hss().calved_since_date) return [];
      const sinceDate = hss().calved_since_date;
      const seenCows = new Set();
      const entries = [];
      [...D.calvings]
        .filter(c=> c.calving_date >= sinceDate)
        .sort((a,b)=> b.calving_date.localeCompare(a.calving_date))
        .forEach(c=>{
          if(seenCows.has(c.cow_number)) return;
          seenCows.add(c.cow_number);
          const cow = D.cows.find(cw=>cw.number===c.cow_number);
          if(!cow || !isActiveStatus(cow)) return;
          entries.push({ cow, calving: c });
        });
      return entries;
    }
    async function saveCalvedSinceDate(dateVal){
      try{
        if(hss() && hss().id){
          const updated = await Lite.api('/home_stats_settings?id=eq.' + encodeURIComponent(hss().id), {
            method:'PATCH', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
            body: JSON.stringify({ calved_since_date: dateVal })
          });
          setHss(updated[0]);
        } else {
          const inserted = await Lite.api('/home_stats_settings', {
            method:'POST', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
            body: JSON.stringify({ calved_since_date: dateVal })
          });
          setHss(inserted[0]);
        }
      }catch(e){ showToast('Could not save — try again'); }
    }
    function calvedSinceModal(){
      const currentDate = (hss() && hss().calved_since_date) || todayLocal();
      const modal = openModal(`
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Calved Since</span>
          <button class="modal-top-close-btn" style="background:none;border:none;font-size:26px;color:#a08f6b;cursor:pointer;line-height:1;padding:0 2px;">&times;</button>
        </div>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#8a8163;margin-bottom:10px;">Active cows that have calved on or after the date you set below.</div>
        <div class="field" style="display:flex;gap:8px;align-items:flex-end;">
          <div style="flex:1;">
            <label>Count calvings since</label>
            <input type="date" id="calvedSinceDateInput" value="${currentDate}"/>
          </div>
          <button class="btn btn-barn" id="calvedSinceUpdateBtn" style="padding:12px 18px;white-space:nowrap;flex-shrink:0;">Update</button>
        </div>
        <div id="calvedSinceCount" style="font-family:Arial,sans-serif;font-size:13px;color:#6b6350;margin:10px 0;"></div>
        <div id="calvedSinceTable" style="overflow-x:auto;margin-bottom:14px;"></div>
        <div id="calvedSinceResults" style="margin-bottom:14px;"></div>
        <div class="modal-actions">
          <button class="btn btn-barn btn-full" id="closeCalvedSinceBtn">Close</button>
        </div>
      `);
      function refresh(){
        const entries = calvedSinceEntries();
        const countEl = modal.querySelector('#calvedSinceCount');
        const tableEl = modal.querySelector('#calvedSinceTable');
        const resultsEl = modal.querySelector('#calvedSinceResults');
        if(!hss() || !hss().calved_since_date){
          countEl.textContent = 'Pick a date and tap Update to see results.';
          tableEl.innerHTML = '';
          resultsEl.innerHTML = '';
          return;
        }
        countEl.textContent = `${entries.length} cow${entries.length!==1?'s':''} matched`;
        if(entries.length === 0){
          tableEl.innerHTML = '';
          resultsEl.innerHTML = '<p class="empty">No calvings recorded since that date.</p>';
        } else {
          const rows = entries.map((e,i)=> `<tr style="background:${i%2===0?'#fff':'#F7F2E6'};"><td style="padding:8px;">${fmtDateShort(e.calving.calving_date)}</td><td style="padding:8px;">#${escapeHtml(e.cow.number)}</td><td style="padding:8px;">${escapeHtml(e.cow.owner||'')}</td></tr>`).join('');
          tableEl.innerHTML = `
            <table style="width:auto;min-width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;white-space:nowrap;">
              <thead><tr style="background:#EFE8D8;"><th style="text-align:left;padding:8px;">Date</th><th style="text-align:left;padding:8px;">Cow #</th><th style="text-align:left;padding:8px;">Owner</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          `;
          resultsEl.innerHTML = '';
          wireTableRowsToCards(tableEl, calvedSinceModal, '← Back to Report');
        }
      }
      refresh();
      modal.querySelector('#calvedSinceUpdateBtn').addEventListener('click', async ()=>{
        const dateVal = modal.querySelector('#calvedSinceDateInput').value;
        if(!dateVal){ showToast('Pick a date first'); return; }
        await saveCalvedSinceDate(dateVal);
        refresh();
      });
      modal.querySelector('#closeCalvedSinceBtn').addEventListener('click', closeModal);
      modal.querySelector('.modal-top-close-btn').addEventListener('click', closeModal);
    }
    function calvedReportModal(){
      const list = D.cows.filter(c=> isActiveStatus(c) && c.calved).sort((a,b)=>Lite.cowNumCmp(a.number, b.number));
      const rows = list.map((c,i)=>{
        const latest = [...breedingFor(c.number)].sort((a,b)=> b.breed_date.localeCompare(a.breed_date))[0];
        const bredTo = latest ? bredToText(latest) : '';
        return `<tr style="background:${i%2===0?'#fff':'#F7F2E6'};"><td style="padding:8px;">#${escapeHtml(c.number)}</td><td style="padding:8px;">${escapeHtml(c.owner||'')}</td><td style="padding:8px;">${escapeHtml(bredTo)}</td></tr>`;
      }).join('');
      reportCardModal('Calved Cows', list, ['Cow #','Owner','Bred To'], rows, calvedReportModal, 'Active cows currently marked Calved, with the sire from their most recent breeding record.');
    }
    function openCowsReportModal(){
      const entries = [];
      D.cows.forEach(cow=>{
        if(!isActiveStatus(cow)) return;
        const list = breedingFor(cow.number);
        if(list.length === 0) return;
        const latest = [...list].sort((a,b)=> b.breed_date.localeCompare(a.breed_date))[0];
        if(latest.pregnancy_status === 'Open') entries.push({ cow, breeding: latest });
      });
      entries.sort((a,b)=> (b.breeding.open_date||'').localeCompare(a.breeding.open_date||''));
      const modal = openModal(`
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Open Cows</span>
          <button class="modal-top-close-btn" style="background:none;border:none;font-size:26px;color:#a08f6b;cursor:pointer;line-height:1;padding:0 2px;">&times;</button>
        </div>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#8a8163;margin-bottom:10px;">Active cows whose most recent breeding record is marked Open.</div>
        <div id="openCowsCount" style="font-family:Arial,sans-serif;font-size:13px;color:#6b6350;margin-bottom:10px;">${entries.length} cow${entries.length!==1?'s':''} matched</div>
        <div id="openCowsTable" style="overflow-x:auto;margin-bottom:14px;"></div>
        <div id="openCowsList" style="margin-bottom:14px;"></div>
        <div class="modal-actions">
          <button class="btn btn-barn btn-full" id="closeOpenCowsBtn">Close</button>
        </div>
      `);
      const tableEl = modal.querySelector('#openCowsTable');
      const listEl = modal.querySelector('#openCowsList');
      if(entries.length === 0){
        tableEl.innerHTML = '';
        listEl.innerHTML = '<p class="empty">No cows currently marked open.</p>';
      } else {
        const rowsHtml = entries.map((e,i)=>{
          const detail = [];
          if(bredToText(e.breeding)) detail.push(`Bred to: ${bredToText(e.breeding)}`);
          if(e.breeding.pregnancy_method) detail.push(e.breeding.pregnancy_method);
          return `<tr style="background:${i%2===0?'#fff':'#F7F2E6'};"><td style="padding:8px;">${e.breeding.open_date ? fmtDateShort(e.breeding.open_date) : ''}</td><td style="padding:8px;">#${escapeHtml(e.cow.number)}</td><td style="padding:8px;">Open</td><td style="padding:8px;white-space:normal;">${escapeHtml(detail.join(' — '))}</td></tr>`;
        }).join('');
        tableEl.innerHTML = `
          <table style="width:auto;min-width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;white-space:nowrap;">
            <thead><tr style="background:#EFE8D8;"><th style="text-align:left;padding:8px;">Date</th><th style="text-align:left;padding:8px;">Cow #</th><th style="text-align:left;padding:8px;">Type</th><th style="text-align:left;padding:8px;">Details</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        `;
        listEl.innerHTML = '';
        wireTableRowsToCards(tableEl, openCowsReportModal, '← Back to Open Cows');
      }
      modal.querySelector('#closeOpenCowsBtn').addEventListener('click', closeModal);
      modal.querySelector('.modal-top-close-btn').addEventListener('click', closeModal);
      addReportOutputRow(modal, 'Open Cows', '#openCowsTable');
    }
    function heatReportModal(){
      // Only cows marked In Heat right now. Logging a breeding unticks the box, so bred cows drop off.
      const latestTick = {};
      D.heat_log.forEach(h=>{
        const cur = latestTick[h.cow_number];
        if(!cur || String(h.heated_at) > String(cur)) latestTick[h.cow_number] = h.heated_at;
      });
      const list = D.cows.filter(c=>c.in_heat).map(c=>({ cow:c, at: latestTick[c.number] || '' }))
        .sort((a,b)=> String(b.at).localeCompare(String(a.at)) || Lite.cowNumCmp(a.cow.number, b.cow.number));
      const fmtD = iso => new Date(iso).toLocaleDateString('en-US', { month:'numeric', day:'numeric', year:'2-digit' });
      const fmtT = iso => new Date(iso).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
      const td = 'padding:8px;';
      const body = list.map((e,i)=>{
        const bg = i%2===0 ? '#fff' : '#F7F2E6';
        return e.at
          ? `<tr style="background:${bg};"><td style="${td}"><b>#${escapeHtml(e.cow.number)}</b></td><td style="${td}">${escapeHtml(e.cow.lot || '')}</td><td style="${td}">${escapeHtml(fmtD(e.at))}</td><td style="${td}">${escapeHtml(fmtT(e.at))}</td></tr>`
          : `<tr style="background:${bg};"><td style="${td}"><b>#${escapeHtml(e.cow.number)}</b></td><td style="${td}">${escapeHtml(e.cow.lot || '')}</td><td style="${td}color:#8a8163;" colspan="2">time not recorded</td></tr>`;
      }).join('');
      const modal = openModal(`
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>In Heat Report</span>
          <button class="modal-top-close-btn" style="background:none;border:none;font-size:26px;color:#a08f6b;cursor:pointer;line-height:1;padding:0 2px;">&times;</button>
        </div>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#8a8163;margin-bottom:10px;">Cows marked In Heat right now, with the date and time they were marked. A cow drops off this list when she is bred.</div>
        <div style="font-family:Arial,sans-serif;font-size:13px;color:#6b6350;margin-bottom:10px;">${list.length} cow${list.length!==1?'s':''} in heat</div>
        <div id="heatReportTable" style="overflow-x:auto;margin-bottom:14px;"></div>
        <div class="modal-actions">
          <button class="btn btn-outline btn-full" id="heatShowCardsBtn">Show Cards</button>
          <button class="btn btn-outline btn-full" id="closeHeatReportBtn">Close</button>
        </div>
      `);
      const tableEl = modal.querySelector('#heatReportTable');
      if(!list.length){
        tableEl.innerHTML = '<p class="empty">No cows are marked In Heat.</p>';
      }else{
        tableEl.innerHTML = `
          <table style="width:auto;min-width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;white-space:nowrap;">
            <thead><tr style="background:#EFE8D8;"><th style="text-align:left;${td}">Cow #</th><th style="text-align:left;${td}">Location</th><th style="text-align:left;${td}">Date</th><th style="text-align:left;${td}">Time</th></tr></thead>
            <tbody>${body}</tbody>
          </table>`;
        wireTableRowsToCards(tableEl, heatReportModal, '← Back to In Heat Report');
      }
      modal.querySelector('#closeHeatReportBtn').addEventListener('click', closeModal);
      modal.querySelector('.modal-top-close-btn').addEventListener('click', closeModal);
      modal.querySelector('#heatShowCardsBtn').addEventListener('click', ()=>{ closeModal(); Lite.show('cattle', { filter: 'heat:1' }); });
      addReportOutputRow(modal, 'In Heat Report', '#heatReportTable');
    }
    function reportCardModal(title, cowList, headerCells, rowsHtml, reopenFn, note){
      const modal = openModal(`
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>${title}</span>
          <button class="modal-top-close-btn" style="background:none;border:none;font-size:26px;color:#a08f6b;cursor:pointer;line-height:1;padding:0 2px;">&times;</button>
        </div>
        ${note ? `<div style="font-family:Arial,sans-serif;font-size:12px;color:#8a8163;margin-bottom:10px;">${escapeHtml(note)}</div>` : ''}
        <div id="reportCardCount" style="font-family:Arial,sans-serif;font-size:13px;color:#6b6350;margin-bottom:10px;">${cowList.length} cow${cowList.length!==1?'s':''} matched</div>
        <div id="reportTableWrap" style="overflow-x:auto;margin-bottom:14px;"></div>
        <div id="reportCardList" style="margin-bottom:14px;"></div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="reportPrintBtn">🖨️ Print</button>
        </div>
        <div class="modal-actions">
          <button class="btn btn-barn btn-full" id="closeReportBtn">Close</button>
        </div>
      `);
      const tableEl = modal.querySelector('#reportTableWrap');
      const listEl = modal.querySelector('#reportCardList');
      if(cowList.length === 0){
        tableEl.innerHTML = '';
        listEl.innerHTML = '<p class="empty">No matching records.</p>';
      } else {
        tableEl.innerHTML = `
          <table style="width:auto;min-width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;white-space:nowrap;">
            <thead><tr style="background:#EFE8D8;">${headerCells.map(h=>`<th style="text-align:left;padding:8px;">${h}</th>`).join('')}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        `;
        listEl.innerHTML = '';
        wireTableRowsToCards(tableEl, reopenFn, `← Back to ${title}`);
      }
      modal.querySelector('#closeReportBtn').addEventListener('click', closeModal);
      modal.querySelector('.modal-top-close-btn').addEventListener('click', closeModal);
      modal.querySelector('#reportPrintBtn').addEventListener('click', ()=>{
        document.getElementById('printListOutput').innerHTML = `
          <div style="padding:24px;font-family:Arial,sans-serif;color:#000;">
            <h2 style="margin:0 0 4px;">Farnan Cattle Co. — ${title}</h2>
            <div style="font-size:13px;color:#555;margin-bottom:16px;">Printed ${fmtDate(todayLocal())}</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead><tr>${headerCells.map(h=>`<th style="text-align:left;padding:6px;border-bottom:2px solid #000;">${h}</th>`).join('')}</tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        `;
        document.body.classList.add('printing-list');
        requestAnimationFrame(()=> requestAnimationFrame(()=> window.print()));
      });
    }
    function wireTableRowsToCards(tableWrapEl, returnAction, returnLabel){
      if(!tableWrapEl) return;
      const hint = tableWrapEl.previousElementSibling;
      if(hint && hint.classList && hint.classList.contains('card-tap-hint')) hint.remove();
      const table = tableWrapEl.querySelector('table');
      if(!table) return;
      const heads = [...table.querySelectorAll('thead th')].map(th=> th.textContent.trim().toLowerCase());
      let col = heads.findIndex(h=> h === 'cow #' || h === 'cow' || h === 'cow number');
      if(col < 0) col = 0;
      let wired = 0;
      table.querySelectorAll('tbody tr').forEach(tr=>{
        const cell = tr.children[col];
        if(!cell || cell.colSpan > 1) return;
        const num = cell.textContent.replace(/^\s*#/, '').trim();
        const cow = D.cows.find(c=> String(c.number) === num);
        if(!cow) return;
        tr.style.cursor = 'pointer';
        cell.style.color = '#0C5A8E';
        cell.style.textDecoration = 'underline';
        cell.style.fontWeight = '700';
        tr.addEventListener('click', ()=> openCow(cow.number, returnAction, returnLabel));
        wired++;
      });
      if(wired > 0){
        tableWrapEl.insertAdjacentHTML('beforebegin', '<div class="card-tap-hint" style="font-family:Arial,sans-serif;font-size:12px;color:#6b6350;margin-bottom:6px;">Tap a cow to open her card</div>');
      }
    }
    function reportDataFromTable(root){
      const t = root && root.querySelector('table');
      if(!t) return null;
      const headers = [...t.querySelectorAll('thead th')].map(th=>th.textContent.trim());
      const rows = [...t.querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent.replace(/\s+/g,' ').trim()));
      return rows.length ? { headers, rows } : null;
    }
    function printReportData(title, data){
      const th = data.headers.map(h=>`<th style="text-align:left;padding:6px;border-bottom:2px solid #000;">${escapeHtml(h)}</th>`).join('');
      const tr = data.rows.map(r=>`<tr>${r.map(c=>`<td style="padding:6px;border-bottom:1px solid #ccc;">${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
      document.getElementById('printListOutput').innerHTML = `
        <div style="padding:24px;font-family:Arial,sans-serif;color:#000;">
          <h2 style="margin:0 0 4px;">Farnan Cattle Co. — ${escapeHtml(title)}</h2>
          <div style="font-size:13px;color:#555;margin-bottom:16px;">Printed ${fmtDate(todayLocal())}</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
        </div>`;
      document.body.classList.add('printing-list');
      requestAnimationFrame(()=> requestAnimationFrame(()=> window.print()));
    }
    function printListModal(cowList, title, action){
      action = action || 'print';
      const count = cowList.length;
      if(count === 0){ showToast(`No cows to ${action}`); return; }
      const actionLabel = action === 'export' ? 'Export' : 'Print';
      const modal = openModal(`
        <div class="modal-title">${title || (actionLabel + ' This List')}</div>
        <div style="font-family:Arial,sans-serif;font-size:13px;color:#6b6350;margin-bottom:14px;">${actionLabel}s ${count} cow${count!==1?'s':''}. Tag number is always included — also add each cow's most recent:</div>
        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--paper-raised);border:2px solid var(--ink);border-radius:10px;margin-bottom:8px;cursor:pointer;font-weight:700;">
          <input type="checkbox" id="printIncludeMeds" style="width:20px;height:20px;flex-shrink:0;"/> Med
        </label>
        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--paper-raised);border:2px solid var(--ink);border-radius:10px;margin-bottom:8px;cursor:pointer;font-weight:700;">
          <input type="checkbox" id="printIncludeCalving" style="width:20px;height:20px;flex-shrink:0;"/> Calving
        </label>
        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--paper-raised);border:2px solid var(--ink);border-radius:10px;margin-bottom:8px;cursor:pointer;font-weight:700;">
          <input type="checkbox" id="printIncludeNotes" style="width:20px;height:20px;flex-shrink:0;"/> Note
        </label>
        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--paper-raised);border:2px solid var(--ink);border-radius:10px;margin-bottom:8px;cursor:pointer;font-weight:700;">
          <input type="checkbox" id="printIncludeWeights" style="width:20px;height:20px;flex-shrink:0;"/> Weight
        </label>
        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--paper-raised);border:2px solid var(--ink);border-radius:10px;margin-bottom:16px;cursor:pointer;font-weight:700;">
          <input type="checkbox" id="printIncludeBreeding" style="width:20px;height:20px;flex-shrink:0;"/> Breeding
        </label>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelPrintList">Cancel</button>
          <button class="btn btn-barn" id="confirmPrintList">${actionLabel}</button>
        </div>
      `);
      modal.querySelector('#cancelPrintList').addEventListener('click', closeModal);
      modal.querySelector('#confirmPrintList').addEventListener('click', ()=>{
        const opts = {
          meds: modal.querySelector('#printIncludeMeds').checked,
          calving: modal.querySelector('#printIncludeCalving').checked,
          notes: modal.querySelector('#printIncludeNotes').checked,
          weights: modal.querySelector('#printIncludeWeights').checked,
          breeding: modal.querySelector('#printIncludeBreeding').checked
        };
        closeModal();
        buildAndPrintCowList(cowList, opts);
      });
    }
    function buildAndPrintCowList(cowList, opts){
      const rowsHtml = cowList.map(cow=>{
        const parts = [];
        if(opts.meds){
          const latest = [...recordsFor(cow.number)].sort((a,b)=>b.date.localeCompare(a.date))[0];
          if(latest){
            const desc = latest.medicine ? `${latest.medicine}${latest.reason ? ' / '+latest.reason : ''}` : '(note only)';
            parts.push(`Med: ${fmtDate(latest.date)} — ${desc}`);
          }
        }
        if(opts.calving){
          const latest = [...calvingsFor(cow.number)].sort((a,b)=>b.calving_date.localeCompare(a.calving_date))[0];
          if(latest) parts.push(`Calving: ${fmtDate(latest.calving_date)} — ${calfSexLabel(latest.calf_sex)} calf`);
        }
        if(opts.notes){
          const latest = [...generalNotesFor(cow.number)].sort((a,b)=>b.note_date.localeCompare(a.note_date))[0];
          if(latest) parts.push(`Note: ${fmtDate(latest.note_date)} — ${latest.note||''}`);
        }
        if(opts.weights){
          const latest = [...weightsFor(cow.number)].sort((a,b)=>b.weigh_date.localeCompare(a.weigh_date))[0];
          if(latest) parts.push(`Weight: ${fmtDate(latest.weigh_date)}${latest.weight!=null ? ' — '+latest.weight+' lbs' : ''}`);
        }
        if(opts.breeding){
          const latest = [...breedingFor(cow.number)].sort((a,b)=>b.breed_date.localeCompare(a.breed_date))[0];
          if(latest) parts.push(`Breeding: ${fmtDate(latest.breed_date)}${bredToText(latest) ? ' — '+bredToText(latest) : ''}`);
        }
        const meta = [cow.lot, cow.owner].filter(Boolean).join(' · ');
        return `
          <div style="padding:8px 0;border-bottom:1px solid #ccc;">
            <div style="font-weight:700;font-size:16px;">#${escapeHtml(cow.number)}${meta ? ' — '+escapeHtml(meta) : ''}</div>
            ${parts.map(p=>`<div style="font-size:13px;margin-top:2px;color:#333;">${escapeHtml(p)}</div>`).join('')}
          </div>
        `;
      }).join('');
  
      document.getElementById('printListOutput').innerHTML = `
        <div style="padding:24px;font-family:Arial,sans-serif;color:#000;">
          <h2 style="margin:0 0 4px;">Farnan Cattle Co. — Cow List</h2>
          <div style="font-size:13px;color:#555;margin-bottom:16px;">Printed ${fmtDate(todayLocal())} · ${cowList.length} cow${cowList.length!==1?'s':''}</div>
          ${rowsHtml}
        </div>
      `;
      document.body.classList.add('printing-list');
      // iOS Safari can fire window.print() before the DOM above has actually
      // repainted, capturing stale/blank content. A short delay across two
      // animation frames guarantees a real paint has happened first.
      requestAnimationFrame(()=>{
        requestAnimationFrame(()=>{
          window.print();
        });
      });
    }
    function recordsFor(num){
      return D.treatments.filter(t=>t.cow_number===num);
    }
    function calvingsFor(num){
      return D.calvings.filter(c=>c.cow_number===num);
    }
    function generalNotesFor(num){
      return D.general_notes.filter(n=>n.cow_number===num);
    }
    function weightsFor(num){
      return D.weights.filter(w=>w.cow_number===num);
    }
    function breedingFor(num){
      return D.breeding_records.filter(b=>b.cow_number===num);
    }
    function isActiveStatus(cow){
      return !cow.status || cow.status === 'Active';
    }
    function calfSexLabel(sex){
      return sex === 'B' ? 'Bull' : sex === 'H' ? 'Heifer' : 'Unknown';
    }
    function fmtDate(iso){
      const d = new Date(iso+'T00:00:00');
      return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    }
    function fmtDateShort(iso){
      const d = new Date(iso+'T00:00:00');
      return d.toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'2-digit'});
    }
    function localDateFromTimestamp(ts){
      if(!ts) return '';
      const d = new Date(ts); // parses the UTC timestamp correctly
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`; // in the browser's local timezone, not UTC
    }
    function todayLocal(){
      return localDateFromTimestamp(new Date());
    }

  // ---- what the home tiles and cow list call ----
  var NEED = ['cows','breeding_records','calvings','treatments','general_notes','weights','heat_log','home_stats_settings','calf_treatments','calf_weights','app_settings'];
  var OPENERS = { calved: calvedReportModal, dueSoon: dueSoonModal, calvedSince: calvedSinceModal, open: openCowsReportModal, inHeat: heatReportModal, activity: todaysActivityModal };

  // ---- Field Count and Herd Tally screens ----
  var TOOLS_CSS = '.farm-tally-card{background:var(--paper-raised);border:2px solid var(--ink);border-radius:10px;padding:16px 14px;margin-bottom:14px;}.farm-tally-name{font-family:Arial,sans-serif;font-weight:700;font-size:20px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px dashed var(--line);}.farm-tally-numbers{display:flex;justify-content:space-around;}.farm-tally-item{cursor:pointer;padding:6px 12px;border-radius:8px;text-align:center;}.farm-tally-item:active{background:rgba(0,0,0,.06);}.farm-tally-num{display:block;font-size:30px;font-weight:700;font-family:Arial,sans-serif;line-height:1;}.farm-tally-label{display:block;font-family:Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-top:5px;}#fieldCountView input[type=checkbox]{flex-shrink:0;}';
  function toolsStyles(){
    if(Lite.addStyles) Lite.addStyles();
    if(document.getElementById('lite-tools-css')) return;
    var st = document.createElement('style'); st.id = 'lite-tools-css'; st.textContent = TOOLS_CSS; document.head.appendChild(st);
  }
  var FC_HTML = "    <button class=\"btn btn-outline btn-full\" id=\"fieldCountHomeBtn\" style=\"margin-bottom:16px;\">\ud83c\udfe0 Home</button>\n    <div class=\"modal-title\" style=\"margin-bottom:14px;\">Field Count</div>\n    <div style=\"font-family:Arial,sans-serif;font-size:12px;color:#8a8163;margin-bottom:12px;\">A live, on-screen tally for counting cows by location/group \u2014 nothing here is saved to your cow records.</div>\n    <div style=\"display:flex;gap:8px;margin-bottom:12px;\">\n      <select id=\"fieldCountLocationFilter\" style=\"flex:1;\"></select>\n      <select id=\"fieldCountGroupFilter\" style=\"flex:1;\"></select>\n    </div>\n    <div style=\"display:flex;gap:8px;margin-bottom:10px;\">\n      <label style=\"flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:#0274BA;border:2px solid #0274BA;border-radius:10px;padding:10px 12px;cursor:pointer;box-shadow:0 2px 5px rgba(43,38,32,.16);\">\n        <input type=\"checkbox\" id=\"fieldCountCalvesOnly\" style=\"width:18px;height:18px;accent-color:#fff;\"/>\n        <span style=\"font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#fff;white-space:nowrap;\">Calves only</span>\n      </label>\n      <button class=\"btn\" id=\"fieldCountHideBtn\" aria-pressed=\"false\" style=\"flex:1;background:#0274BA;color:#fff;border-color:#0274BA;justify-content:center;padding:10px 12px;\">Hide checked: OFF</button>\n    </div>\n    <div style=\"display:flex;gap:8px;align-items:stretch;margin-bottom:14px;\">\n      <div style=\"flex:1;display:flex;justify-content:space-between;align-items:center;gap:8px;background:#E6F1FB;border:2px solid #0274BA;border-radius:10px;padding:6px 10px;\">\n        <span id=\"fieldCountTally\" style=\"font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#0C447C;\">0 of 0 checked</span>\n        <button class=\"btn\" id=\"fieldCountClearBtn\" style=\"background:#A32D2D;color:#fff;border:none;font-size:12px;padding:8px 12px;\">Clear all</button>\n      </div>\n    </div>\n    <div id=\"fieldCountList\" style=\"display:flex;flex-direction:column;gap:6px;\"></div>\n    <p id=\"noFieldCountCows\" class=\"empty hidden\">No cows match this filter.</p>";
  var HT_HTML = "    <button class=\"btn btn-outline btn-full\" id=\"herdTallyHomeBtn\" style=\"margin-bottom:16px;\">\ud83c\udfe0 Home</button>\n    <div class=\"modal-title\" style=\"margin-bottom:14px;\">Herd Tally</div>\n    <button class=\"btn\" id=\"headcountByOwnerBtn\" style=\"width:100%;background:#fff;border:1.5px solid #2E88C4;color:#0C5A8E;display:flex;align-items:center;gap:10px;text-align:left;padding:12px 14px;font-size:15px;margin-bottom:8px;\"><span style=\"font-size:20px;\">\ud83d\udcca</span>Headcount</button>\n    <button class=\"btn btn-outline btn-full\" id=\"herdTallyPrintBtn\" style=\"margin-bottom:14px;\">\ud83d\udda8\ufe0f Print</button>\n    <div id=\"herdTallyContent\"></div>\n    <div id=\"herdTallyEmptyState\" class=\"empty hidden\">No locations added yet.<br/>Tap \"+ Add Location\" to get started.</div>\n    <button class=\"btn btn-nav-tool btn-full\" id=\"addHerdTallyLocationBtn\" style=\"margin-top:14px;\">+ Add Location</button>";
  // open a screen: show what's saved on the phone right away, refresh from the database behind it
  function openToolScreen(root, id, html, tables, draw){
    toolsStyles();
    root.innerHTML = '<div class="view" id="' + id + '">' + html + '</div>';
    var me = document.getElementById(id);
    function alive(){ return document.getElementById(id) === me && !!me; }
    Lite.useSaved(tables.filter(function(n){ return !Lite.liveAt[n]; }));
    draw();
    var stale = tables.filter(function(n){ return !Lite.liveAt[n] || Date.now() - Lite.liveAt[n] > 60000; });
    if(stale.length) Lite.load(stale).then(function(){ if(alive() && !document.querySelector('.modal-backdrop')) draw(); });
    return alive;
  }
  Lite.register('fieldcount', function(root){
    function draw(){
      var locSel = document.getElementById('fieldCountLocationFilter'), grpSel = document.getElementById('fieldCountGroupFilter');
      var lv = locSel.value, gv = grpSel.value;
      populateFieldCountFilters();
      locSel.value = lv; grpSel.value = gv;
      renderFieldCountList();
    }
    openToolScreen(root, 'fieldCountView', FC_HTML, ['cows','calvings'], draw);
    document.getElementById('fieldCountHomeBtn').addEventListener('click', function(){ Lite.show('home'); });
    document.getElementById('fieldCountLocationFilter').addEventListener('change', renderFieldCountList);
    document.getElementById('fieldCountGroupFilter').addEventListener('change', renderFieldCountList);
    document.getElementById('fieldCountCalvesOnly').addEventListener('change', renderFieldCountList);
    document.getElementById('fieldCountHideBtn').addEventListener('click', function(){ setFieldCountHide(!fieldCountHideSnapshot); });
    document.getElementById('fieldCountClearBtn').addEventListener('click', function(){
      if(fieldCountChecked.size === 0) return;
      if(!confirm('Clear all checkmarks?')) return;
      fieldCountChecked = new Set(); saveFieldCountChecked(); fieldCountHideSnapshot = null; setFieldCountHide(false);
    });
  });
  Lite.register('tally', function(root){
    function draw(){ herdTally = D.herd_tally; renderHerdTally(); }
    fieldCountHideSnapshot = null;
    openToolScreen(root, 'herdTallyView', HT_HTML, ['herd_tally','cows'], draw);
    document.getElementById('herdTallyHomeBtn').addEventListener('click', function(){ Lite.show('home'); });
    document.getElementById('addHerdTallyLocationBtn').addEventListener('click', addHerdTallyLocationModal);
    document.getElementById('headcountByOwnerBtn').addEventListener('click', headcountByOwnerModal);
    document.getElementById('herdTallyPrintBtn').addEventListener('click', function(){
      var sorted = herdTally.slice().sort(function(a,b){ return a.location.localeCompare(b.location); });
      if(!sorted.length){ showToast('Nothing to print yet'); return; }
      var rows = sorted.map(function(e){ return [e.location, String(e.cows||0), String(e.calves||0), String(e.bulls||0)]; });
      var tot = sorted.reduce(function(a,e){ return {cows:a.cows+(e.cows||0), calves:a.calves+(e.calves||0), bulls:a.bulls+(e.bulls||0)}; }, {cows:0,calves:0,bulls:0});
      rows.push(['Total', String(tot.cows), String(tot.calves), String(tot.bulls)]);
      printReportData('Herd Tally', { headers:['Location','Cows','Calves','Bulls'], rows: rows });
    });
  });
  Lite.reports = {
    open: function(kind){
      if(kind === 'fieldCount'){ Lite.show('fieldcount'); return; }
      if(kind === 'tally'){ Lite.show('tally'); return; }
      if(kind === 'flagged'){ Lite.show('cattle', { filter: 'flag:1' }); return; }
      if(kind === 'sell'){ Lite.show('cattle', { filter: 'sell:1' }); return; }
      var fn = OPENERS[kind]; if(!fn) return;
      Lite.useSaved(NEED.filter(function(n){ return !Lite.liveAt[n]; }));
      fn();
      var stale = NEED.filter(function(n){ return !Lite.liveAt[n] || Date.now() - Lite.liveAt[n] > 60000; });
      if(stale.length) Lite.load(stale).then(function(){ if(document.querySelector('.modal-backdrop') && fn === OPENERS[kind] && !document.querySelector('input,textarea')){ /* list is open and nothing is being typed: redraw it with the fresh data */ closeAllModals(); fn(); } }, function(){});
    },
    printList: function(list){ printListModal(list, 'Print This List', 'print'); }
  };
})();
