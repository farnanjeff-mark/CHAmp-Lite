/* CHAmp-Lite, part 5: adding, editing and deleting records (version 3: meds, weights, notes, breeding, calving, calf record).
 * The forms and saves are CHAmp's own code, copied over, so they save exactly what CHAmp saves.
 * Breeding, calving, banner changes, photos and Remove Cow come in later versions of this part. */
(function(){
  'use strict';
  var D = Lite.data;
  var HEADERS = Lite.HEADERS, api = Lite.api, queuePendingWrite = Lite.queueWrite, makeLocalId = Lite.makeLocalId;
  var currentCow = null, currentWeightsCow = null, currentNotesCow = null, currentBreedingCow = null, currentCalvingCow = null;
  function showToast(m){ Lite.toast(m); }
  function openModal(html){ return Lite.openModal(html); }
  function closeModal(){ Lite.closeModal(); }
  function getPendingWrites(){ return Lite.getPending(); }
  function removePendingWrite(id){ Lite.removePending(id); }
  ['treatments','weights','general_notes','medicines','med_reasons','breeding_records','bulls','cows','calvings','calf_treatments','calf_weights'].forEach(function(n){ if(!D[n]) D[n] = []; });
  function saveOfflineCache(){ ['treatments','weights','general_notes','medicines','med_reasons','breeding_records','bulls','calvings','calf_treatments','calf_weights','cows'].forEach(function(n){ Lite.saveCopy(n); }); redraw(); }
  // Whatever screen is showing redraws itself (the list, the cards, or the profile).
  var redrawTimer = null;
  function redraw(){ if(redrawTimer) return; redrawTimer = setTimeout(function(){ redrawTimer = null; if(Lite.redraw) Lite.redraw(); }, 0); }
  function renderDetail(){ redraw(); } function renderList(){ redraw(); } function renderWeightsDetail(){ redraw(); } function renderWeightsList(){ redraw(); }
  function renderNotesDetail(){ redraw(); } function renderNotesList(){ redraw(); } function renderProfileList(){ redraw(); } function renderBreedingDetail(){ redraw(); } function renderBreedingList(){ redraw(); }
  function renderCalvingDetail(){ redraw(); } function renderCalvingList(){ redraw(); }
  function updateCalvedBadge(){} function updateOpenBadge(){} function updatePregBtBadge(){} function updateSellBadge(){} function updateSyncHoldBadge(){}
  // Sale details (the Sold pop-up) is step 7; until then the Sold choice is left out so no sale is saved half-filled in.
  function soldDetailsPopup(){ showToast('Sale details open in a later step'); }
  function escapeHtml(s){ var d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }
  function localDateFromTimestamp(ts){
    if(!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function fmtDate(iso){ var d = new Date(iso+'T00:00:00'); return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  function toggleInHeat(num, checked){ return Lite.toggleInHeat(num, checked); }
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
    function breedingModal(existingRecord){
      const isEdit = !!existingRecord;
      const today = todayLocal();
      const initialDate = isEdit ? existingRecord.breed_date : today;
      const initialVetCalls = isEdit ? (existingRecord.vet_calls||'') : '';
      const initialVetDate = isEdit ? (existingRecord.vet_call_date||'') : '';
      const initialResolved = resolveExpectedDueDate(initialDate, initialVetCalls, isEdit ? existingRecord.pregnancy_method : '', initialVetDate);
      const initialIsOpen = isEdit && existingRecord.pregnancy_status === 'Open';
      const modal = openModal(`
        <div class="modal-title">${isEdit ? 'Edit Breeding' : 'Log Breeding'} — #${escapeHtml(currentBreedingCow)}</div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="brdDate" value="${initialDate}"/>
        </div>
        ${breedPickerHtml('brdBredTo', 'Bred To')}
        <div class="field">
          <label>Pregnancy Method</label>
          <select id="brdMethod">
            <option value="">-- Select --</option>
            ${PREGNANCY_METHOD_OPTIONS.map(o=>`<option value="${o}" ${isEdit && existingRecord.pregnancy_method===o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Natural Sire</label>
          <input type="text" id="brdSire" placeholder="Natural sire name or ID (if applicable)" value="${isEdit ? escapeHtml(existingRecord.natural_sire||'') : ''}"/>
        </div>
        <div class="field" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="brdIsOpen" ${initialIsOpen ? 'checked' : ''} style="width:20px;height:20px;"/>
          <label style="margin:0;" for="brdIsOpen">Cow is Open (not pregnant)</label>
        </div>
        <div id="brdNotOpenFields">
          <div class="field">
            <label>Vet Calls</label>
            <textarea id="brdVet" rows="2" placeholder="e.g. 60 (days along, per vet)">${escapeHtml(initialVetCalls)}</textarea>
          </div>
          <div class="field">
            <label>Vet Call Date</label>
            <input type="date" id="brdVetDate" value="${initialVetDate}"/>
            <div style="font-family:Arial,sans-serif;font-size:12px;color:#6b6350;margin-top:4px;">The day the vet checked her. Leave blank to use today.</div>
          </div>
          <div class="field">
            <label>Expected Due Date</label>
            <input type="text" id="brdDueDisplay" value="${fmtDate(initialResolved.dueDate)}" disabled style="background:#e5ded0;"/>
            <div id="brdDueNote" style="font-family:Arial,sans-serif;font-size:12px;color:#6b6350;margin-top:4px;">${initialResolved.usedVetCheck ? `Adjusted from vet call — ${Math.abs(initialResolved.diffDays)} days off from the breed-date estimate.` : ''}</div>
          </div>
        </div>
        <div class="field" id="brdOpenDateField">
          <label>Date Found Open</label>
          <input type="date" id="brdOpenDate" value="${isEdit && existingRecord.open_date ? existingRecord.open_date : today}"/>
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea id="brdNotes" rows="2" placeholder="Any other notes about this breeding">${isEdit ? escapeHtml(existingRecord.notes||'') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelBrd">Cancel</button>
          <button class="btn btn-barn" id="confirmBrd">${isEdit ? 'Save Changes' : 'Save Entry'}</button>
        </div>
      `);
      function refreshDueDateDisplay(){
        const dateVal = modal.querySelector('#brdDate').value;
        const vetText = modal.querySelector('#brdVet').value;
        const methodVal = modal.querySelector('#brdMethod').value;
        if(!dateVal){ modal.querySelector('#brdDueDisplay').value = ''; modal.querySelector('#brdDueNote').textContent = ''; return; }
        const resolved = resolveExpectedDueDate(dateVal, vetText, methodVal, modal.querySelector('#brdVetDate').value);
        modal.querySelector('#brdDueDisplay').value = fmtDate(resolved.dueDate);
        modal.querySelector('#brdDueNote').textContent = resolved.usedVetCheck ? `Adjusted from vet call — ${Math.abs(resolved.diffDays)} days off from the breed-date estimate.` : '';
      }
      function refreshOpenToggle(){
        const isOpen = modal.querySelector('#brdIsOpen').checked;
        modal.querySelector('#brdNotOpenFields').classList.toggle('hidden', isOpen);
        modal.querySelector('#brdOpenDateField').classList.toggle('hidden', !isOpen);
      }
      modal.querySelector('#brdDate').addEventListener('input', refreshDueDateDisplay);
      modal.querySelector('#brdVet').addEventListener('input', refreshDueDateDisplay);
      modal.querySelector('#brdVetDate').addEventListener('input', refreshDueDateDisplay);
      modal.querySelector('#brdMethod').addEventListener('change', refreshDueDateDisplay);
      modal.querySelector('#brdIsOpen').addEventListener('change', refreshOpenToggle);
      refreshOpenToggle();
      const brdPicker = wireBreedPicker(modal, 'brdBredTo', isEdit ? (existingRecord.bred_to||'') : '');
      modal.querySelector('#cancelBrd').addEventListener('click', closeModal);
      modal.querySelector('#confirmBrd').addEventListener('click', async ()=>{
        const dateVal = modal.querySelector('#brdDate').value;
        const bredTo = brdPicker.getValue();
        const method = modal.querySelector('#brdMethod').value;
        const sire = modal.querySelector('#brdSire').value.trim();
        const isOpen = modal.querySelector('#brdIsOpen').checked;
        const vet = modal.querySelector('#brdVet').value.trim();
        const vetDate = modal.querySelector('#brdVetDate').value;
        const openDate = modal.querySelector('#brdOpenDate').value;
        const notes = modal.querySelector('#brdNotes').value.trim();
        if(!dateVal){ showToast('Date is required'); return; }
        if(isOpen && !openDate){ showToast('Date found open is required'); return; }
        if(!isOpen && vetDate && vetDate < dateVal){ showToast('Vet call date can\'t be before the breeding date'); return; }
        const btn = modal.querySelector('#confirmBrd');
        btn.disabled = true;
        await addBullIfNew(bredTo, brdPicker.getCategory());
        let body;
        if(isOpen){
          body = {
            breed_date: dateVal,
            bred_to: bredTo||null,
            pregnancy_method: method||null,
            natural_sire: sire||null,
            notes: notes||null,
            pregnancy_status: 'Open',
            vet_calls: null,
            expected_due_date: null,
            open_date: openDate
          };
        } else {
          const resolved = resolveExpectedDueDate(dateVal, vet, method, vetDate);
          body = {
            breed_date: dateVal,
            bred_to: bredTo||null,
            pregnancy_method: methodAfterVetCheck(method, dateVal, vet, vetDate)||null,
            natural_sire: sire||null,
            vet_calls: vet||null,
            vet_call_date: vetDate || (vet ? todayLocal() : null),
            notes: notes||null,
            expected_due_date: resolved.dueDate,
            pregnancy_status: vet ? 'Bred' : null,
            open_date: null
          };
        }
        try{
          if(isEdit){
            const updated = await api('/breeding_records?id=eq.' + encodeURIComponent(existingRecord.id), {
              method:'PATCH',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(body)
            });
            const idx = D.breeding_records.findIndex(b=>b.id===existingRecord.id);
            if(idx !== -1) D.breeding_records[idx] = updated[0];
          } else {
            const inserted = await api('/breeding_records', {
              method:'POST',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(Object.assign({ cow_number: currentBreedingCow }, body))
            });
            D.breeding_records.push(inserted[0]);
            await clearHeatAfterBreeding(currentBreedingCow);
          }
          saveOfflineCache();
          closeModal();
          renderBreedingDetail();
          renderBreedingList();
          renderProfileList();
          window.scrollTo(0,0);
          showToast(isEdit ? 'Breeding updated' : 'Breeding logged');
        }catch(e){
          if(e && e.isNetworkFailure && !isEdit){
            const tempId = makeLocalId('pending-breeding');
            const tempRecord = Object.assign({ id: tempId, cow_number: currentBreedingCow, _pendingSync: true }, body);
            D.breeding_records.push(tempRecord);
            queuePendingWrite({
              localId: makeLocalId('pw'),
              kind: 'insert', table: 'breeding_records', tempId,
              method: 'POST', path: '/breeding_records',
              body: Object.assign({ cow_number: currentBreedingCow }, body)
            });
            saveOfflineCache();
            await clearHeatAfterBreeding(currentBreedingCow);
            closeModal();
            renderBreedingDetail();
            renderBreedingList();
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
    function editBreedingModal(record){ breedingModal(record); }
    async function deleteBreedingRecord(id){
      if(String(id).startsWith('pending-breeding-')){
        const pw = getPendingWrites().find(w=>w.tempId===id);
        if(pw) removePendingWrite(pw.localId);
        D.breeding_records = D.breeding_records.filter(b=>b.id!==id);
        renderBreedingDetail();
        renderBreedingList();
        showToast('Removed — it was never synced, so nothing to undo on the database');
        return;
      }
      try{
        const record = D.breeding_records.find(b=>b.id===id);
        if(record) await snapshotBeforeDelete('breeding_records', record);
        await api('/breeding_records?id=eq.' + encodeURIComponent(id), { method:'DELETE' });
        D.breeding_records = D.breeding_records.filter(b=>b.id!==id);
        saveOfflineCache();
        renderBreedingDetail();
        renderBreedingList();
        showToast('Breeding record removed');
      }catch(e){
        if(e && e.isNetworkFailure){
          D.breeding_records = D.breeding_records.filter(b=>b.id!==id);
          queuePendingWrite({ localId: makeLocalId('pw'), kind:'delete', table:'breeding_records', recordId:id, method:'DELETE', path:'/breeding_records?id=eq.'+encodeURIComponent(id), body:null });
          saveOfflineCache();
          renderBreedingDetail();
          renderBreedingList();
          showToast('Will remove once you have signal');
        } else {
          showToast('Could not remove — try again');
        }
      }
    }
    async function addBullIfNew(name, category){
      if(!name) return;
      if(D.bulls.some(b=>b.name===name)) return;
      try{
        const inserted = await api('/bulls', {
          method:'POST',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify({ name, category: BULL_CATEGORIES.includes(category) ? category : 'Sires' })
        });
        D.bulls.push(inserted[0]);
        D.bulls.sort((a,b)=>a.name.localeCompare(b.name));
      }catch(e){
        console.error('Could not save new bull name', e);
      }
    }
    function breedPickerHtml(id, label){
      return `
        <div class="field">
          <label>${label}</label>
          <div id="${id}Chosen" style="font-family:Arial,sans-serif;font-size:15px;color:#6b6350;margin-bottom:8px;"></div>
          <div id="${id}Groups"></div>
        </div>
      `;
    }
    async function clearHeatAfterBreeding(num){
      const c = D.cows.find(x=>x.number===num);
      if(c && c.in_heat) await toggleInHeat(num, false);
    }
    function methodAfterVetCheck(method, breedDate, vetCallsText, vetCallDate){
      return vetMismatch(breedDate, vetCallsText, vetCallDate || todayLocal(), method) ? 'BB' : method;
    }
    function resolveExpectedDueDate(breedDate, vetCallsText, method, vetCallDate){
      const breedBased = computeDueDate(breedDate, method);
      const daysAlong = parseDaysAlongFromVetCalls(vetCallsText);
      if(daysAlong == null){
        return { dueDate: breedBased, usedVetCheck: false, diffDays: 0 };
      }
      // The vet call describes how far along she was on the vet call date.
      // If no date was given, it is assumed to be today, the day this note is entered/updated.
      const vetBased = computeVetAdjustedDueDate(vetCallDate || todayLocal(), daysAlong);
      const diffDays = Math.round((new Date(vetBased+'T00:00:00') - new Date(breedBased+'T00:00:00')) / 86400000);
      if(Math.abs(diffDays) > 10){
        return { dueDate: vetBased, usedVetCheck: true, diffDays };
      }
      return { dueDate: breedBased, usedVetCheck: false, diffDays };
    }
    function wireBreedPicker(modal, id, initialValue){
      const chosenEl = modal.querySelector('#'+id+'Chosen');
      const groupsEl = modal.querySelector('#'+id+'Groups');
      const state = { value: initialValue || '', category: '', openCat: null, typing: false };
      const startBull = initialValue ? D.bulls.find(b=>b.name===initialValue) : null;
      if(startBull) state.category = bullCategoryOf(startBull);
      function paintChosen(){
        if(state.value){
          chosenEl.innerHTML = `<span style="color:#2B2620;font-weight:700;">${escapeHtml(state.value)}</span>` +
            (state.category ? ` <span style="color:#6b6350;">(${escapeHtml(state.category)})</span>` : '') +
            ` <button type="button" class="pickerClear" style="background:none;border:none;color:#0C5A8E;font-size:13px;text-decoration:underline;cursor:pointer;padding:4px 8px;">Clear</button>`;
          chosenEl.querySelector('.pickerClear').addEventListener('click', ()=>{
            state.value = ''; state.category = ''; state.typing = false; paintChosen(); paintGroups();
          });
        } else {
          chosenEl.textContent = 'Tap a blue box, then pick a name';
        }
      }
      function paintGroups(){
        groupsEl.innerHTML = BULL_CATEGORIES.map(cat=>{
          const isOpen = state.openCat === cat;
          let list = '';
          if(isOpen){
            const names = D.bulls.filter(b=>bullCategoryOf(b)===cat).map(b=>b.name).sort((a,b)=>a.localeCompare(b));
            const rows = names.map(n=>`<div class="pickerRow" data-name="${escapeHtml(n)}" style="padding:12px 14px;font-family:Arial,sans-serif;font-size:15px;border-bottom:1px solid #e3dccb;cursor:pointer;${state.value===n ? 'background:#E6F1FB;font-weight:700;' : ''}">${escapeHtml(n)}</div>`).join('');
            const empty = names.length ? '' : `<div style="padding:12px 14px;font-family:Arial,sans-serif;font-size:14px;color:#6b6350;border-bottom:1px solid #e3dccb;">No names yet. Add them in Utilities, or type one below.</div>`;
            const other = `<div class="pickerOther" style="padding:12px 14px;font-family:Arial,sans-serif;font-size:15px;color:#0C5A8E;cursor:pointer;">Other (type it in)</div>`;
            const typeBox = state.typing ? `<div style="padding:0 14px 12px;"><input type="text" class="pickerTyped" placeholder="Type name or ID" value="${escapeHtml(state.value && !names.includes(state.value) ? state.value : '')}"/></div>` : '';
            list = `<div style="background:#fff;border:1.5px solid #2E88C4;border-radius:10px;margin:0 0 10px;overflow:hidden;">${rows}${empty}${other}${typeBox}</div>`;
          }
          return `<button type="button" class="btn btn-nav-tool btn-full pickerBox" data-cat="${cat}" style="margin-bottom:8px;justify-content:space-between;"><span>${cat}</span><span aria-hidden="true">${isOpen ? '&#9650;' : '&#9660;'}</span></button>${list}`;
        }).join('');
        groupsEl.querySelectorAll('.pickerBox').forEach(btn=>{
          btn.addEventListener('click', ()=>{
            state.openCat = (state.openCat === btn.dataset.cat) ? null : btn.dataset.cat;
            state.typing = false;
            paintGroups();
          });
        });
        groupsEl.querySelectorAll('.pickerRow').forEach(row=>{
          row.addEventListener('click', ()=>{
            state.value = row.dataset.name; state.category = state.openCat; state.openCat = null; state.typing = false;
            paintChosen(); paintGroups();
          });
        });
        const other = groupsEl.querySelector('.pickerOther');
        if(other) other.addEventListener('click', ()=>{
          state.typing = true; paintGroups();
          const t = groupsEl.querySelector('.pickerTyped'); if(t) t.focus();
        });
        const typed = groupsEl.querySelector('.pickerTyped');
        if(typed) typed.addEventListener('input', ()=>{
          state.value = typed.value.trim(); state.category = state.openCat || '';
          paintChosen();
        });
      }
      paintChosen();
      paintGroups();
      return { getValue: ()=> (state.value||'').trim(), getCategory: ()=> state.category || state.openCat || 'Sires' };
    }
    function computeDueDate(breedDateStr, method){
      const d = new Date(breedDateStr+'T00:00:00');
      // Normal gestation is 283 days. ET (embryo transfer) D.cows are dated from the transfer day, when the embryo is already ~7 days old, so they use 276.
      d.setDate(d.getDate() + (method === 'ET' ? 276 : 283));
      return d.toISOString().slice(0,10);
    }
    function computeVetAdjustedDueDate(vetCheckDateStr, daysAlong){
      const d = new Date(vetCheckDateStr+'T00:00:00');
      d.setDate(d.getDate() + (283 - Number(daysAlong)));
      return d.toISOString().slice(0,10);
    }
    const PREGNANCY_METHOD_OPTIONS = ['ET','AI','BB'];
    function parseDaysAlongFromVetCalls(text){
      if(!text) return null;
      const match = text.match(/\d+/);
      return match ? parseInt(match[0], 10) : null;
    }
    function vetMismatch(breedDate, vetCallsText, vetCallDate, method){
      if(method === 'AI' || method === 'ET') return false;
      const days = parseDaysAlongFromVetCalls(vetCallsText);
      if(days == null || !vetCallDate || !breedDate) return false;
      const conceived = new Date(vetCallDate+'T00:00:00');
      conceived.setDate(conceived.getDate() - days);
      const diff = Math.round((conceived - new Date(breedDate+'T00:00:00')) / 86400000);
      return Math.abs(diff) > 10;
    }
    const BULL_CATEGORIES = ['Sires','Embryos','Herd bulls'];
    function bullCategoryOf(b){ return BULL_CATEGORIES.includes(b.category) ? b.category : 'Sires'; }
    function calvingModal(existingRecord, onSaved){
      const isEdit = !!existingRecord;
      const today = todayLocal();
      const modal = openModal(`
        <div class="modal-title">${isEdit ? 'Edit Calving' : 'Log Calving'} — #${escapeHtml(currentCalvingCow)}</div>
        <div class="field">
          <label>Calving Date</label>
          <input type="date" id="calvDate" value="${isEdit ? existingRecord.calving_date : today}"/>
        </div>
        <div class="field">
          <label>Calf Sex</label>
          <select id="calvSex">
            <option value="">-- Select --</option>
            <option value="B" ${isEdit && existingRecord.calf_sex==='B' ? 'selected' : ''}>Bull (B)</option>
            <option value="H" ${isEdit && existingRecord.calf_sex==='H' ? 'selected' : ''}>Heifer (H)</option>
          </select>
        </div>
        <div class="field">
          <label>Birth Weight (lbs)</label>
          <input type="number" id="calvWeight" step="0.1" min="0" placeholder="e.g. 75" value="${isEdit && existingRecord.birth_weight!=null ? existingRecord.birth_weight : ''}"/>
        </div>
        ${fieldWithOther('calvSire', 'Sire', getBullOptionsWithExtras(), 'Type bull name or ID')}
        <div class="field">
          <label>Birth Assist</label>
          <select id="calvAssist">
            ${BIRTH_ASSIST_OPTIONS.map(o=>`<option value="${o}" ${isEdit && existingRecord.birth_assist===o ? 'selected' : (!isEdit && o==='None' ? 'selected' : '')}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="background:#E6F1FB;border-radius:8px;padding:10px 12px;">
          <label style="display:flex;align-items:center;gap:10px;margin:0;cursor:pointer;text-transform:none;letter-spacing:0;font-size:15px;font-weight:700;color:#0C447C;">
            <input type="checkbox" id="calvGrafted" style="width:22px;height:22px;" ${isEdit && existingRecord.grafted ? 'checked' : ''}/>
            <span>Grafted calf (born to another cow)</span>
          </label>
          <div id="calvBirthMotherWrap" class="${isEdit && existingRecord.grafted ? '' : 'hidden'}" style="margin-top:10px;">
            <label>Birth mother # (the cow that had this calf)</label>
            <input type="text" id="calvBirthMother" placeholder="e.g. 512" value="${isEdit ? escapeHtml(existingRecord.birth_mother||'') : ''}"/>
          </div>
          <label style="display:flex;align-items:center;gap:10px;margin:10px 0 0;cursor:pointer;text-transform:none;letter-spacing:0;font-size:15px;font-weight:700;color:#0C447C;">
            <input type="checkbox" id="calvTwin" style="width:22px;height:22px;" ${isEdit && existingRecord.twin ? 'checked' : ''}/>
            <span>Twins</span>
          </label>
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea id="calvNotes" rows="2" placeholder="Calving notes, any complications, etc.">${isEdit ? escapeHtml(existingRecord.notes||'') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelCalv">Cancel</button>
          <button class="btn btn-barn" id="confirmCalv">${isEdit ? 'Save Changes' : 'Save Entry'}</button>
        </div>
      `);
      wireFieldWithOther(modal, 'calvSire');
      if(isEdit && existingRecord.sire) prefillFieldWithOther(modal, 'calvSire', existingRecord.sire, getBullOptionsWithExtras());
      modal.querySelector('#calvGrafted').addEventListener('change', (e)=>{
        modal.querySelector('#calvBirthMotherWrap').classList.toggle('hidden', !e.target.checked);
        if(e.target.checked) setTimeout(()=>{ try{ modal.querySelector('#calvBirthMother').focus(); }catch(x){} }, 30);
      });
      modal.querySelector('#cancelCalv').addEventListener('click', closeModal);
      modal.querySelector('#confirmCalv').addEventListener('click', async ()=>{
        const dateVal = modal.querySelector('#calvDate').value;
        const sex = modal.querySelector('#calvSex').value;
        const weightRaw = modal.querySelector('#calvWeight').value;
        const sire = valueOf(modal, 'calvSire');
        const assist = modal.querySelector('#calvAssist').value;
        const notes = modal.querySelector('#calvNotes').value.trim();
        const grafted = modal.querySelector('#calvGrafted').checked;
        const twin = modal.querySelector('#calvTwin').checked;
        const birthMother = modal.querySelector('#calvBirthMother').value.trim();
        if(!dateVal){ showToast('Calving date is required'); return; }
        if(grafted && !birthMother){ showToast('Enter the birth mother # (or untick Grafted)'); return; }
        const btn = modal.querySelector('#confirmCalv');
        btn.disabled = true;
        await addBullIfNew(sire);
        const body = {
          calving_date: dateVal, calf_sex: sex||null, notes: notes||null,
          birth_weight: weightRaw ? parseFloat(weightRaw) : null,
          sire: sire||null,
          birth_assist: assist||null,
          grafted: grafted,
          twin: twin,
          birth_mother: grafted ? birthMother : null
        };
        try{
          let savedRecord;
          if(isEdit){
            const updated = await api('/calvings?id=eq.' + encodeURIComponent(existingRecord.id), {
              method:'PATCH',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(body)
            });
            const idx = D.calvings.findIndex(c=>c.id===existingRecord.id);
            if(idx !== -1) D.calvings[idx] = updated[0];
            savedRecord = updated[0];
          } else {
            const inserted = await api('/calvings', {
              method:'POST',
              headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify(Object.assign({ cow_number: currentCalvingCow }, body))
            });
            D.calvings.push(inserted[0]);
            savedRecord = inserted[0];
            const cowIdx = D.cows.findIndex(c=>c.number===currentCalvingCow);
            if(cowIdx !== -1) D.cows[cowIdx] = Object.assign({}, D.cows[cowIdx], { calved:false });
          }
          saveOfflineCache();
          closeModal();
          if(onSaved){
            onSaved(savedRecord);
          } else {
            renderCalvingDetail();
            renderCalvingList();
            renderProfileList();
            if(!isEdit){ renderList(); updateCalvedBadge();
          updateOpenBadge();
          updatePregBtBadge();
          updateSellBadge();
          updateSyncHoldBadge(); }
            window.scrollTo(0,0);
          }
          showToast(isEdit ? 'Calving updated' : 'Calving logged');
        }catch(e){
          if(e && e.isNetworkFailure && !isEdit){
            const tempId = makeLocalId('pending-calving');
            const tempRecord = Object.assign({ id: tempId, cow_number: currentCalvingCow, _pendingSync: true }, body);
            D.calvings.push(tempRecord);
            const cowIdx = D.cows.findIndex(c=>c.number===currentCalvingCow);
            if(cowIdx !== -1) D.cows[cowIdx] = Object.assign({}, D.cows[cowIdx], { calved:false });
            queuePendingWrite({
              localId: makeLocalId('pw'),
              kind: 'insert', table: 'calvings', tempId,
              method: 'POST', path: '/calvings',
              body: Object.assign({ cow_number: currentCalvingCow }, body)
            });
            saveOfflineCache();
            closeModal();
            renderCalvingDetail();
            renderCalvingList();
            renderProfileList();
            renderList();
            updateCalvedBadge();
          updateOpenBadge();
          updatePregBtBadge();
          updateSellBadge();
          updateSyncHoldBadge();
            window.scrollTo(0,0);
            showToast('Calving saved on this phone — will sync when you have signal');
          } else {
            btn.disabled = false;
            showToast('Could not save — try again');
          }
        }
      });
    }
    async function deleteCalvingRecord(id){
      if(String(id).startsWith('pending-calving-')){
        const pw = getPendingWrites().find(w=>w.tempId===id);
        if(pw) removePendingWrite(pw.localId);
        D.calvings = D.calvings.filter(c=>c.id!==id);
        renderCalvingDetail();
        renderCalvingList();
        showToast('Removed — it was never synced, so nothing to undo on the database');
        return;
      }
      try{
        const record = D.calvings.find(c=>c.id===id);
        if(record) await snapshotBeforeDelete('calvings', record);
        await api('/calvings?id=eq.' + encodeURIComponent(id), { method:'DELETE' });
        D.calvings = D.calvings.filter(c=>c.id!==id);
        saveOfflineCache();
        renderCalvingDetail();
        renderCalvingList();
        showToast('Calving record removed');
      }catch(e){
        if(e && e.isNetworkFailure){
          D.calvings = D.calvings.filter(c=>c.id!==id);
          queuePendingWrite({ localId: makeLocalId('pw'), kind:'delete', table:'calvings', recordId:id, method:'DELETE', path:'/calvings?id=eq.'+encodeURIComponent(id), body:null });
          saveOfflineCache();
          renderCalvingDetail();
          renderCalvingList();
          showToast('Will remove once you have signal');
        } else {
          showToast('Could not remove — try again');
        }
      }
    }
    function calfRecordSectionsHtml(calvingRecord){
      const meds = D.calf_treatments.filter(t=>t.calving_id===calvingRecord.id).sort((a,b)=>b.date.localeCompare(a.date));
      const weightsList = D.calf_weights.filter(w=>w.calving_id===calvingRecord.id).sort((a,b)=>b.weigh_date.localeCompare(a.weigh_date));
      const medsHtml = meds.map(t=>{
        const desc = t.medicine ? `${t.medicine}${t.reason ? ' / '+t.reason : ''}` : '(note only)';
        return `
          <div class="record" style="padding:8px 30px 8px 10px;">
            <button class="record-del calf-med-del" data-id="${t.id}" style="top:6px;right:6px;">&times;</button>
            ${t._pendingSync ? `<div style="display:inline-flex;align-items:center;gap:4px;background:#FCEBEB;border:1px solid #E24B4A;color:#791F1F;font-family:Arial,sans-serif;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;margin-bottom:6px;">Not synced yet</div>` : ''}
            <div class="record-date" style="font-size:13px;">${fmtDate(t.date)}</div>
            <div class="record-med" style="font-size:13px;">${escapeHtml(desc)}</div>
            ${t.notes ? `<div class="record-notes" style="font-size:12px;">${escapeHtml(t.notes)}</div>` : ''}
          </div>
        `;
      }).join('') || '<p class="empty" style="padding:6px 0;font-size:13px;">No meds/notes logged yet.</p>';
      const weightsHtml = weightsList.map(w=>`
        <div class="record" style="padding:8px 30px 8px 10px;">
          <button class="record-del calf-weight-del" data-id="${w.id}" style="top:6px;right:6px;">&times;</button>
          ${w._pendingSync ? `<div style="display:inline-flex;align-items:center;gap:4px;background:#FCEBEB;border:1px solid #E24B4A;color:#791F1F;font-family:Arial,sans-serif;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;margin-bottom:6px;">Not synced yet</div>` : ''}
          <div class="record-date" style="font-size:13px;">${fmtDate(w.weigh_date)} — ${w.weight!=null?w.weight+' lbs':''}</div>
          ${w.notes ? `<div class="record-notes" style="font-size:12px;">${escapeHtml(w.notes)}</div>` : ''}
        </div>
      `).join('') || '<p class="empty" style="padding:6px 0;font-size:13px;">No D.weights logged yet.</p>';
      return { medsHtml, weightsHtml };
    }
    function refreshCalfRecordModal(modal, calvingRecord){
      if(!modal) return;   // edits made from the cow profile have no Calf Record pop-up behind them
      const { medsHtml, weightsHtml } = calfRecordSectionsHtml(calvingRecord);
      const medsEl = modal.querySelector('#calfMedsList');
      const weightsEl = modal.querySelector('#calfWeightsList');
      medsEl.innerHTML = medsHtml;
      weightsEl.innerHTML = weightsHtml;
      medsEl.querySelectorAll('.calf-med-del').forEach(btn=>{
        btn.addEventListener('click', ()=> deleteCalfTreatment(btn.dataset.id, modal, calvingRecord));
      });
      weightsEl.querySelectorAll('.calf-weight-del').forEach(btn=>{
        btn.addEventListener('click', ()=> deleteCalfWeight(btn.dataset.id, modal, calvingRecord));
      });
    }
    function calfRecordModal(calvingRecord){
      const cow = D.cows.find(c=>c.number===calvingRecord.cow_number) || {};
      const { medsHtml, weightsHtml } = calfRecordSectionsHtml(calvingRecord);
      const summaryParts = [calfSexLabel(calvingRecord.calf_sex)+' calf'];
      if(calvingRecord.birth_weight != null) summaryParts.push(`${calvingRecord.birth_weight} lbs at birth`);
      if(calvingRecord.sire) summaryParts.push(`Sire: ${calvingRecord.sire}`);
  
      const modal = openModal(`
        <div class="modal-title">Calf Record</div>
        <div style="font-family:Arial,sans-serif;font-size:13px;color:#6b6350;margin-bottom:10px;">Born ${fmtDate(calvingRecord.calving_date)} to #${escapeHtml(calvingRecord.cow_number)} · ${escapeHtml(summaryParts.join(' · '))}</div>
        <button class="btn btn-outline btn-full" id="calfEditCalvingBtn" style="margin-bottom:14px;">✏️ Edit Calving Details</button>
  
        <div class="section-label" style="margin-top:0;">Weaning</div>
        <div id="calfWeanInfo" style="font-family:Arial,sans-serif;font-size:13px;color:#3C9142;font-weight:700;margin-bottom:8px;"></div>
        <div class="row2">
          <div class="field">
            <label>Weaning date</label>
            <input type="date" id="calfWeanDate" value="${calvingRecord.weaning_date || ''}"/>
          </div>
          <div class="field">
            <label>Weight (lbs)</label>
            <input type="number" id="calfWeanWeight" step="0.1" min="0" placeholder="e.g. 585" value="${calvingRecord.weaning_weight != null ? calvingRecord.weaning_weight : ''}"/>
          </div>
        </div>
        <button class="btn btn-nav-tool btn-full" id="calfWeanSaveBtn" style="margin-bottom:14px;">Save Weaning</button>
  
        <div class="section-label">Meds &amp; Notes</div>
        <button class="btn btn-nav-tool btn-full" id="calfAddMedBtn" style="margin-bottom:10px;">+ Log Med / Note</button>
        <div id="calfMedsList">${medsHtml}</div>
  
        <div class="section-label">Weights</div>
        <button class="btn btn-nav-tool btn-full" id="calfAddWeightBtn" style="margin-bottom:10px;">+ Log Weight</button>
        <div id="calfWeightsList">${weightsHtml}</div>
  
        <div class="section-label">Manage</div>
        ${calvingRecord.promoted_to_cow_number
          ? `<div style="padding:12px 14px;background:var(--paper-raised);border:2px solid var(--ink);border-radius:10px;font-weight:700;color:#3C9142;">✓ ${calvingRecord.calf_outcome === 'bull' ? 'Kept as bull' : 'Promoted to'} #${escapeHtml(calvingRecord.promoted_to_cow_number)}</div>`
          : `<label style="display:flex;align-items:center;gap:10px;background:#E6F1FB;border:2px solid #0274BA;border-radius:10px;padding:10px 12px;margin-bottom:10px;cursor:pointer;">
               <input type="checkbox" id="calfToSellCheck" ${calvingRecord.to_sell ? 'checked' : ''} style="width:20px;height:20px;accent-color:#6F2E24;"/>
               <span style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#0C447C;">Mark to sell</span>
             </label>
             <label style="display:flex;align-items:center;gap:10px;background:#E6F1FB;border:2px solid #0274BA;border-radius:10px;padding:10px 12px;margin-bottom:10px;cursor:pointer;">
               <input type="checkbox" id="calfHeldOverCheck" ${calvingRecord.held_over ? 'checked' : ''} style="width:20px;height:20px;accent-color:#6F2E24;"/>
               <span style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#0C447C;">Held over</span>
             </label>
             <div class="field">
               <label>Outcome</label>
               <select id="calfOutcomeSelect">
                 <option value="" ${!calvingRecord.calf_outcome ? 'selected' : ''}>Still Active</option>
                 <option value="__promote__">Keeping (Promote to Cow)</option>
                 <option value="__promote_bull__">Keeping as Bull (Promote)</option>
                          <option value="died" ${calvingRecord.calf_outcome==='died' ? 'selected' : ''}>Died</option>
               </select>
             </div>
             ${calvingRecord.calf_outcome === 'sold' ? `
             <div style="padding:12px 14px;background:#E6F1FB;border:2px solid #0274BA;border-radius:10px;margin-bottom:10px;font-family:Arial,sans-serif;font-size:14px;color:#0C447C;">${soldLabel(calvingRecord)}${calvingRecord.sold_notes ? `<div style="margin-top:4px;font-size:13px;">${escapeHtml(calvingRecord.sold_notes)}</div>` : ''}</div>
             <button class="btn btn-outline btn-full" id="calfEditSoldBtn" style="margin-bottom:10px;">✏️ Edit Sale Details</button>` : ''}
             ${calvingRecord.calf_outcome === 'died' ? `
             <div style="padding:12px 14px;background:#E6F1FB;border:2px solid #0274BA;border-radius:10px;margin-bottom:10px;font-family:Arial,sans-serif;font-size:14px;color:#0C447C;">
               <div><strong>Died:</strong> ${calvingRecord.died_date ? fmtDate(calvingRecord.died_date) : 'date not recorded'}</div>
               <div style="margin-top:4px;"><strong>Reason:</strong> ${calvingRecord.died_reason ? escapeHtml(calvingRecord.died_reason) : 'not recorded'}</div>
             </div>
             <button class="btn btn-outline btn-full" id="calfEditDiedBtn">✏️ Edit Date / Reason</button>` : ''}`}
  
        <div class="modal-actions">
          <button class="btn btn-barn btn-full" id="closeCalfRecordBtn">Close</button>
        </div>
      `);
      modal.querySelector('#calfEditCalvingBtn').addEventListener('click', ()=>{
        currentCalvingCow = calvingRecord.cow_number;
        calvingModal(calvingRecord, (updatedRecord)=>{
          closeModal();
          calfRecordModal(updatedRecord);
        });
      });
      wireCalfWeaning(modal, calvingRecord);
      modal.querySelector('#calfAddMedBtn').addEventListener('click', ()=> calfMedEntryModal(calvingRecord, null, modal));
      modal.querySelector('#calfAddWeightBtn').addEventListener('click', ()=> calfWeightEntryModal(calvingRecord, null, modal));
      const toSellCheck = modal.querySelector('#calfToSellCheck');
      const heldOverCheck = modal.querySelector('#calfHeldOverCheck');
      if(toSellCheck){
        toSellCheck.addEventListener('change', async ()=>{
          if(toSellCheck.checked && heldOverCheck) heldOverCheck.checked = false;
          await setCalfToSell(calvingRecord, toSellCheck.checked);
        });
      }
      if(heldOverCheck){
        heldOverCheck.addEventListener('change', async ()=>{
          if(heldOverCheck.checked && toSellCheck) toSellCheck.checked = false;
          await setCalfHeldOver(calvingRecord, heldOverCheck.checked);
        });
      }
      const outcomeSelect = modal.querySelector('#calfOutcomeSelect');
      if(outcomeSelect){
        outcomeSelect.addEventListener('change', async ()=>{
          const val = outcomeSelect.value;
          if(val === '__promote__'){
            outcomeSelect.value = calvingRecord.calf_outcome || '';
            promoteCalfModal(calvingRecord, modal);
            return;
          }
          if(val === '__promote_bull__'){
            outcomeSelect.value = calvingRecord.calf_outcome || '';
            promoteCalfModal(calvingRecord, modal, 'bull');
            return;
          }
          if(val === 'died'){
            outcomeSelect.value = calvingRecord.calf_outcome || '';
            calfDiedModal(calvingRecord);
            return;
          }
          await setCalfOutcome(calvingRecord, val || null);
          closeModal();
          calfRecordModal(calvingRecord);
          if(val === 'sold' && calvingRecord.calf_outcome === 'sold') soldDetailsPopup('calf', calvingRecord.id, calvingRecord);
        });
      }
      const editSoldBtn = modal.querySelector('#calfEditSoldBtn');
      if(editSoldBtn) editSoldBtn.addEventListener('click', ()=> soldDetailsPopup('calf', calvingRecord.id, calvingRecord));
      const editDiedBtn = modal.querySelector('#calfEditDiedBtn');
      if(editDiedBtn){
        editDiedBtn.addEventListener('click', ()=> calfDiedModal(calvingRecord));
      }
      refreshCalfRecordModal(modal, calvingRecord);
      modal.querySelector('#closeCalfRecordBtn').addEventListener('click', closeModal);
    }
    async function setCalfToSell(calvingRecord, on){
      return setCalfFlags(calvingRecord, on ? { to_sell:true, held_over:false } : { to_sell:false }, on ? 'Marked to sell' : 'Sell mark removed');
    }
    async function setCalfHeldOver(calvingRecord, on){
      return setCalfFlags(calvingRecord, on ? { held_over:true, to_sell:false } : { held_over:false }, on ? 'Marked held over' : 'Held over mark removed');
    }
    async function setCalfFlags(calvingRecord, body, toastText){
      try{
        const updated = await api('/calvings?id=eq.' + encodeURIComponent(calvingRecord.id), {
          method:'PATCH',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify(body)
        });
        const idx = D.calvings.findIndex(c=>c.id===calvingRecord.id);
        if(idx !== -1){
          D.calvings[idx] = updated[0];
          Object.assign(calvingRecord, updated[0]);
        }
        saveOfflineCache();
        showToast(toastText);
      }catch(e){
        if(e && e.isNetworkFailure){
          const idx = D.calvings.findIndex(c=>c.id===calvingRecord.id);
          if(idx !== -1){
            D.calvings[idx] = Object.assign({}, D.calvings[idx], body, { _pendingSync:true });
            Object.assign(calvingRecord, D.calvings[idx]);
          }
          queuePendingWrite({
            localId: makeLocalId('pw'),
            kind: 'update', table: 'calvings', recordId: calvingRecord.id,
            method: 'PATCH', path: '/calvings?id=eq.' + encodeURIComponent(calvingRecord.id),
            body
          });
          saveOfflineCache();
          showToast('Saved on this phone — will sync when you have signal');
        } else {
          showToast('Could not save — try again');
        }
      }
    }
    function calfDiedModal(calvingRecord){
      const modal = openModal(`
        <div class="modal-title">Calf Died</div>
        <div style="font-family:Arial,sans-serif;font-size:13px;color:#6b6350;margin-bottom:10px;">Calf born ${fmtDate(calvingRecord.calving_date)} to #${escapeHtml(calvingRecord.cow_number)}</div>
        <div class="field">
          <label>Date died</label>
          <input type="date" id="calfDiedDate" value="${calvingRecord.died_date || todayLocal()}"/>
        </div>
        <div class="field">
          <label>Reason</label>
          <textarea id="calfDiedReason" rows="3" placeholder="e.g. scours, stillborn, hit by cold snap">${escapeHtml(calvingRecord.died_reason || '')}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelCalfDied">Cancel</button>
          <button class="btn btn-barn" id="confirmCalfDied">Save</button>
        </div>
      `);
      modal.querySelector('#cancelCalfDied').addEventListener('click', closeModal);
      modal.querySelector('#confirmCalfDied').addEventListener('click', async ()=>{
        const dateVal = modal.querySelector('#calfDiedDate').value;
        if(!dateVal){ showToast('Date is required'); return; }
        const reasonVal = modal.querySelector('#calfDiedReason').value.trim();
        const btn = modal.querySelector('#confirmCalfDied');
        btn.disabled = true;
        await setCalfOutcome(calvingRecord, 'died', { died_date: dateVal, died_reason: reasonVal || null });
        closeModal();   // closes this popup
        closeModal();   // closes the old calf record screen
        calfRecordModal(calvingRecord);   // reopens it showing the new info
      });
    }
    async function setCalfOutcome(calvingRecord, outcome, extra){
      // Date and reason are only kept while the outcome is "died"; any other outcome clears them.
      const diedFields = outcome === 'died' ? (extra || {}) : { died_date: null, died_reason: null };
      const body = Object.assign(outcome ? { calf_outcome: outcome, to_sell: false, held_over: false } : { calf_outcome: outcome }, diedFields);
      try{
        const updated = await api('/calvings?id=eq.' + encodeURIComponent(calvingRecord.id), {
          method:'PATCH',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify(body)
        });
        const idx = D.calvings.findIndex(c=>c.id===calvingRecord.id);
        if(idx !== -1){
          D.calvings[idx] = updated[0];
          Object.assign(calvingRecord, updated[0]);
        }
        saveOfflineCache();
        renderProfileList();
        showToast(outcome ? `Marked as ${outcome}` : 'Marked as still active');
      }catch(e){
        if(e && e.isNetworkFailure){
          const idx = D.calvings.findIndex(c=>c.id===calvingRecord.id);
          if(idx !== -1){
            D.calvings[idx] = Object.assign({}, D.calvings[idx], body, { _pendingSync:true });
            Object.assign(calvingRecord, D.calvings[idx]);
          }
          queuePendingWrite({
            localId: makeLocalId('pw'),
            kind: 'update', table: 'calvings', recordId: calvingRecord.id,
            method: 'PATCH', path: '/calvings?id=eq.' + encodeURIComponent(calvingRecord.id),
            body
          });
          saveOfflineCache();
          renderProfileList();
          showToast('Saved on this phone — will sync when you have signal');
        } else {
          showToast('Could not save — try again');
        }
      }
    }
    function calfMedEntryModal(calvingRecord, existingEntry, parentModal){
      const isEdit = !!existingEntry;
      const today = todayLocal();
      const modal = openModal(`
        <div class="modal-title">${isEdit ? 'Edit' : 'Log'} Calf Med / Note</div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="calfMedDate" value="${isEdit ? existingEntry.date : today}"/>
        </div>
        ${fieldWithOther('calfMedMedicine', 'Medicine (optional)', getMedicineOptions(), 'Type medicine')}
        ${fieldWithOther('calfMedReason', 'Reason (optional)', getReasonOptions(), 'Type reason')}
        <div class="field">
          <label>Notes</label>
          <textarea id="calfMedNotes" rows="2">${isEdit ? escapeHtml(existingEntry.notes||'') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelCalfMed">Cancel</button>
          <button class="btn btn-barn" id="confirmCalfMed">Save</button>
        </div>
      `);
      wireFieldWithOther(modal, 'calfMedMedicine');
      wireFieldWithOther(modal, 'calfMedReason');
      if(isEdit && existingEntry.medicine) prefillFieldWithOther(modal, 'calfMedMedicine', existingEntry.medicine, getMedicineOptions());
      if(isEdit && existingEntry.reason) prefillFieldWithOther(modal, 'calfMedReason', existingEntry.reason, getReasonOptions());
      modal.querySelector('#cancelCalfMed').addEventListener('click', closeModal);
      modal.querySelector('#confirmCalfMed').addEventListener('click', async ()=>{
        const dateVal = modal.querySelector('#calfMedDate').value;
        if(!dateVal){ showToast('Date is required'); return; }
        const btn = modal.querySelector('#confirmCalfMed');
        btn.disabled = true;
        await addMedicineIfNew(valueOf(modal, 'calfMedMedicine'));
        await addReasonIfNew(valueOf(modal, 'calfMedReason'));
        const body = {
          calving_id: calvingRecord.id,
          date: dateVal,
          medicine: valueOf(modal, 'calfMedMedicine')||null,
          reason: valueOf(modal, 'calfMedReason')||null,
          notes: modal.querySelector('#calfMedNotes').value.trim()||null
        };
        try{
          if(isEdit){
            const updated = await api('/calf_treatments?id=eq.' + encodeURIComponent(existingEntry.id), {
              method:'PATCH', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}), body: JSON.stringify(body)
            });
            const idx = D.calf_treatments.findIndex(t=>t.id===existingEntry.id);
            if(idx !== -1) D.calf_treatments[idx] = updated[0];
          } else {
            const inserted = await api('/calf_treatments', {
              method:'POST', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}), body: JSON.stringify(body)
            });
            D.calf_treatments.push(inserted[0]);
          }
          saveOfflineCache();
          closeModal();
          refreshCalfRecordModal(parentModal, calvingRecord);
          showToast('Saved');
        }catch(e){
          if(e && e.isNetworkFailure && !isEdit){
            const tempId = makeLocalId('pending-calftreatment');
            D.calf_treatments.push(Object.assign({ id: tempId, _pendingSync: true }, body));
            queuePendingWrite({
              localId: makeLocalId('pw'),
              kind: 'insert', table: 'calf_treatments', tempId,
              method: 'POST', path: '/calf_treatments',
              body
            });
            saveOfflineCache();
            closeModal();
            refreshCalfRecordModal(parentModal, calvingRecord);
            showToast('Saved on this phone — will sync when you have signal');
          } else {
            btn.disabled = false;
            showToast('Could not save — try again');
          }
        }
      });
    }
    function calfWeightEntryModal(calvingRecord, existingEntry, parentModal){
      const isEdit = !!existingEntry;
      const today = todayLocal();
      const modal = openModal(`
        <div class="modal-title">${isEdit ? 'Edit' : 'Log'} Calf Weight</div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="calfWeightDate" value="${isEdit ? existingEntry.weigh_date : today}"/>
        </div>
        <div class="field">
          <label>Weight (lbs)</label>
          <input type="number" id="calfWeightValue" value="${isEdit && existingEntry.weight!=null ? existingEntry.weight : ''}"/>
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea id="calfWeightNotes" rows="2">${isEdit ? escapeHtml(existingEntry.notes||'') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelCalfWeight">Cancel</button>
          <button class="btn btn-barn" id="confirmCalfWeight">Save</button>
        </div>
      `);
      modal.querySelector('#cancelCalfWeight').addEventListener('click', closeModal);
      modal.querySelector('#confirmCalfWeight').addEventListener('click', async ()=>{
        const dateVal = modal.querySelector('#calfWeightDate').value;
        if(!dateVal){ showToast('Date is required'); return; }
        const weightRaw = modal.querySelector('#calfWeightValue').value;
        const btn = modal.querySelector('#confirmCalfWeight');
        btn.disabled = true;
        const body = {
          calving_id: calvingRecord.id,
          weigh_date: dateVal,
          weight: weightRaw ? parseFloat(weightRaw) : null,
          notes: modal.querySelector('#calfWeightNotes').value.trim()||null
        };
        try{
          if(isEdit){
            const updated = await api('/calf_weights?id=eq.' + encodeURIComponent(existingEntry.id), {
              method:'PATCH', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}), body: JSON.stringify(body)
            });
            const idx = D.calf_weights.findIndex(w=>w.id===existingEntry.id);
            if(idx !== -1) D.calf_weights[idx] = updated[0];
          } else {
            const inserted = await api('/calf_weights', {
              method:'POST', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}), body: JSON.stringify(body)
            });
            D.calf_weights.push(inserted[0]);
          }
          saveOfflineCache();
          closeModal();
          refreshCalfRecordModal(parentModal, calvingRecord);
          showToast('Saved');
        }catch(e){
          if(e && e.isNetworkFailure && !isEdit){
            const tempId = makeLocalId('pending-calfweight');
            D.calf_weights.push(Object.assign({ id: tempId, _pendingSync: true }, body));
            queuePendingWrite({
              localId: makeLocalId('pw'),
              kind: 'insert', table: 'calf_weights', tempId,
              method: 'POST', path: '/calf_weights',
              body
            });
            saveOfflineCache();
            closeModal();
            refreshCalfRecordModal(parentModal, calvingRecord);
            showToast('Saved on this phone — will sync when you have signal');
          } else {
            btn.disabled = false;
            showToast('Could not save — try again');
          }
        }
      });
    }
    async function deleteCalfTreatment(id, modal, calvingRecord){
      if(!confirm('Remove this entry?')) return;
      if(String(id).startsWith('pending-calftreatment-')){
        const pw = getPendingWrites().find(w=>w.tempId===id);
        if(pw) removePendingWrite(pw.localId);
        D.calf_treatments = D.calf_treatments.filter(t=>t.id!==id);
        refreshCalfRecordModal(modal, calvingRecord);
        showToast('Removed — it was never synced, so nothing to undo on the database');
        return;
      }
      try{
        await api('/calf_treatments?id=eq.' + encodeURIComponent(id), { method:'DELETE' });
        D.calf_treatments = D.calf_treatments.filter(t=>t.id!==id);
        refreshCalfRecordModal(modal, calvingRecord);
      }catch(e){ showToast('Could not remove — try again'); }
    }
    async function deleteCalfWeight(id, modal, calvingRecord){
      if(!confirm('Remove this entry?')) return;
      if(String(id).startsWith('pending-calfweight-')){
        const pw = getPendingWrites().find(w=>w.tempId===id);
        if(pw) removePendingWrite(pw.localId);
        D.calf_weights = D.calf_weights.filter(w=>w.id!==id);
        refreshCalfRecordModal(modal, calvingRecord);
        showToast('Removed — it was never synced, so nothing to undo on the database');
        return;
      }
      try{
        await api('/calf_weights?id=eq.' + encodeURIComponent(id), { method:'DELETE' });
        D.calf_weights = D.calf_weights.filter(w=>w.id!==id);
        refreshCalfRecordModal(modal, calvingRecord);
      }catch(e){ showToast('Could not remove — try again'); }
    }
    function promoteCalfModal(calvingRecord, parentModal, kind){
      const isBull = kind === 'bull';
      const mother = D.cows.find(c=>c.number===calvingRecord.cow_number) || {};
      const modal = openModal(`
        <div class="modal-title">${isBull ? 'Make This Calf a Bull' : 'Make This Calf a Cow'}</div>
        <div style="font-family:Arial,sans-serif;font-size:13px;color:#6b6350;margin-bottom:14px;">Creates a new record for this ${isBull ? 'bull' : 'calf'}, carrying over ${isBull ? 'his' : 'her'} meds and D.weights logged so far. This can't be undone.</div>
        <div class="field">
          <label>New Tag Number</label>
          <input type="text" id="promoteTagNumber" placeholder="e.g. 214" autofocus/>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="cancelPromote">Cancel</button>
          <button class="btn btn-barn" id="confirmPromote">${isBull ? 'Create Bull' : 'Create Cow'}</button>
        </div>
      `);
      modal.querySelector('#cancelPromote').addEventListener('click', closeModal);
      modal.querySelector('#confirmPromote').addEventListener('click', async ()=>{
        const newNum = modal.querySelector('#promoteTagNumber').value.trim();
        if(!newNum){ showToast('Enter a tag number'); return; }
        if(D.cows.some(c=>c.number.toLowerCase()===newNum.toLowerCase())){ showToast('That tag number is already in use'); return; }
        const btn = modal.querySelector('#confirmPromote');
        btn.disabled = true;
        const lineageParts = [`Born ${fmtDate(calvingRecord.calving_date)} to #${calvingRecord.cow_number}`];
        if(calvingRecord.sire) lineageParts.push(`Sire: ${calvingRecord.sire}`);
        if(calvingRecord.birth_weight != null) lineageParts.push(`Birth weight: ${calvingRecord.birth_weight} lbs`);
        if(isBull) lineageParts.unshift('Kept as a bull');
        const lineageNote = lineageParts.join(' · ');
        const cowBody = { number: newNum, lot: mother.lot||null, owner: mother.owner||null, added_at: todayLocal() };
        try{
          const insertedCow = await api('/cows', {
            method:'POST', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
            body: JSON.stringify(cowBody)
          });
          D.cows.push(insertedCow[0]);
  
          await api('/general_notes', {
            method:'POST', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
            body: JSON.stringify({ cow_number: newNum, note_date: calvingRecord.calving_date, note: lineageNote })
          }).then(inserted=> D.general_notes.push(inserted[0]));
  
          const medsToMove = D.calf_treatments.filter(t=>t.calving_id===calvingRecord.id);
          for(const t of medsToMove){
            const inserted = await api('/treatments', {
              method:'POST', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify({ cow_number: newNum, date: t.date, medicine: t.medicine, reason: t.reason, notes: t.notes })
            });
            D.treatments.push(inserted[0]);
            await api('/calf_treatments?id=eq.' + encodeURIComponent(t.id), { method:'DELETE' });
          }
          D.calf_treatments = D.calf_treatments.filter(t=>t.calving_id!==calvingRecord.id);
  
          const weightsToMove = D.calf_weights.filter(w=>w.calving_id===calvingRecord.id);
          for(const w of weightsToMove){
            const inserted = await api('/weights', {
              method:'POST', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify({ cow_number: newNum, weigh_date: w.weigh_date, weight: w.weight, notes: w.notes })
            });
            D.weights.push(inserted[0]);
            await api('/calf_weights?id=eq.' + encodeURIComponent(w.id), { method:'DELETE' });
          }
          D.calf_weights = D.calf_weights.filter(w=>w.calving_id!==calvingRecord.id);
  
          if(calvingRecord.weaning_weight != null && calvingRecord.weaning_weight !== ''){
            const wInserted = await api('/weights', {
              method:'POST', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
              body: JSON.stringify({ cow_number: newNum, weigh_date: calvingRecord.weaning_date || todayLocal(), weight: Number(calvingRecord.weaning_weight), notes: 'Weaning weight' })
            });
            D.weights.push(wInserted[0]);
          }
  
          const updatedCalving = await api('/calvings?id=eq.' + encodeURIComponent(calvingRecord.id), {
            method:'PATCH', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
            body: JSON.stringify(isBull ? { promoted_to_cow_number: newNum, calf_outcome: 'bull', to_sell: false, held_over: false } : { promoted_to_cow_number: newNum, to_sell: false, held_over: false })
          });
          const cIdx = D.calvings.findIndex(c=>c.id===calvingRecord.id);
          if(cIdx !== -1) D.calvings[cIdx] = updatedCalving[0];
  
          saveOfflineCache();
          closeModal();
          closeModal();
          renderCalvingDetail();
          renderCalvingList();
          renderProfileList();
          showToast(`#${newNum} created`);
        }catch(e){
          if(e && e.isNetworkFailure){
            // Everything below is built once, locally -- newNum is already fixed by what you typed,
            // so unlike most offline inserts, nothing here has to wait on a server-generated ID.
            const newCow = Object.assign({ _pendingSync: true }, cowBody);
            D.cows.push(newCow);
            queuePendingWrite({ localId: makeLocalId('pw'), kind:'insert', table:'cows', cowNumber:newNum, method:'POST', path:'/cows', body: cowBody });
  
            const noteBody = { cow_number: newNum, note_date: calvingRecord.calving_date, note: lineageNote };
            const noteTempId = makeLocalId('pending-note');
            D.general_notes.push(Object.assign({ id: noteTempId, _pendingSync:true }, noteBody));
            queuePendingWrite({ localId: makeLocalId('pw'), kind:'insert', table:'general_notes', tempId: noteTempId, method:'POST', path:'/general_notes', body: noteBody });
  
            const medsToMove = D.calf_treatments.filter(t=>t.calving_id===calvingRecord.id);
            medsToMove.forEach(t=>{
              const body = { cow_number: newNum, date: t.date, medicine: t.medicine, reason: t.reason, notes: t.notes };
              const tempId = makeLocalId('pending-treatment');
              D.treatments.push(Object.assign({ id: tempId, _pendingSync:true }, body));
              queuePendingWrite({ localId: makeLocalId('pw'), kind:'insert', table:'treatments', tempId, method:'POST', path:'/treatments', body });
              if(!String(t.id).startsWith('pending-')){
                queuePendingWrite({ localId: makeLocalId('pw'), kind:'delete', table:'calf_treatments', recordId: t.id, method:'DELETE', path:'/calf_treatments?id=eq.'+encodeURIComponent(t.id), body:null });
              }
            });
            D.calf_treatments = D.calf_treatments.filter(t=>t.calving_id!==calvingRecord.id);
  
            const weightsToMove = D.calf_weights.filter(w=>w.calving_id===calvingRecord.id);
            weightsToMove.forEach(w=>{
              const body = { cow_number: newNum, weigh_date: w.weigh_date, weight: w.weight, notes: w.notes };
              const tempId = makeLocalId('pending-weight');
              D.weights.push(Object.assign({ id: tempId, _pendingSync:true }, body));
              queuePendingWrite({ localId: makeLocalId('pw'), kind:'insert', table:'weights', tempId, method:'POST', path:'/weights', body });
              if(!String(w.id).startsWith('pending-')){
                queuePendingWrite({ localId: makeLocalId('pw'), kind:'delete', table:'calf_weights', recordId: w.id, method:'DELETE', path:'/calf_weights?id=eq.'+encodeURIComponent(w.id), body:null });
              }
            });
            D.calf_weights = D.calf_weights.filter(w=>w.calving_id!==calvingRecord.id);
  
            if(calvingRecord.weaning_weight != null && calvingRecord.weaning_weight !== ''){
              const wBody = { cow_number: newNum, weigh_date: calvingRecord.weaning_date || todayLocal(), weight: Number(calvingRecord.weaning_weight), notes: 'Weaning weight' };
              const wTempId = makeLocalId('pending-weight');
              D.weights.push(Object.assign({ id: wTempId, _pendingSync:true }, wBody));
              queuePendingWrite({ localId: makeLocalId('pw'), kind:'insert', table:'weights', tempId: wTempId, method:'POST', path:'/weights', body: wBody });
            }
  
            const calvingBody = isBull ? { promoted_to_cow_number: newNum, calf_outcome: 'bull', to_sell: false, held_over: false } : { promoted_to_cow_number: newNum, to_sell: false, held_over: false };
            const cIdx = D.calvings.findIndex(c=>c.id===calvingRecord.id);
            if(cIdx !== -1) D.calvings[cIdx] = Object.assign({}, D.calvings[cIdx], calvingBody, { _pendingSync:true });
            queuePendingWrite({ localId: makeLocalId('pw'), kind:'update', table:'calvings', recordId: calvingRecord.id, method:'PATCH', path:'/calvings?id=eq.'+encodeURIComponent(calvingRecord.id), body: calvingBody });
  
            saveOfflineCache();
            closeModal();
            closeModal();
            renderCalvingDetail();
            renderCalvingList();
            renderProfileList();
            showToast(`#${newNum} saved on this phone — will sync when you have signal`);
          } else {
            btn.disabled = false;
            showToast('Could not complete — try again');
          }
        }
      });
    }
    function wireCalfWeaning(modal, calvingRecord){
      const infoEl = modal.querySelector('#calfWeanInfo');
      const dateEl = modal.querySelector('#calfWeanDate');
      const wtEl = modal.querySelector('#calfWeanWeight');
      const btn = modal.querySelector('#calfWeanSaveBtn');
      if(!infoEl || !btn) return;
      const showInfo = ()=>{ infoEl.textContent = weaningLineText(calvingRecord) || 'Not weaned yet'; infoEl.style.color = weaningStats(calvingRecord) ? '#3C9142' : '#6b6350'; };
      showInfo();
      btn.addEventListener('click', async ()=>{
        const dateStr = dateEl.value;
        const wtStr = wtEl.value.trim();
        // both boxes empty = clear the weaning info
        if(!dateStr && wtStr === ''){
          if(weaningStats(calvingRecord) == null && !calvingRecord.weaning_date){ showToast('Nothing to save'); return; }
          if(!confirm('Clear the weaning date and weight for this calf?')) return;
          btn.disabled = true;
          const r0 = await saveWeaning(calvingRecord, null, null);
          btn.disabled = false;
          showToast(r0.ok ? (r0.pending ? 'Cleared on this phone, will sync when you have signal' : 'Weaning cleared') : 'Could not save, try again');
          showInfo();
          return;
        }
        const weight = parseFloat(wtStr);
        const problem = weaningProblem(calvingRecord, dateStr, weight);
        if(problem){ showToast(problem); return; }
        const warn = weaningWarning(calvingRecord, dateStr, weight);
        if(warn && !confirm(warn)) return;
        btn.disabled = true;
        const r = await saveWeaning(calvingRecord, dateStr, weight);
        btn.disabled = false;
        if(r.ok){
          showToast(r.pending ? 'Saved on this phone, will sync when you have signal' : 'Weaning saved');
          showInfo();
        }else{
          showToast('Could not save, try again');
        }
      });
    }
    async function saveWeaning(calving, dateStr, weight){
      const body = { weaning_date: dateStr || null, weaning_weight: (weight == null || weight === '') ? null : Number(weight) };
      try{
        const updated = await api('/calvings?id=eq.' + encodeURIComponent(calving.id), {
          method: 'PATCH', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}), body: JSON.stringify(body)
        });
        const idx = D.calvings.findIndex(c=> c.id === calving.id);
        if(idx !== -1){ D.calvings[idx] = updated[0]; Object.assign(calving, updated[0]); }
        saveOfflineCache();
        return { ok: true, pending: false };
      }catch(e){
        if(e && e.isNetworkFailure){
          const idx = D.calvings.findIndex(c=> c.id === calving.id);
          if(idx !== -1){
            D.calvings[idx] = Object.assign({}, D.calvings[idx], body, { _pendingSync: true });
            Object.assign(calving, D.calvings[idx]);
          }
          queuePendingWrite({
            localId: makeLocalId('pw'),
            kind: 'update', table: 'calvings', recordId: calving.id,
            method: 'PATCH', path: '/calvings?id=eq.' + encodeURIComponent(calving.id),
            body
          });
          saveOfflineCache();
          return { ok: true, pending: true };
        }
        return { ok: false };
      }
    }
    function weaningLineText(c){
      const s = weaningStats(c);
      if(!s) return '';
      const parts = ['Weaned' + (s.date ? ' ' + fmtDateShort(s.date) : ''), s.weight + ' lbs'];
      if(s.age != null) parts.push(s.age + ' days old');
      if(s.gain != null) parts.push(s.gain.toFixed(1) + ' lbs/day');
      return parts.join(' · ');
    }
    function weaningProblem(calving, dateStr, weight){
      if(!(weight > 0)) return 'Enter the weaning weight';
      if(!dateStr) return 'Enter the weaning date';
      const age = daysBetween(calving.calving_date, dateStr);
      if(age < 30) return age < 0 ? 'That date is before this calf was born' : 'That is only ' + age + ' days after birth. Check the date';
      return null;
    }
    function weaningStats(c){
      if(!c || c.weaning_weight == null || c.weaning_weight === '') return null;
      const weight = Number(c.weaning_weight);
      const age = c.weaning_date ? daysBetween(c.calving_date, c.weaning_date) : null;
      const bw = (c.birth_weight != null && Number(c.birth_weight) > 0) ? Number(c.birth_weight) : null;
      const gain = (bw != null && age != null && age > 0) ? (weight - bw) / age : null;
      return { weight, date: c.weaning_date || null, age, gain };
    }
    function weaningWarning(calving, dateStr, weight){
      const age = daysBetween(calving.calving_date, dateStr);
      const bw = (calving.birth_weight != null && Number(calving.birth_weight) > 0) ? Number(calving.birth_weight) : null;
      const gain = (bw != null && age > 0) ? (weight - bw) / age : null;
      if(gain != null && (gain < 0.5 || gain > 5)) return `That works out to ${gain.toFixed(1)} lbs per day (${bw} lbs at birth, ${weight} lbs at ${age} days). Save it anyway?`;
      if(weight < 150 || weight > 1200) return `${weight} lbs is outside the usual weaning range. Save it anyway?`;
      return null;
    }
    function getBullOptionsWithExtras(){
      return D.bulls.map(b=>b.name);
    }
    function calfSexLabel(sex){
      return sex === 'B' ? 'Bull' : sex === 'H' ? 'Heifer' : 'Unknown';
    }
    function soldLabel(r){
      let t = 'Sold';
      if(r.sold_date) t += ' ' + fmtDateShort(r.sold_date);
      if(r.sold_to) t += ' to ' + r.sold_to;
      if(r.sold_price !== null && r.sold_price !== undefined && r.sold_price !== '') t += ', ' + fmtMoneySold(r.sold_price);
      return escapeHtml(t);
    }
    function fmtMoneySold(v){
      const n = Number(v);
      if(!isFinite(n)) return '';
      return '$' + n.toLocaleString('en-US', { minimumFractionDigits: (n % 1 ? 2 : 0), maximumFractionDigits: 2 });
    }
    function daysBetween(a, b){
      return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
    }
    function fmtDateShort(iso){
      const d = new Date(iso+'T00:00:00');
      return d.toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'2-digit'});
    }
    const BIRTH_ASSIST_OPTIONS = ['None','Easy Pull','Hard Pull','C-Section'];

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
    breeding:{ label: 'breeding record', add: function(num){ currentBreedingCow = num; breedingModal(null); }, edit: function(r){ currentBreedingCow = r.cow_number; editBreedingModal(r); }, del: function(id, num){ currentBreedingCow = num; return deleteBreedingRecord(id); } },
    calving: { label: 'calving record', add: function(num){ currentCalvingCow = num; calvingModal(null); }, edit: function(r){ currentCalvingCow = r.cow_number; calvingModal(r); }, del: function(id, num){ currentCalvingCow = num; return deleteCalvingRecord(id); } },
    notes:   { label: 'note',             add: function(num){ currentNotesCow = num; generalNoteModal(null); }, edit: function(r){ currentNotesCow = r.cow_number; editGeneralNoteModal(r); }, del: function(id, num){ currentNotesCow = num; return deleteGeneralNote(id); } }
  };
  var LISTS = { calving: 'calvings', breeding: 'breeding_records', meds: 'treatments', weights: 'weights', notes: 'general_notes' };
  Lite.records = Lite.records || {};
  Lite.records.openCalf = function(id){ var rec = D.calvings.filter(function(c){ return String(c.id) === String(id); })[0]; if(rec) calfRecordModal(rec); };
  Lite.records.kinds = Lite.records.kinds || {};
  Object.keys(KINDS).forEach(function(k){ Lite.records.kinds[k] = KINDS[k]; KINDS[k].list = LISTS[k]; });
})();
