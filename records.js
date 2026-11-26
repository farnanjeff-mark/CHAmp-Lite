/* CHAmp-Lite, part 5: adding, editing and deleting records (version 1: meds, weights, notes).
 * The forms and saves are CHAmp's own code, copied over, so they save exactly what CHAmp saves.
 * Breeding, calving, banner changes, photos and Remove Cow come in later versions of this part. */
(function(){
  'use strict';
  var D = Lite.data;
  var HEADERS = Lite.HEADERS, api = Lite.api, queuePendingWrite = Lite.queueWrite, makeLocalId = Lite.makeLocalId;
  var currentCow = null, currentWeightsCow = null, currentNotesCow = null;
  function showToast(m){ Lite.toast(m); }
  function openModal(html){ return Lite.openModal(html); }
  function closeModal(){ Lite.closeModal(); }
  function getPendingWrites(){ return Lite.getPending(); }
  function removePendingWrite(id){ Lite.removePending(id); }
  ['treatments','weights','general_notes','medicines','med_reasons'].forEach(function(n){ if(!D[n]) D[n] = []; });
  function saveOfflineCache(){ ['treatments','weights','general_notes','medicines','med_reasons'].forEach(function(n){ Lite.saveCopy(n); }); redraw(); }
  // Whatever screen is showing redraws itself (the list, the cards, or the profile).
  var redrawTimer = null;
  function redraw(){ if(redrawTimer) return; redrawTimer = setTimeout(function(){ redrawTimer = null; if(Lite.redraw) Lite.redraw(); }, 0); }
  function renderDetail(){ redraw(); } function renderList(){ redraw(); } function renderWeightsDetail(){ redraw(); } function renderWeightsList(){ redraw(); }
  function renderNotesDetail(){ redraw(); } function renderNotesList(){ redraw(); } function renderProfileList(){ redraw(); }
  function escapeHtml(s){ var d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }
  function localDateFromTimestamp(ts){
    if(!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function todayLocal(){ return localDateFromTimestamp(new Date()); }

  // ---- CHAmp's code, copied ----
    function fieldWithOther(id, label, options, placeholder){
      const opts = options.map(o=>`<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
      return `
        <div class="field">
          <label>${label}</label>
          <select id="${id}Select">
            <option value="">-- Select --</option>
            ${opts}
            <option value="__other__">Other (type it in)</option>
          </select>
          <input type="text" id="${id}Other" placeholder="${placeholder}" style="margin-top:8px;display:none;"/>
        </div>
      `;
    }
    function wireFieldWithOther(modal, id){
      const select = modal.querySelector('#'+id+'Select');
      const other = modal.querySelector('#'+id+'Other');
      select.addEventListener('change', ()=>{
        if(select.value === '__other__'){
          other.style.display = 'block';
          other.focus();
        } else {
          other.style.display = 'none';
          other.value = '';
        }
      });
    }
    function prefillFieldWithOther(modal, id, value, options){
      const select = modal.querySelector('#'+id+'Select');
      const other = modal.querySelector('#'+id+'Other');
      if(!value) return;
      if(options.includes(value)){
        select.value = value;
      } else {
        select.value = '__other__';
        other.style.display = 'block';
        other.value = value;
      }
    }
    function valueOf(modal, id){
      const select = modal.querySelector('#'+id+'Select');
      const other = modal.querySelector('#'+id+'Other');
      if(select.value === '__other__') return other.value.trim();
      return select.value;
    }
    function getMedicineOptions(){
      return D.medicines.map(m=>m.name);
    }
    function getReasonOptions(){
      return D.med_reasons.map(r=>r.name);
    }
    async function addMedicineIfNew(name){
      if(!name) return;
      if(D.medicines.some(m=>m.name===name)) return;
      try{
        const inserted = await api('/medicines', {
          method:'POST',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify({ name })
        });
        D.medicines.push(inserted[0]);
        D.medicines.sort((a,b)=>a.name.localeCompare(b.name));
      }catch(e){
        console.error('Could not save new medicine name', e);
      }
    }
    async function addReasonIfNew(name){
      if(!name) return;
      if(D.med_reasons.some(r=>r.name===name)) return;
      try{
        const inserted = await api('/med_reasons', {
          method:'POST',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify({ name })
        });
        D.med_reasons.push(inserted[0]);
        D.med_reasons.sort((a,b)=>a.name.localeCompare(b.name));
      }catch(e){
        console.error('Could not save new reason', e);
      }
    }
    async function snapshotBeforeDelete(tableName, record){
      try{
        await api('/deleted_records', {
          method:'POST',
          headers: HEADERS,
          body: JSON.stringify({ table_name: tableName, record_data: record, cow_number: record.cow_number })
        });
      }catch(e){ console.error('Could not snapshot before delete', e); }
    }
    function recordModal(existingRecord){
      const isEdit = !!existingRecord;
      const today = todayLocal();
      const modal = openModal(`
        <div class="modal-title">${isEdit ? 'Edit Entry' : 'Log Entry'} — #${escapeHtml(currentCow)}</div>
        <div class="row2">
          <div class="field">
            <label>Date</label>
            <input type="date" id="recDate" value="${isEdit ? existingRecord.date : today}"/>
          </div>
        </div>
        ${fieldWithOther('recMed', 'Medicine (optional)', getMedicineOptions(), 'Type medicine name')}
        ${fieldWithOther('recReason', 'Reason (optional)', getReasonOptions(), 'Type reason')}
        <div class="field">
          <label>Notes</label>
          <textarea id="recNotes" rows="2" placeholder="Dosage, observations, or just a general note">${isEdit ? escapeHtml(existingRecord.notes||'') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelAddRec">Cancel</button>
          <button class="btn btn-barn" id="confirmAddRec">${isEdit ? 'Save Changes' : 'Save Entry'}</button>
        </div>
      `);
      wireFieldWithOther(modal, 'recMed');
      wireFieldWithOther(modal, 'recReason');
      if(isEdit){
        prefillFieldWithOther(modal, 'recMed', existingRecord.medicine, getMedicineOptions());
        prefillFieldWithOther(modal, 'recReason', existingRecord.reason, getReasonOptions());
      }
      modal.querySelector('#cancelAddRec').addEventListener('click', closeModal);
      modal.querySelector('#confirmAddRec').addEventListener('click', async ()=>{
        const dateVal = modal.querySelector('#recDate').value;
        const med = valueOf(modal, 'recMed');
        const reason = valueOf(modal, 'recReason');
        const notes = modal.querySelector('#recNotes').value.trim();
        if(!dateVal){ showToast('Date is required'); return; }
        if(!med && !reason && !notes){ showToast('Enter at least a medicine/reason or a note'); return; }
        const btn = modal.querySelector('#confirmAddRec');
        btn.disabled = true;
        await addMedicineIfNew(med);
        await addReasonIfNew(reason);
        const body = { date: dateVal, medicine: med||null, reason: reason||null, notes: notes||null };
        try{
          if(isEdit){
            const updated = await api('/treatments?id=eq.' + encodeURIComponent(existingRecord.id), {
              method:'PATCH',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(body)
            });
            const idx = D.treatments.findIndex(t=>t.id===existingRecord.id);
            if(idx !== -1) D.treatments[idx] = updated[0];
          } else {
            const inserted = await api('/treatments', {
              method:'POST',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(Object.assign({ cow_number: currentCow }, body))
            });
            D.treatments.push(inserted[0]);
          }
          saveOfflineCache();
          closeModal();
          renderDetail();
          renderList();
          renderProfileList();
          window.scrollTo(0,0);
          showToast(isEdit ? 'Entry updated' : 'Entry logged');
        }catch(e){
          if(e && e.isNetworkFailure && !isEdit){
            const tempId = makeLocalId('pending-treatment');
            const tempRecord = Object.assign({ id: tempId, cow_number: currentCow, _pendingSync: true }, body);
            D.treatments.push(tempRecord);
            queuePendingWrite({
              localId: makeLocalId('pw'),
              kind: 'insert', table: 'treatments', tempId,
              method: 'POST', path: '/treatments',
              body: Object.assign({ cow_number: currentCow }, body)
            });
            saveOfflineCache();
            closeModal();
            renderDetail();
            renderList();
            renderProfileList();
            window.scrollTo(0,0);
            showToast('Saved on this phone — will sync when you have signal');
          } else {
            btn.disabled = false;
            showToast('Could not save — try again');
          }
        }
      });
    }
    function editRecordModal(record){ recordModal(record); }
    function weightModal(existingRecord){
      const isEdit = !!existingRecord;
      const today = todayLocal();
      const modal = openModal(`
        <div class="modal-title">${isEdit ? 'Edit Weight' : 'Log Weight'} — #${escapeHtml(currentWeightsCow)}</div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="wgtDate" value="${isEdit ? existingRecord.weigh_date : today}"/>
        </div>
        <div class="field">
          <label>Weight (lbs)</label>
          <input type="number" id="wgtWeight" step="0.1" min="0" placeholder="e.g. 550" value="${isEdit && existingRecord.weight!=null ? existingRecord.weight : ''}"/>
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea id="wgtNotes" rows="2" placeholder="Optional notes">${isEdit ? escapeHtml(existingRecord.notes||'') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelWgt">Cancel</button>
          <button class="btn btn-barn" id="confirmWgt">${isEdit ? 'Save Changes' : 'Save Entry'}</button>
        </div>
      `);
      modal.querySelector('#cancelWgt').addEventListener('click', closeModal);
      modal.querySelector('#confirmWgt').addEventListener('click', async ()=>{
        const dateVal = modal.querySelector('#wgtDate').value;
        const weightRaw = modal.querySelector('#wgtWeight').value;
        const notes = modal.querySelector('#wgtNotes').value.trim();
        if(!dateVal){ showToast('Date is required'); return; }
        if(!weightRaw){ showToast('Enter a weight'); return; }
        const btn = modal.querySelector('#confirmWgt');
        btn.disabled = true;
        const body = { weigh_date: dateVal, weight: parseFloat(weightRaw), notes: notes||null };
        try{
          if(isEdit){
            const updated = await api('/weights?id=eq.' + encodeURIComponent(existingRecord.id), {
              method:'PATCH',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(body)
            });
            const idx = D.weights.findIndex(w=>w.id===existingRecord.id);
            if(idx !== -1) D.weights[idx] = updated[0];
          } else {
            const inserted = await api('/weights', {
              method:'POST',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(Object.assign({ cow_number: currentWeightsCow }, body))
            });
            D.weights.push(inserted[0]);
          }
          saveOfflineCache();
          closeModal();
          renderWeightsDetail();
          renderWeightsList();
          renderProfileList();
          window.scrollTo(0,0);
          showToast(isEdit ? 'Weight updated' : 'Weight logged');
        }catch(e){
          if(e && e.isNetworkFailure && !isEdit){
            const tempId = makeLocalId('pending-weight');
            const tempRecord = Object.assign({ id: tempId, cow_number: currentWeightsCow, _pendingSync: true }, body);
            D.weights.push(tempRecord);
            queuePendingWrite({
              localId: makeLocalId('pw'),
              kind: 'insert', table: 'weights', tempId,
              method: 'POST', path: '/weights',
              body: Object.assign({ cow_number: currentWeightsCow }, body)
            });
            saveOfflineCache();
            closeModal();
            renderWeightsDetail();
            renderWeightsList();
            renderProfileList();
            window.scrollTo(0,0);
            showToast('Saved on this phone — will sync when you have signal');
          } else {
            btn.disabled = false;
            showToast('Could not save — try again');
          }
        }
      });
    }
    function editWeightModal(record){ weightModal(record); }
    function generalNoteModal(existingRecord){
      const isEdit = !!existingRecord;
      const today = todayLocal();
      const modal = openModal(`
        <div class="modal-title">${isEdit ? 'Edit Note' : 'Add Note'} — #${escapeHtml(currentNotesCow)}</div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="genNoteDate" value="${isEdit ? existingRecord.note_date : today}"/>
        </div>
        <div class="field">
          <label>Note</label>
          <textarea id="genNoteText" rows="3" placeholder="General observation or note">${isEdit ? escapeHtml(existingRecord.note||'') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelGenNote">Cancel</button>
          <button class="btn btn-blue" id="confirmGenNote">${isEdit ? 'Save Changes' : 'Save Note'}</button>
        </div>
      `);
      modal.querySelector('#cancelGenNote').addEventListener('click', closeModal);
      modal.querySelector('#confirmGenNote').addEventListener('click', async ()=>{
        const dateVal = modal.querySelector('#genNoteDate').value;
        const noteText = modal.querySelector('#genNoteText').value.trim();
        if(!dateVal){ showToast('Date is required'); return; }
        if(!noteText){ showToast('Enter a note'); return; }
        const btn = modal.querySelector('#confirmGenNote');
        btn.disabled = true;
        const body = { note_date: dateVal, note: noteText };
        try{
          if(isEdit){
            const updated = await api('/general_notes?id=eq.' + encodeURIComponent(existingRecord.id), {
              method:'PATCH',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(body)
            });
            const idx = D.general_notes.findIndex(n=>n.id===existingRecord.id);
            if(idx !== -1) D.general_notes[idx] = updated[0];
          } else {
            const inserted = await api('/general_notes', {
              method:'POST',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(Object.assign({ cow_number: currentNotesCow }, body))
            });
            D.general_notes.push(inserted[0]);
          }
          saveOfflineCache();
          closeModal();
          renderNotesDetail();
          renderNotesList();
          renderProfileList();
          window.scrollTo(0,0);
          showToast(isEdit ? 'Note updated' : 'Note logged');
        }catch(e){
          if(e && e.isNetworkFailure && !isEdit){
            const tempId = makeLocalId('pending-note');
            const tempRecord = Object.assign({ id: tempId, cow_number: currentNotesCow, _pendingSync: true }, body);
            D.general_notes.push(tempRecord);
            queuePendingWrite({
              localId: makeLocalId('pw'),
              kind: 'insert', table: 'general_notes', tempId,
              method: 'POST', path: '/general_notes',
              body: Object.assign({ cow_number: currentNotesCow }, body)
            });
            saveOfflineCache();
            closeModal();
            renderNotesDetail();
            renderNotesList();
            renderProfileList();
            window.scrollTo(0,0);
            showToast('Saved on this phone — will sync when you have signal');
          } else {
            btn.disabled = false;
            showToast('Could not save — try again');
          }
        }
      });
    }
    function editGeneralNoteModal(record){ generalNoteModal(record); }
    async function deleteRecord(id){
      if(String(id).startsWith('pending-treatment-')){
        const pw = getPendingWrites().find(w=>w.tempId===id);
        if(pw) removePendingWrite(pw.localId);
        D.treatments = D.treatments.filter(t=>t.id!==id);
        renderDetail();
        renderList();
        showToast('Removed — it was never synced, so nothing to undo on the database');
        return;
      }
      try{
        const record = D.treatments.find(t=>t.id===id);
        if(record) await snapshotBeforeDelete('treatments', record);
        await api('/treatments?id=eq.' + encodeURIComponent(id), { method:'DELETE' });
        D.treatments = D.treatments.filter(t=>t.id!==id);
        saveOfflineCache();
        renderDetail();
        renderList();
        showToast('Treatment removed');
      }catch(e){
        if(e && e.isNetworkFailure){
          D.treatments = D.treatments.filter(t=>t.id!==id);
          queuePendingWrite({ localId: makeLocalId('pw'), kind:'delete', table:'treatments', recordId:id, method:'DELETE', path:'/treatments?id=eq.'+encodeURIComponent(id), body:null });
          saveOfflineCache();
          renderDetail();
          renderList();
          showToast('Will remove once you have signal');
        } else {
          showToast('Could not remove — try again');
        }
      }
    }
    async function deleteWeight(id){
      if(String(id).startsWith('pending-weight-')){
        const pw = getPendingWrites().find(w=>w.tempId===id);
        if(pw) removePendingWrite(pw.localId);
        D.weights = D.weights.filter(w=>w.id!==id);
        renderWeightsDetail();
        renderWeightsList();
        showToast('Removed — it was never synced, so nothing to undo on the database');
        return;
      }
      try{
        const record = D.weights.find(w=>w.id===id);
        if(record) await snapshotBeforeDelete('weights', record);
        await api('/weights?id=eq.' + encodeURIComponent(id), { method:'DELETE' });
        D.weights = D.weights.filter(w=>w.id!==id);
        saveOfflineCache();
        renderWeightsDetail();
        renderWeightsList();
        showToast('Weight removed');
      }catch(e){
        if(e && e.isNetworkFailure){
          D.weights = D.weights.filter(w=>w.id!==id);
          queuePendingWrite({ localId: makeLocalId('pw'), kind:'delete', table:'weights', recordId:id, method:'DELETE', path:'/weights?id=eq.'+encodeURIComponent(id), body:null });
          saveOfflineCache();
          renderWeightsDetail();
          renderWeightsList();
          showToast('Will remove once you have signal');
        } else {
          showToast('Could not remove — try again');
        }
      }
    }
    async function deleteGeneralNote(id){
      if(String(id).startsWith('pending-note-')){
        const pw = getPendingWrites().find(w=>w.tempId===id);
        if(pw) removePendingWrite(pw.localId);
        D.general_notes = D.general_notes.filter(n=>n.id!==id);
        renderNotesDetail();
        renderNotesList();
        showToast('Removed — it was never synced, so nothing to undo on the database');
        return;
      }
      try{
        const record = D.general_notes.find(n=>n.id===id);
        if(record) await snapshotBeforeDelete('general_notes', record);
        await api('/general_notes?id=eq.' + encodeURIComponent(id), { method:'DELETE' });
        D.general_notes = D.general_notes.filter(n=>n.id!==id);
        saveOfflineCache();
        renderNotesDetail();
        renderNotesList();
        showToast('Note removed');
      }catch(e){
        if(e && e.isNetworkFailure){
          D.general_notes = D.general_notes.filter(n=>n.id!==id);
          queuePendingWrite({ localId: makeLocalId('pw'), kind:'delete', table:'general_notes', recordId:id, method:'DELETE', path:'/general_notes?id=eq.'+encodeURIComponent(id), body:null });
          saveOfflineCache();
          renderNotesDetail();
          renderNotesList();
          showToast('Will remove once you have signal');
        } else {
          showToast('Could not remove — try again');
        }
      }
    }

  var FORM_CSS = ".modal input, .modal select, .modal textarea{font-family:Arial,sans-serif;\n    background:var(--paper-raised);\n    border:2px solid var(--ink);\n    color:var(--ink);\n    padding:10px 12px;\n    font-size:16px;\n    border-radius:10px;\n    width:100%;\n    min-width:0;\n    box-sizing:border-box;}\n.modal input[type=\"checkbox\"], .modal input[type=\"radio\"]{border-radius:3px;}\n.modal input:focus, .modal select:focus, .modal textarea:focus{outline:2px solid var(--pasture);outline-offset:1px;}\n.modal input[type=\"date\"]{padding:10px 6px;}\n.modal .field input[type=\"date\"], .modal .field input[type=\"time\"]{-webkit-appearance:none;appearance:none;display:block;min-width:0;max-width:100%;text-align:left;padding:10px 12px;}\n.modal .field input[type=\"date\"]::-webkit-date-and-time-value, .modal .field input[type=\"time\"]::-webkit-date-and-time-value{text-align:left;margin:0;padding:0;min-height:1.2em;}\n.modal .field input[type=\"date\"], .modal .field input[type=\"time\"], .modal .field input[type=\"text\"], .modal .field input[type=\"number\"], .modal .field input[type=\"password\"], .modal .field input[type=\"tel\"], .modal .field input[type=\"email\"], .modal .field input[type=\"search\"], .modal .field select{min-height:46px;line-height:1.25;box-sizing:border-box;}\n.modal .field{margin-bottom:12px;}\n.modal .field label{display:block;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:5px;}\n.modal .row2{display:flex;gap:10px;}\n.modal .row2 > div{flex:1;min-width:0;}";
  function addFormStyles(){
    if(document.getElementById('lite-records-css')) return;
    var st = document.createElement('style'); st.id = 'lite-records-css'; st.textContent = FORM_CSS; document.head.appendChild(st);
  }
  var _open = Lite.openModal; Lite.openModal = function(html){ addFormStyles(); return _open(html); };

  // ---- what the cow screens call ----
  var KINDS = {
    meds:    { label: 'med / note entry', add: function(num){ currentCow = num; recordModal(null); },        edit: function(r){ currentCow = r.cow_number; editRecordModal(r); },       del: function(id, num){ currentCow = num; return deleteRecord(id); } },
    weights: { label: 'weight entry',     add: function(num){ currentWeightsCow = num; weightModal(null); }, edit: function(r){ currentWeightsCow = r.cow_number; editWeightModal(r); }, del: function(id, num){ currentWeightsCow = num; return deleteWeight(id); } },
    notes:   { label: 'note',             add: function(num){ currentNotesCow = num; generalNoteModal(null); }, edit: function(r){ currentNotesCow = r.cow_number; editGeneralNoteModal(r); }, del: function(id, num){ currentNotesCow = num; return deleteGeneralNote(id); } }
  };
  var LISTS = { meds: 'treatments', weights: 'weights', notes: 'general_notes' };
  Lite.records = Lite.records || {};
  Lite.records.kinds = Lite.records.kinds || {};
  Object.keys(KINDS).forEach(function(k){ Lite.records.kinds[k] = KINDS[k]; KINDS[k].list = LISTS[k]; });
})();
