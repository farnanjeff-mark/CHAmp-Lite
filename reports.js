/* CHAmp-Lite, part 6: the report lists behind the home tiles (Calved, Due Soon, Calved Since, Flagged, Open, Sell, In Heat) and Print.
 * The lists are CHAmp's own code, copied over. Tap a cow and you go to her profile; Back brings the list back.
 * No Export, no Text, no Show Cards pop-ups: Lite only prints. */
(function(){
  'use strict';
  var D = Lite.data;
  var HEADERS = Lite.HEADERS;
  ['cows','breeding_records','calvings','treatments','general_notes','weights','heat_log','home_stats_settings'].forEach(function(n){ if(!D[n]) D[n] = []; });
  function showToast(m){ Lite.toast(m); }
  function openModal(html){ return Lite.openModal(html); }
  function closeModal(){ Lite.closeModal(); }
  function escapeHtml(s){ return Lite.escapeHtml(s); }
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
      printReportData(title, data);
    });
  }

  // ---- CHAmp's code, copied ----
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
  var NEED = ['cows','breeding_records','calvings','treatments','general_notes','weights','heat_log','home_stats_settings'];
  var OPENERS = { calved: calvedReportModal, dueSoon: dueSoonModal, calvedSince: calvedSinceModal, open: openCowsReportModal, inHeat: heatReportModal };
  Lite.reports = {
    open: function(kind){
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
