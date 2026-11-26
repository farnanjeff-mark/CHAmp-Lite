/* CHAmp-Lite, part 4: the cattle list, the cow cards, the cow profile, and the EPD page.
 * Most of this file is CHAmp's own code for those screens, copied over (cut features taken out), so the
 * cards and profile look and work the way they do in CHAmp. The glue at the bottom connects them to Lite.
 * Adding or editing records (the + buttons, pencil, X) comes in the next step; the four check boxes
 * (Calved, Flag, Open, In heat, Sell) already save, the same way CHAmp saves them. */
(function(){
  'use strict';

  // ---- Lite connections (stand in for CHAmp's own globals) ----
  var cows = [], treatments = [], calvings = [], generalNotes = [], weights = [], breedingRecords = [], cowPhotos = [],
      calfTreatments = [], calfWeights = [], locationsList = [], ownersList = [], groupsList = [], saleSheets = [], heatLog = [];
  var currentProfileCow = null, profileReturnLabel = '← All Cattle', pendingProfileFilterOverride = null, lastFilteredProfileCows = [];
  var profileSearchBox = { value: '' };
  var HEADERS = Lite.HEADERS, api = Lite.api, queuePendingWrite = Lite.queueWrite, makeLocalId = Lite.makeLocalId;
  function showToast(msg){ Lite.toast(msg); }
  function syncData(){
    var d = Lite.data;
    cows = d.cows || []; treatments = d.treatments || []; calvings = d.calvings || []; generalNotes = d.general_notes || [];
    weights = d.weights || []; breedingRecords = d.breeding_records || []; cowPhotos = d.cow_photos || [];
    calfTreatments = d.calf_treatments || []; calfWeights = d.calf_weights || [];
    locationsList = d.locations || []; ownersList = d.owners || []; groupsList = d.cow_groups || [];
  }
  function saveOfflineCache(){ Lite.saveCopy('cows'); Lite.saveCopy('breeding_records'); }
  function saveHeatLogCache(){}
  // CHAmp refreshes badges on its home screen; Lite's home works its counts out fresh each time it opens.
  function updateFlaggedBadge(){} function updateCalvedBadge(){} function updateOpenBadge(){} function updatePregBtBadge(){}
  function updateSellBadge(){} function updateInHeatBadge(){} function updateSyncHoldBadge(){} function renderList(){}
  function saleSheetBtnHtml(){ return ''; }

  function closeModal(){ Lite.closeModal(); }
  function openModal(html){ return Lite.openModal(html); }

  // ---- CHAmp's code, copied ----
  
    const PROFILE_QUICK_ADD_TYPES = [
      { type:'meds', title:'Log Medicine', label:'Meds' },
      { type:'calving', title:'Log Calving', label:'Calving' },
      { type:'weights', title:'Log Weight', label:'Weight' },
      { type:'breeding', title:'Log Breeding', label:'Breed' },
      { type:'notes', title:'Add Note', label:'Note' }
    ];
    const EPD_NAMES = {CED:'Calving ease direct',BW:'Birth weight',WW:'Weaning weight',YW:'Yearling weight',RADG:'Residual avg daily gain',DMI:'Dry matter intake',YH:'Yearling height',SC:'Scrotal circumference',Doc:'Docility',Claw:'Claw set',Angle:'Foot angle',PAP:'Pulmonary arterial pressure',HS:'Hair shed',HP:'Heifer pregnancy',CEM:'Calving ease maternal',Milk:'Milk',Teat:'Teat size',UDDR:'Udder suspension',MW:'Mature weight',MH:'Mature height','$EN':'Energy value',CW:'Carcass weight',Marb:'Marbling',RE:'Ribeye area',Fat:'Fat thickness','$M':'Maternal',"$W":'Weaned calf','$F':'Feedlot','$G':'Grid','$B':'Beef','$C':'Combined'};
    const EPD_ORDER = ['CED','BW','WW','YW','RADG','DMI','YH','SC','Doc','Claw','Angle','PAP','HS','HP','CEM','Milk','Teat','UDDR','FL','MW','MH','$EN','CW','Marb','RE','Fat','$M','$W','$F','$G','$B','$C'];
    const EPD_GROUPS = [
      ['Growth and calving', ['CED','BW','WW','YW','RADG','DMI','YH','SC'], false],
      ['Maternal', ['HP','CEM','Milk','MW','MH'], false],
      ['Structure and health', ['Doc','Claw','Angle','PAP','HS','Teat','UDDR','FL'], false],
      ['Carcass', ['CW','Marb','RE','Fat'], false],
      ['$ values', ['$M','$W','$F','$G','$B','$C','$EN'], true]
    ];
    function profileRecordToolsFull(r, kind){
      return `<button class="record-del" data-kind="${kind}" data-id="${escapeHtml(r.id)}" title="Delete">&times;</button>`
        + (r._pendingSync ? '' : `<button class="record-edit" data-kind="${kind}" data-id="${escapeHtml(r.id)}" title="Edit">&#9998;</button>`)
        + (r._pendingSync ? `<div style="display:inline-flex;align-items:center;gap:4px;background:#FCEBEB;border:1px solid #E24B4A;color:#791F1F;font-family:Arial,sans-serif;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;margin-bottom:6px;">Not synced yet</div>` : '');
    }
    function profileRecordTools(r, kind){
      // the pencil and X only show for the kinds of record Lite can change so far
      if(Lite.records && Lite.records.kinds && Lite.records.kinds[kind]) return profileRecordToolsFull(r, kind);
      return r._pendingSync ? `<div style="display:inline-flex;align-items:center;gap:4px;background:#FCEBEB;border:1px solid #E24B4A;color:#791F1F;font-family:Arial,sans-serif;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;margin-bottom:6px;">Not synced yet</div>` : '';
    }
    function escapeHtml(s){
      const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML;
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
    function daysBetween(a, b){
      return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
    }
    function daysAgo(iso){
      const d = new Date(iso+'T00:00:00');
      const now = new Date(); now.setHours(0,0,0,0);
      return Math.round((now-d)/86400000);
    }
    function isActiveStatus(cow){
      return !cow.status || cow.status === 'Active';
    }
    function truncateText(str, maxLen){
      maxLen = maxLen || 46;
      if(!str) return '';
      return str.length > maxLen ? str.slice(0, maxLen-1) + '…' : str;
    }
    function fmtDate(iso){
      const d = new Date(iso+'T00:00:00');
      return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    }
    function fmtDateShort(iso){
      const d = new Date(iso+'T00:00:00');
      return d.toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'2-digit'});
    }
    function cowNumCmp(a, b){
      const x = String(a == null ? '' : a).toUpperCase(), y = String(b == null ? '' : b).toUpperCase();
      const fx = x.charAt(0), fy = y.charAt(0);
      if(fx !== fy) return fx < fy ? -1 : 1;
      return x.localeCompare(y, undefined, {numeric:true});
    }
    function recordsFor(num){
      return treatments.filter(t=>t.cow_number===num);
    }
    function calvingsFor(num){
      return calvings.filter(c=>c.cow_number===num);
    }
    function generalNotesFor(num){
      return generalNotes.filter(n=>n.cow_number===num);
    }
    function weightsFor(num){
      return weights.filter(w=>w.cow_number===num);
    }
    function breedingFor(num){
      return breedingRecords.filter(b=>b.cow_number===num);
    }
    function photosFor(num){
      return cowPhotos.filter(p=>p.cow_number===num);
    }
    function ownerColor(owner){
      if(owner === 'JF') return '#D46A8C';
      if(owner === 'FCC') return '#D4B93C';
      if(owner === 'Kellan') return '#000000';
      if(owner === 'Clint') return '#FFFFFF';
      if(owner === 'LA') return '#4A7A3D';
      return null;
    }
    function ownerNumHtml(num, owner){
      const oColor = ownerColor(owner);
      const style = oColor ? `style="color:${oColor};${oColor==='#FFFFFF' ? 'text-shadow:0 0 2px #000,0 0 1px #000;' : ''}"` : '';
      return `<span ${style}>#${escapeHtml(num)}</span>`;
    }
    function getOwnerOptions(){
      return ownersList.map(o=>o.name);
    }
    function getGroupOptions(){
      return groupsList.map(g=>g.name);
    }
    function getLocationOptions(){
      return locationsList.map(l=>l.name);
    }
    function matchesLocationGroupFilter(c, filterKind, filterValue){
      if(filterKind === 'loc'){
        if(filterValue === '__other__'){
          if(!c.lot || getLocationOptions().includes(c.lot)) return false;
        } else if(c.lot !== filterValue){
          return false;
        }
      } else if(filterKind === 'grp'){
        if(c.cow_group !== filterValue) return false;
      } else if(filterKind === 'own'){
        if(filterValue === '__unassigned__'){
          if(c.owner) return false;
        } else if(c.owner !== filterValue){
          return false;
        }
      } else if(filterKind === 'flag'){
        if(!c.needs_entry) return false;
      } else if(filterKind === 'tag'){
        if(!c.tag_needed) return false;
      } else if(filterKind === 'calved'){
        if(!c.calved) return false;
      } else if(filterKind === 'pregbt'){
        if(!c.preg_bt) return false;
      } else if(filterKind === 'sell'){
        if(!c.sell) return false;
      } else if(filterKind === 'heat'){
        if(!c.in_heat) return false;
      } else if(filterKind === 'herd'){
        if(c.herd_season !== filterValue) return false;
      } else if(filterKind === 'act'){
        if(!isActiveStatus(c)) return false;
        const [actType, actDaysStr] = filterValue.split(':');
        if(!cowHasRecentActivityOfType(c.number, actType, parseInt(actDaysStr, 10))) return false;
      }
      return true;
    }
    function populateLocationGroupFilter(rowId, selectId){
      const row = document.getElementById(rowId);
      const sel = document.getElementById(selectId);
      row.style.display = '';
      const usedLots = [...new Set(cows.map(c=>c.lot).filter(Boolean))];
      const hasOtherLots = usedLots.some(l=>!getLocationOptions().includes(l));
      const usedGroups = [...new Set(cows.map(c=>c.cow_group).filter(Boolean))];
      const extraGroups = usedGroups.filter(g=>!getGroupOptions().includes(g)).sort();
      const groups = [...getGroupOptions(), ...extraGroups];
      const usedOwners = [...new Set(cows.map(c=>c.owner).filter(Boolean))];
      const extraOwners = usedOwners.filter(o=>!getOwnerOptions().includes(o)).sort();
      const owners = [...getOwnerOptions(), ...extraOwners];
      const hasUnassigned = cows.some(c=>!c.owner);
      const hasFlagged = cows.some(c=>c.needs_entry);
      const hasTagNeeded = false;
      const hasCalved = cows.some(c=>c.calved);
      const hasPregBt = false;
      const hasSell = cows.some(c=>c.sell);
      const hasInHeat = cows.some(c=>c.in_heat);
      const hasSpring = cows.some(c=>c.herd_season==='Spring');
      const hasFall = cows.some(c=>c.herd_season==='Fall');
  
      const prevValue = sel.value;
      const activityTypes = [
        { type:'Med', label:'Recent Med' },
        { type:'Calving', label:'Recent Calving' },
        { type:'Note', label:'Recent Note' },
        { type:'Weight', label:'Recent Weight' },
        { type:'Breeding', label:'Recent Breeding' }
      ];
      const activityIcons = { Med:'🐄', Calving:'🐮', Note:'📝', Weight:'⚖️', Breeding:'🐂' };
      const activityOptgroups = activityTypes.map(t=>
        `<optgroup label="${activityIcons[t.type]} ${t.label}">` +
          `<option value="act:${t.type}:0">Today</option>` +
          `<option value="act:${t.type}:7">1 Week</option>` +
          `<option value="act:${t.type}:30">1 Month</option>` +
          `<option value="act:${t.type}:99999">All</option>` +
        `</optgroup>`
      ).join('');
      const statusOptions = (hasFlagged ? '<option value="flag:1">Flagged</option>' : '') +
        (hasTagNeeded ? '<option value="tag:1">Tag Needed</option>' : '') +
        (hasCalved ? '<option value="calved:1">Calved</option>' : '') +
        (hasPregBt ? '<option value="pregbt:1">Preg BT</option>' : '') +
        (hasSell ? '<option value="sell:1">Sell</option>' : '') +
        (hasInHeat ? '<option value="heat:1">In Heat</option>' : '') +
        (hasSpring ? '<option value="herd:Spring">Spring Herd</option>' : '') +
        (hasFall ? '<option value="herd:Fall">Fall Herd</option>' : '');
      sel.innerHTML = '<option value="">All Locations / Groups / Owners</option>' +
        (statusOptions ? `<optgroup label="✅ Status">${statusOptions}</optgroup>` : '') +
        '<optgroup label="📍 Location">' +
          getLocationOptions().map(l=>`<option value="loc:${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('') +
          (hasOtherLots ? '<option value="loc:__other__">Other Location</option>' : '') +
        '</optgroup>' +
        '<optgroup label="🐮 Group">' +
          groups.map(g=>`<option value="grp:${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('') +
        '</optgroup>' +
        '<optgroup label="👤 Owner">' +
          owners.map(o=>`<option value="own:${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('') +
          (hasUnassigned ? '<option value="own:__unassigned__">Unassigned</option>' : '') +
        '</optgroup>' +
        activityOptgroups;
      if([...sel.options].some(o=>o.value===prevValue)) sel.value = prevValue;
    }
    function cowHasRecentActivityOfType(num, type, days){
      let dates = [];
      if(type === 'Med') dates = recordsFor(num).map(r=>r.date);
      else if(type === 'Calving') dates = calvingsFor(num).map(r=>r.calving_date);
      else if(type === 'Note') dates = generalNotesFor(num).map(r=>r.note_date);
      else if(type === 'Weight') dates = weightsFor(num).map(r=>r.weigh_date);
      else if(type === 'Breeding') dates = breedingFor(num).map(r=>r.breed_date);
      return dates.some(d=> d && daysAgo(d) <= days && daysAgo(d) >= 0);
    }
    function mostRecentActivityDate(num){
      const dates = [
        ...recordsFor(num).map(r=>r.date),
        ...calvingsFor(num).map(r=>r.calving_date),
        ...generalNotesFor(num).map(r=>r.note_date),
        ...weightsFor(num).map(r=>r.weigh_date),
        ...breedingFor(num).map(r=>r.breed_date)
      ].filter(Boolean);
      if(dates.length === 0) return null;
      return dates.sort((a,b)=> b.localeCompare(a))[0];
    }
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
    function bredToText(b){
      if(!b) return '';
      if(b.pregnancy_method === 'BB') return b.natural_sire ? 'BB \u2014 ' + b.natural_sire : 'BB';
      return b.bred_to || b.natural_sire || '';
    }
    function calfSexLabel(sex){
      return sex === 'B' ? 'Bull' : sex === 'H' ? 'Heifer' : 'Unknown';
    }
    function diedLabel(r){
      let label = 'Died';
      if(r.died_date) label += ' ' + fmtDate(r.died_date);
      if(r.died_reason) label += ' — ' + escapeHtml(r.died_reason);
      return label;
    }
    function fmtMoneySold(v){
      const n = Number(v);
      if(!isFinite(n)) return '';
      return '$' + n.toLocaleString('en-US', { minimumFractionDigits: (n % 1 ? 2 : 0), maximumFractionDigits: 2 });
    }
    function soldLabel(r){
      let t = 'Sold';
      if(r.sold_date) t += ' ' + fmtDateShort(r.sold_date);
      if(r.sold_to) t += ' to ' + r.sold_to;
      if(r.sold_price !== null && r.sold_price !== undefined && r.sold_price !== '') t += ', ' + fmtMoneySold(r.sold_price);
      return escapeHtml(t);
    }
    function weaningStats(c){
      if(!c || c.weaning_weight == null || c.weaning_weight === '') return null;
      const weight = Number(c.weaning_weight);
      const age = c.weaning_date ? daysBetween(c.calving_date, c.weaning_date) : null;
      const bw = (c.birth_weight != null && Number(c.birth_weight) > 0) ? Number(c.birth_weight) : null;
      const gain = (bw != null && age != null && age > 0) ? (weight - bw) / age : null;
      return { weight, date: c.weaning_date || null, age, gain };
    }
    function weaningLineText(c){
      const s = weaningStats(c);
      if(!s) return '';
      const parts = ['Weaned' + (s.date ? ' ' + fmtDateShort(s.date) : ''), s.weight + ' lbs'];
      if(s.age != null) parts.push(s.age + ' days old');
      if(s.gain != null) parts.push(s.gain.toFixed(1) + ' lbs/day');
      return parts.join(' · ');
    }
    function weaningLineHtml(c){
      const txt = weaningLineText(c);
      return txt ? `<div style="margin-top:6px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#3C9142;">${escapeHtml(txt)}</div>` : '';
    }
    function confirmedBadgeHtml(r){
      if(!r || !r.vet_call_date || r.pregnancy_status === 'Open') return '';
      const m = r.pregnancy_method ? ' ' + escapeHtml(r.pregnancy_method) : '';
      return `<div style="display:inline-block;background:#3C9142;color:#fff;font-family:Arial,sans-serif;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin:2px 0 4px;">&#10003; CONFIRMED${m} &middot; ${fmtDate(r.vet_call_date)}</div>`;
    }
    function openBadgeHtml(r){
      if(!r || r.pregnancy_status !== 'Open') return '';
      return `<div style="display:inline-block;background:#6F2E24;color:#fff;font-family:Arial,sans-serif;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin:2px 0 4px;">OPEN${r.open_date ? ' &middot; ' + fmtDate(r.open_date) : ''}</div>`;
    }
    function daysBredText(r){
      if(!r || !r.breed_date || r.pregnancy_status === 'Open') return '';
      if(calvingsFor(r.cow_number).some(c=>c.calving_date && c.calving_date >= r.breed_date)) return '';
      const d = Math.round((new Date(todayLocal()+'T00:00:00') - new Date(r.breed_date+'T00:00:00')) / 86400000);
      return d >= 0 ? `<div class="record-med">Bred ${d} day${d===1?'':'s'}</div>` : '';
    }
    function cardDaysBetween(aIso, bIso){
      return Math.round((new Date(bIso+'T00:00:00') - new Date(aIso+'T00:00:00')) / 86400000);
    }
    function cardDueText(dueIso){
      const d = cardDaysBetween(todayLocal(), dueIso);
      if(d > 0) return ' — in ' + d + ' day' + (d===1?'':'s');
      if(d === 0) return ' — today';
      return ' — ' + Math.abs(d) + ' day' + (d===-1?'':'s') + ' past';
    }
    function cardRecentInfoHtml(num){
      // Fixed rows, same order on every card. Empty ones show a gray dash. "BB by" only appears when it applies.
      const cow = cows.find(c=>c.number===num);
      const slots = {};
      if(cow){
        if(cow.lot && cow.lot !== 'None') slots.loc = escapeHtml(cow.lot);
        if(cow.cow_group && cow.cow_group !== 'None') slots.group = escapeHtml(cow.cow_group);
        if(cow.herd_season) slots.season = escapeHtml(cow.herd_season);
      }
      const latestMed = [...recordsFor(num)].sort((a,b)=>b.date.localeCompare(a.date))[0];
      if(latestMed){
        const desc = latestMed.medicine ? `${latestMed.medicine}${latestMed.reason ? ' / '+latestMed.reason : ''}` : (latestMed.notes||'note');
        slots.med = `${fmtDateShort(latestMed.date)} — ${truncateText(desc)}`;
      }
      const latestCalving = [...calvingsFor(num)].sort((a,b)=>b.calving_date.localeCompare(a.calving_date))[0];
      if(latestCalving){
        const details = [`${calfSexLabel(latestCalving.calf_sex)} calf`];
        if(latestCalving.birth_weight!=null) details.push(`${latestCalving.birth_weight} lb`);
        if(latestCalving.notes) details.push(latestCalving.notes);
        slots.calved = `${fmtDateShort(latestCalving.calving_date)} — ${truncateText(details.join(', '))}`;
      }
      const latestWeight = [...weightsFor(num)].sort((a,b)=>b.weigh_date.localeCompare(a.weigh_date))[0];
      if(latestWeight){
        slots.weight = `${fmtDateShort(latestWeight.weigh_date)}${latestWeight.weight!=null ? ' — '+latestWeight.weight+' lb' : ''}`;
      }
      const latestBreeding = [...breedingFor(num)].sort((a,b)=>b.breed_date.localeCompare(a.breed_date))[0];
      // A breeding older than her latest calving is history: hide Bred/Vet/Due/BB by until she is bred again
      if(latestBreeding && !(latestCalving && latestCalving.calving_date >= latestBreeding.breed_date)){
        const lb = latestBreeding;
        const method = (lb.pregnancy_method || '').trim();
        const isOpenNow = lb.pregnancy_status === 'Open';
        // Off = vet days more than 10 from the breeding date (checked for every method, AI and ET included). A BB mark alone is not "off".
        const vetIsOff = !isOpenNow && vetMismatch(lb.breed_date, lb.vet_calls, lb.vet_call_date, null);
        const hasDays = !isOpenNow && parseDaysAlongFromVetCalls(lb.vet_calls) != null;
        const showBBBy = !!(vetIsOff && lb.natural_sire);
        let shouldBeDays = null;
        if(lb.vet_call_date && lb.breed_date){
          shouldBeDays = Math.round((new Date(lb.vet_call_date+'T00:00:00') - new Date(lb.breed_date+'T00:00:00')) / 86400000);
          if(!(shouldBeDays >= 0)) shouldBeDays = null;
        }
        if(showBBBy) slots.bbby = `${escapeHtml(lb.natural_sire)} (natural sire)`;
        if(lb.vet_call_date){
          let vetText = fmtDateShort(lb.vet_call_date);
          if(isOpenNow) vetText += ' — Open';
          else {
            if(lb.vet_calls) vetText += ' — '+escapeHtml(lb.vet_calls)+' days';
            if(vetIsOff && hasDays && shouldBeDays != null) vetText += ` (should be ${shouldBeDays})`;
            if(hasDays) vetText += vetIsOff
              ? ' — <b style="color:#A32D2D;">OFF</b>'
              : ' — <b style="color:#2E7D32;">Consistent</b>';
            // BB is dropped here when the red "BB by" line already says it
            if(method && !(method === 'BB' && showBBBy)) vetText += ' — '+escapeHtml(method);
          }
          slots.vet = vetText;
        }
        const bredBull = lb.bred_to || lb.natural_sire || '';
        const bredParts = [];
        if(bredBull) bredParts.push(escapeHtml(bredBull));
        if(method && method !== 'BB') bredParts.push(escapeHtml(method));
        if(!bredBull && isOpenNow) bredParts.push('Open');
        if(lb.notes) bredParts.push(escapeHtml(truncateText(lb.notes)));
        slots.bred = `${fmtDateShort(lb.breed_date)}${bredParts.length ? ' — '+bredParts.join(' — ') : ''}`;
        if(lb.expected_due_date && !isOpenNow){
          const calvedSince = calvingsFor(num).some(c=> c.calving_date >= lb.breed_date);
          slots.due = `${fmtDateShort(lb.expected_due_date)}${calvedSince ? '' : cardDueText(lb.expected_due_date)}`;
        }
      }
      const latestNote = [...generalNotesFor(num)].sort((a,b)=>b.note_date.localeCompare(a.note_date))[0];
      if(latestNote) slots.note = `${fmtDateShort(latestNote.note_date)} — ${escapeHtml(truncateText(latestNote.note||''))}`;
      const order = [['loc','Loc'],['group','Group'],['season','Season'],['med','Med'],['calved','Calved'],['weight','Weight'],['bbby','BB by'],['vet','Vet'],['bred','Bred'],['due','Due'],['note','Note']];
      const rows = order.filter(([k])=> k !== 'bbby' || slots.bbby).map(([k,label])=>{
        const red = k === 'bbby';
        const has = slots[k] != null && slots[k] !== '';
        return `<div class="ci-row"><div class="ci-t${red?' ci-red':''}">${label}</div><div class="${has ? (red?'ci-red':'') : 'ci-e'}">${has ? slots[k] : '—'}</div></div>`;
      }).join('');
      return `<div class="card-info">${rows}</div>`;
    }
    function cardRegBoxHtml(cow){
      const reg = (cow.reg_number || '').toString().trim();
      const lg = reg.length > 8 ? ' long' : '';
      if(reg && cow.epd) return `<div class="card-reg has${lg}" data-open-epd="${escapeHtml(cow.number)}">Reg ${escapeHtml(reg)}</div>`;
      if(reg) return `<div class="card-reg none${lg}">Reg ${escapeHtml(reg)}</div>`;
      return `<div class="card-reg none">Reg —</div>`;
    }
    function cardTagBoxHtml(cow){
      const oc = ownerColor(cow.owner);
      const fill = oc || '#FFFFFF';
      const dark = (fill === '#D4B93C' || fill === '#FFFFFF');
      const txt = dark ? (fill === '#FFFFFF' ? '#0C5A8E' : '#2B2620') : '#fff';
      const lg = String(cow.number).length > 6 ? ' long' : '';
      return `<div class="card-tagbox${lg}" style="background:${fill};color:${txt};">${escapeHtml(cow.number)}</div>`;
    }
    function statusBadgeHtml(cow){
      if(!cow.status || cow.status === 'Active') return '';
      return `<span class="status-badge">${escapeHtml(cow.status)}${cow._pendingStatusSync ? ' <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#E24B4A;vertical-align:2px;"></span>' : ''}</span>`;
    }
    function needsEntryCheckboxHtml(cow){
      return `<span style="position:relative;display:inline-block;">
        <input type="checkbox" class="needs-entry-check rc-check" data-num="${escapeHtml(cow.number)}" ${cow.needs_entry ? 'checked' : ''} title="Flag this cow" style="--rc-color:#0274BA;"/>
        <span data-pending-flag-num="${escapeHtml(cow.number)}" style="display:${cow._pendingFlagSync ? 'block' : 'none'};position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:#A32D2D;border:1.5px solid #fff;"></span>
      </span>`;
    }
    function wireNeedsEntryCheckboxes(container){
      container.querySelectorAll('.needs-entry-check').forEach(cb=>{
        cb.addEventListener('click', e=> e.stopPropagation());
        cb.addEventListener('change', async e=>{
          e.stopPropagation();
          await toggleNeedsEntry(cb.dataset.num, cb.checked);
              updateFlaggedBadge();
          const filterRow = document.getElementById('profileLotFilterRow');
          if(filterRow) populateLocationGroupFilter('profileLotFilterRow', 'profileLocationGroupFilter');
        });
      });
    }
    async function toggleNeedsEntry(num, checked){
      const body = { needs_entry: checked };
      try{
        const updated = await api('/cows?number=eq.' + encodeURIComponent(num), {
          method:'PATCH',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify(body)
        });
        const idx = cows.findIndex(c=>c.number===num);
        if(idx !== -1) cows[idx] = updated[0];
        saveOfflineCache();
      }catch(e){
        if(e && e.isNetworkFailure){
          const idx = cows.findIndex(c=>c.number===num);
          if(idx !== -1) cows[idx] = Object.assign({}, cows[idx], body, { _pendingFlagSync: true });
          queuePendingWrite({
            localId: makeLocalId('pw'),
            kind: 'update', table: 'cows', field: 'needs_entry', cowNumber: num,
            method: 'PATCH', path: '/cows?number=eq.' + encodeURIComponent(num),
            body
          });
          saveOfflineCache();
          document.querySelectorAll('[data-pending-flag-num="'+CSS.escape(num)+'"]').forEach(el=> el.style.display='block');
          showToast('Saved on this phone — will sync when you have signal');
        } else {
          showToast('Could not save — try again');
        }
      }
    }
    function calvedCheckboxHtml(cow){
      return `<span style="position:relative;display:inline-block;">
        <input type="checkbox" class="calved-check rc-check" data-num="${escapeHtml(cow.number)}" ${cow.calved ? 'checked' : ''} title="Calved" style="--rc-color:#0274BA;"/>
        <span data-pending-calved-num="${escapeHtml(cow.number)}" style="display:${cow._pendingCalvedSync ? 'block' : 'none'};position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:#A32D2D;border:1.5px solid #fff;"></span>
      </span>`;
    }
    function wireCalvedCheckboxes(container){
      container.querySelectorAll('.calved-check').forEach(cb=>{
        cb.addEventListener('click', e=> e.stopPropagation());
        cb.addEventListener('change', async e=>{
          e.stopPropagation();
          await toggleCalved(cb.dataset.num, cb.checked);
          updateCalvedBadge();
          updateOpenBadge();
          updatePregBtBadge();
          updateSellBadge();
          updateSyncHoldBadge();
          const filterRow = document.getElementById('profileLotFilterRow');
          if(filterRow) populateLocationGroupFilter('profileLotFilterRow', 'profileLocationGroupFilter');
        });
      });
    }
    async function toggleCalved(num, checked){
      const body = { calved: checked, calved_marked_at: checked ? new Date().toISOString() : null };
      try{
        const updated = await api('/cows?number=eq.' + encodeURIComponent(num), {
          method:'PATCH',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify(body)
        });
        const idx = cows.findIndex(c=>c.number===num);
        if(idx !== -1) cows[idx] = updated[0];
        saveOfflineCache();
      }catch(e){
        if(e && e.isNetworkFailure){
          const idx = cows.findIndex(c=>c.number===num);
          if(idx !== -1) cows[idx] = Object.assign({}, cows[idx], body, { _pendingCalvedSync: true });
          queuePendingWrite({
            localId: makeLocalId('pw'),
            kind: 'update', table: 'cows', field: 'calved', cowNumber: num,
            method: 'PATCH', path: '/cows?number=eq.' + encodeURIComponent(num),
            body
          });
          saveOfflineCache();
          document.querySelectorAll('[data-pending-calved-num="'+CSS.escape(num)+'"]').forEach(el=> el.style.display='block');
          showToast('Saved on this phone — will sync when you have signal');
        } else {
          showToast('Could not save — try again');
        }
      }
    }
    function sellCheckboxHtml(cow){
      return `<span style="position:relative;display:inline-block;">
        <input type="checkbox" class="sell-check rc-check" data-num="${escapeHtml(cow.number)}" ${cow.sell ? 'checked' : ''} title="Sell" style="--rc-color:#0274BA;"/>
        <span data-pending-sell-num="${escapeHtml(cow.number)}" style="display:${cow._pendingSellSync ? 'block' : 'none'};position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:#A32D2D;border:1.5px solid #fff;"></span>
      </span>`;
    }
    function wireSellCheckboxes(container){
      wireInHeatCheckboxes(container);
      container.querySelectorAll('.sell-check').forEach(cb=>{
        cb.addEventListener('click', e=> e.stopPropagation());
        cb.addEventListener('change', async e=>{
          e.stopPropagation();
          await toggleSell(cb.dataset.num, cb.checked);
          const filterRow = document.getElementById('profileLotFilterRow');
          if(filterRow) populateLocationGroupFilter('profileLotFilterRow', 'profileLocationGroupFilter');
        });
      });
    }
    async function toggleSell(num, checked){
      const body = { sell: checked };
      try{
        const updated = await api('/cows?number=eq.' + encodeURIComponent(num), {
          method:'PATCH',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify(body)
        });
        const idx = cows.findIndex(c=>c.number===num);
        if(idx !== -1) cows[idx] = (updated && updated[0]) ? updated[0] : Object.assign({}, cows[idx], body);
        saveOfflineCache();
        updateSellBadge();
          updateSyncHoldBadge();
      }catch(e){
        if(e && e.isNetworkFailure){
          const idx = cows.findIndex(c=>c.number===num);
          if(idx !== -1) cows[idx] = Object.assign({}, cows[idx], body, { _pendingSellSync: true });
          queuePendingWrite({
            localId: makeLocalId('pw'),
            kind: 'update', table: 'cows', field: 'sell', cowNumber: num,
            method: 'PATCH', path: '/cows?number=eq.' + encodeURIComponent(num),
            body
          });
          saveOfflineCache();
          document.querySelectorAll('[data-pending-sell-num="'+CSS.escape(num)+'"]').forEach(el=> el.style.display='block');
          showToast('Saved on this phone — will sync when you have signal');
          updateSellBadge();
          updateSyncHoldBadge();
        } else {
          showToast('Could not save — try again');
        }
      }
    }
    function inHeatCheckboxHtml(cow){
      return `<span style="position:relative;display:inline-block;">
        <input type="checkbox" class="heat-check rc-check" data-num="${escapeHtml(cow.number)}" ${cow.in_heat ? 'checked' : ''} title="In Heat" style="--rc-color:#0274BA;"/>
        <span data-pending-heat-num="${escapeHtml(cow.number)}" style="display:${cow._pendingHeatSync ? 'block' : 'none'};position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:#A32D2D;border:1.5px solid #fff;"></span>
      </span>`;
    }
    function wireInHeatCheckboxes(container){
      container.querySelectorAll('.heat-check').forEach(cb=>{
        cb.addEventListener('click', e=> e.stopPropagation());
        cb.addEventListener('change', async e=>{
          e.stopPropagation();
          await toggleInHeat(cb.dataset.num, cb.checked);
        });
      });
    }
    async function toggleInHeat(num, checked){
      const body = { in_heat: checked };
      try{
        const updated = await api('/cows?number=eq.' + encodeURIComponent(num), {
          method:'PATCH',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify(body)
        });
        const idx = cows.findIndex(c=>c.number===num);
        if(idx !== -1){
          cows[idx] = (updated && updated[0]) ? updated[0] : Object.assign({}, cows[idx], body);
        }
        if(checked) logHeatTick(num);
        saveOfflineCache();
        updateSyncHoldBadge();
        updateInHeatBadge();
      }catch(e){
        if(e && e.isNetworkFailure){
          const idx = cows.findIndex(c=>c.number===num);
          if(idx !== -1) cows[idx] = Object.assign({}, cows[idx], body, { _pendingHeatSync: true });
          if(checked) logHeatTick(num);
          queuePendingWrite({
            localId: makeLocalId('pw'),
            kind: 'update', table: 'cows', field: 'in_heat', cowNumber: num,
            method: 'PATCH', path: '/cows?number=eq.' + encodeURIComponent(num),
            body
          });
          saveOfflineCache();
          document.querySelectorAll('[data-pending-heat-num="'+CSS.escape(num)+'"]').forEach(el=> el.style.display='block');
          showToast('Saved on this phone — will sync when you have signal');
          updateSyncHoldBadge();
          updateInHeatBadge();
        } else {
          // put the box back the way it was
          document.querySelectorAll('.heat-check[data-num="'+CSS.escape(num)+'"]').forEach(el=> el.checked = !checked);
          showToast('Could not save — try again');
        }
      }
    }
    async function logHeatTick(num){
      const iso = new Date().toISOString();
      const tempId = makeLocalId('tmp');
      heatLog.unshift({ id: tempId, cow_number: num, heated_at: iso });
      saveHeatLogCache();
      const body = { cow_number: num, heated_at: iso };
      try{
        const rows = await api('/heat_log', { method:'POST', headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}), body: JSON.stringify(body) });
        const idx = heatLog.findIndex(h=>h.id===tempId);
        if(idx !== -1 && rows && rows[0]) heatLog[idx] = rows[0];
        saveHeatLogCache();
      }catch(e){
        if(e && e.isNetworkFailure){
          queuePendingWrite({ localId: makeLocalId('pw'), kind:'insert', table:'heat_log', tempId, method:'POST', path:'/heat_log', body });
        }
      }
    }
    function isCowOpen(num){
      const latest = [...breedingFor(num)].sort((a,b)=> b.breed_date.localeCompare(a.breed_date))[0];
      return !!(latest && latest.pregnancy_status === 'Open');
    }
    function openCheckboxHtml(cow){
      const isOpen = isCowOpen(cow.number);
      return `<span style="position:relative;display:inline-block;">
        <input type="checkbox" class="open-check rc-check" data-num="${escapeHtml(cow.number)}" ${isOpen ? 'checked' : ''} title="Mark Open" style="--rc-color:#0274BA;"/>
        <span data-pending-open-num="${escapeHtml(cow.number)}" style="display:${cow._pendingOpenSync ? 'block' : 'none'};position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:#A32D2D;border:1.5px solid #fff;"></span>
      </span>`;
    }
    function wireOpenCheckboxes(container){
      container.querySelectorAll('.open-check').forEach(cb=>{
        cb.addEventListener('click', e=> e.stopPropagation());
        cb.addEventListener('change', async e=>{
          e.stopPropagation();
          if(!cb.checked){
            await unmarkCowOpenQuick(cb.dataset.num, cb);
            return;
          }
          await markCowOpenQuick(cb.dataset.num, cb);
        });
      });
    }
    async function markCowOpenQuick(num, checkboxEl){
      const cow = cows.find(c=>c.number===num);
      if(!cow) return;
      const latest = [...breedingFor(num)].sort((a,b)=> b.breed_date.localeCompare(a.breed_date))[0];
      if(!latest){
        showToast(`No breeding record for #${num}`);
        if(checkboxEl) checkboxEl.checked = false;
        return;
      }
      const noteInput = window.prompt(`Mark #${num} open — any note? (optional)`, '');
      const newNote = (noteInput && noteInput.trim()) ? noteInput.trim() : null;
      const combinedNotes = newNote ? (latest.notes ? latest.notes + ' | ' + newNote : newNote) : (latest.notes || null);
      const body = { pregnancy_status:'Open', vet_calls:null, expected_due_date:null, open_date:todayLocal(), vet_call_date:todayLocal(), notes: combinedNotes };
      try{
        const updated = await api('/breeding_records?id=eq.' + encodeURIComponent(latest.id), {
          method:'PATCH',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify(body)
        });
        const idx = breedingRecords.findIndex(b=>b.id===latest.id);
        if(idx !== -1) breedingRecords[idx] = updated[0];
        saveOfflineCache();
        showToast(`#${num} marked open`);
        renderList();
        renderProfileList();
        updateOpenBadge();
          updatePregBtBadge();
          updateSellBadge();
          updateSyncHoldBadge();
      }catch(e){
        if(e && e.isNetworkFailure){
          const idx = breedingRecords.findIndex(b=>b.id===latest.id);
          if(idx !== -1) breedingRecords[idx] = Object.assign({}, breedingRecords[idx], body, { _pendingSync:true });
          cow._pendingOpenSync = true;
          queuePendingWrite({
            localId: makeLocalId('pw'),
            kind: 'update', table: 'breeding_records', recordId: latest.id,
            method: 'PATCH', path: '/breeding_records?id=eq.' + encodeURIComponent(latest.id),
            body
          });
          saveOfflineCache();
          document.querySelectorAll('[data-pending-open-num="'+CSS.escape(num)+'"]').forEach(el=> el.style.display='block');
          showToast(`#${num} saved on this phone — will sync when you have signal`);
          renderList();
          renderProfileList();
        } else {
          showToast('Could not save — try again');
          if(checkboxEl) checkboxEl.checked = false;
        }
      }
    }
    async function unmarkCowOpenQuick(num, checkboxEl){
      const cow = cows.find(c=>c.number===num);
      const latest = [...breedingFor(num)].sort((a,b)=> b.breed_date.localeCompare(a.breed_date))[0];
      if(!cow || !latest || latest.pregnancy_status !== 'Open'){
        if(checkboxEl) checkboxEl.checked = false;
        return;
      }
      const body = { pregnancy_status:null, open_date:null };
      try{
        const updated = await api('/breeding_records?id=eq.' + encodeURIComponent(latest.id), {
          method:'PATCH',
          headers: Object.assign({}, HEADERS, {'Prefer':'return=representation'}),
          body: JSON.stringify(body)
        });
        const idx = breedingRecords.findIndex(b=>b.id===latest.id);
        if(idx !== -1) breedingRecords[idx] = updated[0];
        saveOfflineCache();
        showToast(`#${num} no longer open`);
      }catch(e){
        if(e && e.isNetworkFailure){
          const idx = breedingRecords.findIndex(b=>b.id===latest.id);
          if(idx !== -1) breedingRecords[idx] = Object.assign({}, breedingRecords[idx], body, { _pendingSync:true });
          cow._pendingOpenSync = true;
          queuePendingWrite({
            localId: makeLocalId('pw'),
            kind: 'update', table: 'breeding_records', recordId: latest.id,
            method: 'PATCH', path: '/breeding_records?id=eq.' + encodeURIComponent(latest.id),
            body
          });
          saveOfflineCache();
          showToast(`#${num} saved on this phone — will sync when you have signal`);
        } else {
          showToast('Could not save — try again');
          if(checkboxEl) checkboxEl.checked = true;
          return;
        }
      }
      renderList();
      renderProfileList();
      updateOpenBadge();
      updatePregBtBadge();
      updateSellBadge();
      updateSyncHoldBadge();
    }
    function latestActiveCalfFor(num){
      const active = calvingsFor(num).filter(c=>!c.promoted_to_cow_number && !c.calf_outcome);
      if(active.length === 0) return null;
      return [...active].sort((a,b)=>b.calving_date.localeCompare(a.calving_date))[0];
    }
    function profileQuickAddRowHtml(num){
      const activeCalf = latestActiveCalfFor(num);
      const cols = activeCalf ? 6 : 5;
      const calfBtn = activeCalf
        ? `<button class="profile-quick-add-btn" data-num="${escapeHtml(num)}" data-type="calf" data-calving-id="${escapeHtml(activeCalf.id)}" title="Calf Record" style="background:#2E7D32;border:1px solid rgba(255,255,255,.7);border-radius:8px;padding:15px 2px;cursor:pointer;">
            <span style="font-family:Arial,sans-serif;font-size:15px;font-weight:500;color:#fff;">Calf</span>
          </button>`
        : '';
      return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;">` +
        PROFILE_QUICK_ADD_TYPES.map(t=>
          `<button class="profile-quick-add-btn" data-num="${escapeHtml(num)}" data-type="${t.type}" title="${t.title}" style="background:#fff;border:1px solid #fff;border-radius:8px;padding:15px 2px;cursor:pointer;">
            <span style="font-family:Arial,sans-serif;font-size:15px;font-weight:500;color:#0C5A8E;">${t.label}</span>
          </button>`
        ).join('') + calfBtn +
      `</div>`;
    }
    function quickAddCardHtml(cow){
      const inactiveStyle = isActiveStatus(cow) ? '' : 'opacity:0.55;';
      return `
        <div style="background:#fff;border:2px solid #0C5A8E;border-radius:18px;box-shadow:0 1px 2px rgba(43,38,32,.10), 0 6px 16px rgba(43,38,32,.14);overflow:hidden;margin-bottom:18px;${inactiveStyle}">
          <div data-open-num="${escapeHtml(cow.number)}" style="cursor:pointer;">
            <div class="card-head">
              <div style="display:flex;align-items:center;gap:8px;">${cardTagBoxHtml(cow)}${statusBadgeHtml(cow)}</div>
              <div class="card-tap">Tap for Profile &rsaquo;</div>
            </div>
            <div class="card-body">
              <div class="card-panel">
                ${cardRegBoxHtml(cow)}
                <div class="flag-row"><span class="flag-txt">Calved</span>${calvedCheckboxHtml(cow)}</div>
                <div class="flag-row"><span class="flag-txt">Flag</span>${needsEntryCheckboxHtml(cow)}</div>
                <div class="flag-row"><span class="flag-txt">Open</span>${openCheckboxHtml(cow)}</div>
                <div class="flag-row"><span class="flag-txt">In heat</span>${inHeatCheckboxHtml(cow)}</div>
                <div class="flag-row"><span class="flag-txt">Sell</span>${sellCheckboxHtml(cow)}</div>
              </div>
              ${cardRecentInfoHtml(cow.number)}
            </div>
          </div>
          <div class="card-btns">
            ${profileQuickAddRowHtml(cow.number)}
          </div>
        </div>
      `;
    }
    function renderProfileList(){
      const listEl = document.getElementById('profileCowList');
      const emptyEl = document.getElementById('profileEmptyState');
      if(!listEl) return;
      populateLocationGroupFilter('profileLotFilterRow', 'profileLocationGroupFilter');
      if(pendingProfileFilterOverride !== null){
        const filterSel = document.getElementById('profileLocationGroupFilter');
        if([...filterSel.options].some(o=>o.value===pendingProfileFilterOverride)) filterSel.value = pendingProfileFilterOverride;
        pendingProfileFilterOverride = null;
      }
      const q = (profileSearchBox.value||'').trim().toLowerCase();
      const locGroupVal = document.getElementById('profileLocationGroupFilter').value;
      const sortMode = document.getElementById('profileSortBy').value;
      let sorted;
      if(sortMode === 'recent'){
        sorted = cows.filter(isActiveStatus).sort((a,b)=>{
          const da = mostRecentActivityDate(a.number);
          const db = mostRecentActivityDate(b.number);
          if(!da && !db) return cowNumCmp(a.number, b.number);
          if(!da) return 1;
          if(!db) return -1;
          return db.localeCompare(da);
        });
      } else {
        sorted = cows.filter(isActiveStatus).sort((a,b)=>cowNumCmp(a.number, b.number));
      }
      const [filterKind, filterValue] = locGroupVal ? locGroupVal.split(/:(.*)/s) : [null, null];
      const filtered = sorted.filter(c=>{
        if(!matchesLocationGroupFilter(c, filterKind, filterValue)) return false;
        return !q || c.number.toLowerCase().includes(q);
      });
  
      emptyEl.classList.toggle('hidden', cows.length !== 0);
      lastFilteredProfileCows = filtered;
      listEl.innerHTML = filtered.map(cow=> quickAddCardHtml(cow)).join('');
      wireQuickAddCardOpen(listEl);
      wireProfileQuickAddButtons(listEl);
      wireNeedsEntryCheckboxes(listEl);
      wireCalvedCheckboxes(listEl);
      wireOpenCheckboxes(listEl);
      wireSellCheckboxes(listEl);
    }
    function renderProfile(){
      const num = currentProfileCow;
      const cow = cows.find(c=>c.number===num) || {};
      document.getElementById('profileNum').innerHTML = ownerNumHtml(num, cow.owner);
      renderProfilePhotos(num);
      renderProfileTiles(num);
      renderProfileOrigin(num);
      updateProfileBanner();
  
      // Meds & Notes
      const meds = [...recordsFor(num)].sort((a,b)=>b.date.localeCompare(a.date));
      const medsEl = document.getElementById('profileMedsList');
      medsEl.innerHTML = meds.length === 0
        ? '<p class="empty" style="padding:10px 0;">No entries yet.</p>'
        : meds.map(r=>{
            const isNote = !r.medicine;
            return `<div class="record has-tools${isNote ? ' note-entry' : ''}">
              ${profileRecordTools(r, 'meds')}
              <div class="record-date">${fmtDate(r.date)}${isNote ? ' · NOTE' : ''}</div>
              ${isNote ? '' : `<div class="record-med">${escapeHtml(r.medicine)}</div><div class="record-reason">${escapeHtml(r.reason||'')}</div>`}
              ${r.notes ? `<div class="${isNote ? 'record-reason' : 'record-notes'}">${escapeHtml(r.notes)}</div>` : ''}
            </div>`;
          }).join('');
  
      // Calving Records
      const calvingRecs = [...calvingsFor(num)].sort((a,b)=>b.calving_date.localeCompare(a.calving_date));
      const calvEl = document.getElementById('profileCalvingList');
      calvEl.innerHTML = calvingRecs.length === 0
        ? '<p class="empty" style="padding:10px 0;">No entries yet.</p>'
        : calvingRecs.map(r=>{
            const details = [];
            if(r.birth_weight != null) details.push(`${r.birth_weight} lbs`);
            if(r.sire) details.push(`Sire: ${escapeHtml(r.sire)}`);
            if(r.birth_assist && r.birth_assist !== 'None') details.push(escapeHtml(r.birth_assist));
            const outcomeLabel = r.calf_outcome === 'sold' ? soldLabel(r) : r.calf_outcome === 'died' ? diedLabel(r) : null;
            return `<div class="record has-tools">
              ${profileRecordTools(r, 'calving')}
              <div class="record-date">${fmtDate(r.calving_date)}</div>
              <div class="record-med">${calfSexLabel(r.calf_sex)} calf</div>
              ${details.length ? `<div class="record-reason">${details.join(' · ')}</div>` : ''}
              ${weaningLineHtml(r)}
              ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
              ${r.promoted_to_cow_number
                ? `<div style="margin-top:8px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#3C9142;">✓ ${r.calf_outcome === 'bull' ? 'Kept as bull' : 'Promoted to'} #${escapeHtml(r.promoted_to_cow_number)}</div>`
                : `${outcomeLabel ? `<div style="margin-top:8px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#6F2E24;">${outcomeLabel}</div>` : ''}${r._pendingSync ? '' : `<button class="btn btn-nav-tool btn-sm calf-record-btn" data-id="${escapeHtml(r.id)}" style="margin-top:8px;">🐄 Calf Record</button>`}`}
            </div>`;
          }).join('');
  
      // Calf Activity — meds/notes/weights for her most recent calf that hasn't been made its own cow yet
      const currentCalf = calvingRecs.find(r=> !r.promoted_to_cow_number);
      const calfActivityLabel = document.getElementById('profileCalfActivityLabel');
      const calfActivityEl = document.getElementById('profileCalfActivityList');
      if(currentCalf){
        const calfMeds = calfTreatments.filter(t=>t.calving_id===currentCalf.id).sort((a,b)=>b.date.localeCompare(a.date));
        const calfWts = calfWeights.filter(w=>w.calving_id===currentCalf.id).sort((a,b)=>b.weigh_date.localeCompare(a.weigh_date));
        if(calfMeds.length === 0 && calfWts.length === 0){
          calfActivityLabel.style.display = 'none';
          calfActivityEl.innerHTML = '';
        } else {
          calfActivityLabel.style.display = '';
          const medsHtml = calfMeds.map(t=>{
            const desc = t.medicine ? `${escapeHtml(t.medicine)}${t.reason ? ' / '+escapeHtml(t.reason) : ''}` : '(note only)';
            return `<div class="record has-tools" style="border-left-color:#2E88C4;">
              ${profileRecordTools(t, 'calfmed')}
              <div class="record-date">${fmtDate(t.date)}</div>
              <div class="record-med">${desc}</div>
              ${t.notes ? `<div class="record-notes">${escapeHtml(t.notes)}</div>` : ''}
            </div>`;
          }).join('');
          const wtsHtml = calfWts.map(w=>`<div class="record has-tools" style="border-left-color:#2E88C4;">
            ${profileRecordTools(w, 'calfweight')}
            <div class="record-date">${fmtDate(w.weigh_date)}</div>
            <div class="record-med">${w.weight!=null ? w.weight+' lbs' : ''}</div>
            ${w.notes ? `<div class="record-notes">${escapeHtml(w.notes)}</div>` : ''}
          </div>`).join('');
          calfActivityEl.innerHTML = `<div style="font-family:Arial,sans-serif;font-size:12px;color:#6b6350;margin-bottom:6px;">From #${escapeHtml(num)}'s ${fmtDate(currentCalf.calving_date)} calf — not her own record</div>${medsHtml}${wtsHtml}`;
        }
      } else {
        calfActivityLabel.style.display = 'none';
        calfActivityEl.innerHTML = '';
      }
  
      // General Notes
      const notesRecs = [...generalNotesFor(num)].sort((a,b)=>b.note_date.localeCompare(a.note_date));
      const notesEl = document.getElementById('profileNotesList');
      notesEl.innerHTML = notesRecs.length === 0
        ? '<p class="empty" style="padding:10px 0;">No entries yet.</p>'
        : notesRecs.map(r=>`<div class="record has-tools note-entry">
            ${profileRecordTools(r, 'notes')}
            <div class="record-date">${fmtDate(r.note_date)}</div>
            <div class="record-reason">${escapeHtml(r.note||'')}</div>
          </div>`).join('');
  
      // Weights
      const weightRecs = [...weightsFor(num)].sort((a,b)=>b.weigh_date.localeCompare(a.weigh_date));
      const weightsEl = document.getElementById('profileWeightsList');
      weightsEl.innerHTML = weightRecs.length === 0
        ? '<p class="empty" style="padding:10px 0;">No entries yet.</p>'
        : weightRecs.map((r,i)=>{
            const prev = weightRecs[i+1];
            let changeHtml = '';
            if(prev && r.weight != null && prev.weight != null){
              const diff = r.weight - prev.weight;
              const sign = diff > 0 ? '+' : '';
              const color = diff > 0 ? 'var(--pasture)' : (diff < 0 ? 'var(--barn)' : '#6b6350');
              changeHtml = `<div class="record-reason" style="color:${color};font-weight:700;">${sign}${diff} lbs since ${fmtDateShort(prev.weigh_date)}</div>`;
            }
            return `<div class="record has-tools">
              ${profileRecordTools(r, 'weights')}
              <div class="record-date">${fmtDate(r.weigh_date)}</div>
              <div class="record-med">${r.weight!=null ? r.weight + ' lbs' : ''}</div>
              ${changeHtml}
              ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
            </div>`;
          }).join('');
  
      // Breeding Records
      const breedingRecs = [...breedingFor(num)].sort((a,b)=>b.breed_date.localeCompare(a.breed_date));
      const breedingEl = document.getElementById('profileBreedingList');
      breedingEl.innerHTML = breedingRecs.length === 0
        ? '<p class="empty" style="padding:10px 0;">No entries yet.</p>'
        : breedingRecs.map(r=>{
            const details = [];
            if(r.bred_to) details.push(`Bred to: ${escapeHtml(r.bred_to)}`);
            if(r.pregnancy_method) details.push(escapeHtml(r.pregnancy_method));
            if(r.natural_sire) details.push(`Natural sire: ${escapeHtml(r.natural_sire)}`);
            return `<div class="record has-tools"${r.pregnancy_status==='Open' ? ' style="border-left-color:#6F2E24;"' : ''}>
              ${profileRecordTools(r, 'breeding')}
              <div class="record-date">${fmtDate(r.breed_date)}</div>
              ${confirmedBadgeHtml(r)}
              ${openBadgeHtml(r)}
              ${details.length ? `<div class="record-reason">${details.join(' · ')}</div>` : ''}
              ${r.expected_due_date ? `<div class="record-med">Due: ${fmtDate(r.expected_due_date)}</div>${daysBredText(r)}` : ''}
              ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
            </div>`;
          }).join('');
  
      // a category with no entries is hidden (its "+" button beside the tile above still adds the first one)
      [['profileSecMeds', meds.length], ['profileSecCalving', calvingRecs.length], ['profileSecNotes', notesRecs.length],
       ['profileSecWeights', weightRecs.length], ['profileSecBreeding', breedingRecs.length]].forEach(([id, n])=>{
        const s = document.getElementById(id);
        if(s) s.classList.toggle('hidden', n === 0);
      });
    }
    function renderProfileTiles(num){
      const el = document.getElementById('profileTiles');
      if(!el) return;
      const none = '<span style="color:#a08f6b;">None yet</span>';
      const row = (lbl, val, sub, btnText, type, extra, green) => {
        const accent = green ? '#3C9142' : '#2E88C4';
        const btnCls = green ? 'btn btn-profile-tool' : 'btn btn-profile-nav';
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="flex:1;min-width:0;background:#FFFFFF;border:1.5px solid #c9bfa4;border-left:6px solid ${accent};border-radius:2px;padding:10px 12px;">
            <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#0C447C;font-weight:700;">${lbl}</div>
            <div style="font-size:20px;font-weight:700;margin:3px 0 1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${val}</div>
            <div style="font-family:Arial,sans-serif;font-size:12px;color:#6b6350;">${sub}</div>
          </div>
          <div class="profile-tile-btn" style="width:112px;flex-shrink:0;"><button class="${btnCls}" data-type="${type}" ${extra || ''} style="width:100%;height:46px;padding:0 8px;">${btnText}</button></div>
        </div>`;
      };
      const w = [...weightsFor(num)].filter(x=> x.weight != null).sort((a,b)=> (b.weigh_date || '').localeCompare(a.weigh_date || ''))[0];
      const br = [...breedingFor(num)].sort((a,b)=> (b.breed_date || '').localeCompare(a.breed_date || ''))[0];
      const cv = [...calvingsFor(num)].sort((a,b)=> (b.calving_date || '').localeCompare(a.calving_date || ''))[0];
      const m = [...recordsFor(num)].filter(x=> x.medicine).sort((a,b)=> (b.date || '').localeCompare(a.date || ''))[0];
      const nt = [...generalNotesFor(num)].sort((a,b)=> (b.note_date || '').localeCompare(a.note_date || ''))[0];
      const calf = latestActiveCalfFor(num);
      let html = '';
      html += row('Last weight', w ? Number(w.weight).toLocaleString() + ' lbs' : none, w ? fmtDateShort(w.weigh_date) : '&nbsp;', '+ Weight', 'weights');
      html += row('Bred to', br ? escapeHtml(bredToText(br) || 'Unknown') : none, br ? escapeHtml((br.pregnancy_method ? br.pregnancy_method + ' · ' : '') + fmtDateShort(br.breed_date)) : '&nbsp;', '+ Breeding', 'breeding');
      html += row('Last calving', cv ? escapeHtml(calfSexLabel(cv.calf_sex)) + ' calf' : none, cv ? escapeHtml(fmtDateShort(cv.calving_date) + (cv.birth_weight != null ? ' · ' + cv.birth_weight + ' lbs' : '')) : '&nbsp;', '+ Calving', 'calving');
      html += row('Last med', m ? escapeHtml(m.medicine) : none, m ? escapeHtml(fmtDateShort(m.date) + (m.reason ? ' · ' + m.reason : '')) : '&nbsp;', '+ Med', 'meds');
      html += row('Last note', nt ? escapeHtml(nt.note || '') : none, nt ? fmtDateShort(nt.note_date) : '&nbsp;', '+ Note', 'notes');
      if(calf){
        const cw = [...calfWeights.filter(x=> x.calving_id === calf.id && x.weight != null)].sort((a,b)=> (b.weigh_date || '').localeCompare(a.weigh_date || ''))[0];
        const ws = weaningStats(calf);
        const calfSub = ws ? escapeHtml('Weaned ' + ws.weight + ' lbs' + (ws.gain != null ? ' · ' + ws.gain.toFixed(1) + ' lbs/day' : '')) : (cw ? escapeHtml('Last wt ' + cw.weight + ' lbs · ' + fmtDateShort(cw.weigh_date)) : 'No weights yet');
        html += row('Calf', escapeHtml(calfSexLabel(calf.calf_sex)) + ' calf', calfSub, '+ Calf', 'calf', `data-calving-id="${escapeHtml(calf.id)}"`, true);
      }
      el.innerHTML = html;
    }
    function renderProfileOrigin(num){
      const el = document.getElementById('profileOrigin');
      if(!el) return;
      const c = calvings.find(r=> r.promoted_to_cow_number != null && String(r.promoted_to_cow_number) === String(num));
      const me = cows.find(x=> String(x.number) === String(num));
      let soldBox = '';
      if(me && me.status === 'Sold' && (me.sold_date || me.sold_to || me.sale_sheet_id)){
              const t = 'Sold' + (me.sold_date ? ' ' + fmtDateShort(me.sold_date) : '') + (me.sold_to ? ' to ' + me.sold_to : '') + ((me.sold_price !== null && me.sold_price !== undefined && me.sold_price !== '') ? ', ' + fmtMoneySold(me.sold_price) : '');
        soldBox = `<div style="background:#FFFFFF;border:1.5px solid #c9bfa4;border-left:6px solid #6F2E24;border-radius:2px;padding:10px 12px;margin-bottom:10px;">
          <div style="font-size:16px;font-weight:700;color:#6F2E24;">${escapeHtml(t)}</div>
          ${me.sold_notes ? `<div style="font-size:13px;color:#44627F;margin-top:3px;">${escapeHtml(me.sold_notes)}</div>` : ''}
          
        </div>`;
      }
      if(!c){ el.innerHTML = soldBox; return; }
      const born = [`${c.calf_outcome === 'bull' ? 'Kept as a bull · ' : ''}Born ${fmtDateShort(c.calving_date)} to #${escapeHtml(c.cow_number)}`];
      if(c.sire) born.push(`Sire: ${escapeHtml(c.sire)}`);
      if(c.birth_weight != null && Number(c.birth_weight) > 0) born.push(`${escapeHtml(String(c.birth_weight))} lbs at birth`);
      const wean = weaningLineText(c);
      el.innerHTML = `<div style="background:#FFFFFF;border:1.5px solid #c9bfa4;border-left:6px solid #3C9142;border-radius:2px;padding:10px 12px;margin-bottom:10px;">
        <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#0C447C;font-weight:700;">Born &amp; weaned</div>
        <div style="font-size:16px;font-weight:700;margin:4px 0 2px;">${born.join(' · ')}</div>
        <div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:${wean ? '#3C9142' : '#6b6350'};">${wean ? escapeHtml(wean) : 'No weaning weight recorded'}</div>
      </div>` + soldBox;
    }
    function renderProfilePhotos(num){
      const el = document.getElementById('profilePhotosList');
      if(!el) return;
      const photos = [...photosFor(num)].sort((a,b)=> b.taken_at.localeCompare(a.taken_at));
      const sec = document.getElementById('profileSecPhotos');
      if(sec) sec.classList.toggle('hidden', photos.length === 0);   // no photos: no Photos section (Add Photo is in the bottom buttons)
      if(photos.length === 0){
        el.innerHTML = '';
        return;
      }
      el.innerHTML = photos.map(p => `
        <div style="position:relative;width:100px;">
          <img src="${p.photo_url}" style="width:100px;height:100px;object-fit:cover;border-radius:4px;border:2px solid var(--ink);display:block;"/>
          <div style="font-family:Arial,sans-serif;font-size:10px;text-align:center;margin-top:2px;color:#6b6350;">${fmtDateShort(p.taken_at)}</div>
          <a href="${p.photo_url}" download="cow-${escapeHtml(num)}-${p.taken_at}.jpg" target="_blank" title="Download" class="photo-overlay-btn" style="position:absolute;top:3px;left:3px;background:rgba(255,255,255,.9);border-radius:3px;padding:1px 5px;font-size:12px;text-decoration:none;color:var(--ink);">⬇</a>
        </div>
      `).join('');
    }
    function updateProfileBanner(){
      const rowsEl = document.getElementById('profileInfoRows');
      const badge = document.getElementById('profileStatusBadge');
      if(!rowsEl || !badge) return;
      const cow = cows.find(c=> c.number === currentProfileCow);
      if(!cow){ rowsEl.innerHTML = ''; return; }
      const rows = [['Location', cow.lot, 'lot'], ['Owner', cow.owner, 'owner'], ['Group', cow.cow_group, 'group'], ['Herd Season', cow.herd_season, 'season'], ['Reg #', cow.reg_number, 'reg']];
      rowsEl.innerHTML = rows.map(([lbl, val, key], i)=>
        `<div class="profile-info-row" data-edit="${key}" role="button" style="display:flex;align-items:center;padding:11px 0;cursor:pointer;${i < rows.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,.28);' : ''}"><div style="font-family:Arial,sans-serif;width:118px;flex-shrink:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.82);font-weight:700;">${lbl}</div><div style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#fff;min-width:0;flex:1;overflow-wrap:anywhere;">${val ? escapeHtml(val) : 'Not set'}</div><div class="profile-chev" style="font-family:Arial,sans-serif;font-size:24px;line-height:1;color:rgba(255,255,255,.85);padding-left:10px;">&rsaquo;</div></div>`
      ).join('');
      const status = cow.status || 'Active';
      const colors = ({ Active:['#3C9142','#fff'], Sold:['#E3A93C','#2B2620'], Deceased:['#6F2E24','#fff'] })[status] || ['#6b6350','#fff'];
      badge.textContent = status;
      badge.style.background = colors[0];
      badge.style.color = colors[1];
    }
    function openEpdModal(num){
      const cow = cows.find(c=>c.number===num);
      if(!cow || !cow.epd) return;
      const val = {};
      EPD_ORDER.forEach((k,i)=>{ if(cow.epd[i] !== null && cow.epd[i] !== undefined) val[k] = cow.epd[i]; });
      const fmt = (k,v)=>{
        if(k.charAt(0) === '$') return String(v);
        return (v > 0 ? '+' : '') + v;
      };
      const tile = (k, money)=>{
        if(val[k] === undefined) return '';
        const bg = money ? '#EAF3DE' : '#E6F1FB', lab = money ? '#27500A' : '#1F4E8C', num = money ? '#173404' : '#0C447C';
        return `<div style="background:${bg};border-radius:8px;padding:8px 4px;text-align:center;"><div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:${lab};">${escapeHtml(k)}</div><div style="font-family:Arial,sans-serif;font-size:19px;font-weight:700;color:${num};">${escapeHtml(fmt(k, val[k]))}</div>${EPD_NAMES[k] ? `<div style="font-family:Arial,sans-serif;font-size:10px;color:${lab};line-height:1.2;">${escapeHtml(EPD_NAMES[k])}</div>` : ''}</div>`;
      };
      const sections = EPD_GROUPS.map(g=>{
        const tiles = g[1].map(k=>tile(k, g[2])).join('');
        if(!tiles) return '';
        return `<div style="font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#1F4E8C;margin:14px 0 6px;">${escapeHtml(g[0])}</div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">${tiles}</div>`;
      }).join('');
      let dateLine = '';
      if(cow.epd_updated){
        const d = new Date(cow.epd_updated + 'T12:00:00');
        dateLine = 'Loaded from Angus file, ' + d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
      }
      const modal = openModal(`
        <div class="modal-title">EPDs — #${escapeHtml(cow.number)}</div>
        <div style="font-family:Arial,sans-serif;font-size:14px;color:#2B2620;line-height:1.6;">
          ${cow.reg_number ? `<div><b style="color:#1F4E8C;">Reg #</b> ${escapeHtml(cow.reg_number)}</div>` : ''}
          ${cow.epd_sire ? `<div><b style="color:#1F4E8C;">Sire</b> ${escapeHtml(cow.epd_sire)}</div>` : ''}
          ${cow.epd_dam ? `<div><b style="color:#1F4E8C;">Dam</b> ${escapeHtml(cow.epd_dam)}</div>` : ''}
        </div>
        ${sections}
        ${dateLine ? `<div style="font-family:Arial,sans-serif;font-size:12px;color:#6b6350;margin-top:12px;">${escapeHtml(dateLine)}</div>` : ''}
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn btn-outline" id="closeEpdModal">Close</button>
        </div>
      `);
      modal.querySelector('#closeEpdModal').addEventListener('click', closeModal);
    }

  // ---- glue: the screens ----
  var LIST_HTML = "<div class=\"view\" id=\"profileListView\">\n    <button class=\"btn btn-outline btn-full\" id=\"profileListHomeBtn\" style=\"margin-bottom:14px;\">\ud83c\udfe0 Home</button>\n    <div class=\"toolbar\">\n      <input type=\"text\" id=\"profileSearchBox\" placeholder=\"Search cow #...\" autocomplete=\"off\" style=\"flex:1;background:#fff;border:2px solid #2E88C4;border-radius:10px;box-shadow:0 2px 5px rgba(43,38,32,.16);padding:10px 12px;font-family:Arial,sans-serif;font-size:15px;color:var(--ink);\"/>\n      <select id=\"profileSortBy\" style=\"flex:1;background:#fff;border:2px solid #2E88C4;border-radius:10px;box-shadow:0 2px 5px rgba(43,38,32,.16);padding:10px 12px;font-family:Arial,sans-serif;font-size:15px;color:var(--ink);\">\n        <option value=\"number\">Cow Number</option>\n        <option value=\"recent\">Most Recent</option>\n      </select>\n    </div>\n    <div class=\"toolbar\" id=\"profileLotFilterRow\">\n      <select id=\"profileLocationGroupFilter\" style=\"flex:1;background:#fff;border:2px solid #2E88C4;border-radius:10px;box-shadow:0 2px 5px rgba(43,38,32,.16);padding:10px 12px;font-family:Arial,sans-serif;font-size:15px;color:var(--ink);\"><option value=\"\">All Locations / Groups / Owners</option></select>\n    </div>\n    <div id=\"profileCowList\"></div>\n    <div id=\"profileEmptyState\" class=\"empty hidden\">No cattle logged yet.<br/></div>\n    <button class=\"btn btn-outline btn-full\" id=\"profilePrintListBtn\" style=\"margin-top:8px;\">\ud83d\udda8\ufe0f Print This List</button>\n  </div>";
  var PROFILE_HTML = "<div class=\"view\" id=\"profileView\">\n    <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;\">\n      <button class=\"btn btn-outline\" id=\"profileHomeBtn\" style=\"min-height:46px;\">\ud83c\udfe0 Home</button>\n      <button class=\"back\" id=\"profileBackBtn\" style=\"margin-bottom:0;min-height:46px;\">&larr; All Cattle</button>\n    </div>\n\n    <div id=\"profileBanner\" style=\"background:linear-gradient(135deg,#2E88C4,#0C5A8E);border-radius:14px;padding:16px 18px 8px;box-shadow:0 1px 2px rgba(43,38,32,.10),0 6px 16px rgba(43,38,32,.14);margin-bottom:14px;\">\n      <div style=\"display:flex;align-items:center;justify-content:space-between;gap:10px;\">\n        <div id=\"profileNumTag\" style=\"background:#fff;border-radius:12px;padding:6px 14px;min-width:0;\"><div class=\"detail-num\" id=\"profileNum\">#000</div></div>\n        <div id=\"profileStatusBadge\" data-edit=\"status\" role=\"button\" style=\"cursor:pointer;background:#3C9142;color:#fff;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:7px 14px;border-radius:14px;\">Active</div>\n      </div>\n      <div id=\"profileInfoRows\" style=\"margin-top:12px;border-top:1px solid rgba(255,255,255,.4);\"></div>\n    </div>\n\n    <div id=\"profileOrigin\"></div>\n\n    <div id=\"profileTiles\"></div>\n\n    <div id=\"profileSecMeds\">\n      <div class=\"section-label\">Meds &amp; Notes</div>\n      <div id=\"profileMedsList\"></div>\n    </div>\n    <div id=\"profileSecCalving\">\n      <div class=\"section-label\">Calving Records</div>\n      <div id=\"profileCalvingList\"></div>\n    </div>\n\n    <div class=\"section-label\" id=\"profileCalfActivityLabel\" style=\"display:none;\">Calf Activity</div>\n    <div id=\"profileCalfActivityList\" style=\"margin-bottom:20px;\"></div>\n\n    <div id=\"profileSecNotes\">\n      <div class=\"section-label\">General Notes</div>\n      <div id=\"profileNotesList\"></div>\n    </div>\n    <div id=\"profileSecWeights\">\n      <div class=\"section-label\">Weights</div>\n      <div id=\"profileWeightsList\"></div>\n    </div>\n    <div id=\"profileSecBreeding\">\n      <div class=\"section-label\">Breeding Records</div>\n      <div id=\"profileBreedingList\"></div>\n    </div>\n\n    <div id=\"profileSecPhotos\" class=\"hidden\">\n      <div class=\"section-label\">Photos</div>\n      <div id=\"profilePhotosList\" style=\"display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;\"></div>\n    </div>\n  </div>";
  var STYLE_TEXT = ":root{--paper:#EFE8D8;--ink:#2B2620;--barn:#6F2E24;--pasture:#455B3D;--tag:#E3A93C;--line:#c9bfa4;--paper-raised:#F7F2E6;--muted:#6b6350;--muted2:#8a8163;--muted3:#a08f6b;}\n#app .view, #app .view *{box-sizing:border-box;}\n.view{padding:16px 18px 100px;}\n.hidden{display:none !important;}\n.toolbar{display:flex;gap:8px;margin-bottom:14px;}\n.btn{font-family:Arial,sans-serif;font-weight:700;letter-spacing:.05em;text-transform:uppercase;\n    font-size:13px;border:2px solid var(--ink);background:var(--tag);color:var(--ink);\n    padding:10px 16px;border-radius:10px;cursor:pointer;white-space:nowrap;\n    box-shadow:0 2px 5px rgba(43,38,32,.16);}\n.btn:active{transform:translateY(1px);box-shadow:0 1px 2px rgba(43,38,32,.16);}\n.btn[disabled]{opacity:.5;cursor:default;}\n.btn-outline{background:#FFFFFF;border-color:#2E88C4;color:var(--ink);}\n.btn-barn{background:var(--barn);color:var(--paper);border-color:var(--barn);}\n.btn-pasture{background:var(--pasture);color:var(--paper);border-color:var(--pasture);}\n.btn-pink{background:#D46A8C;color:var(--paper);border-color:#D46A8C;}\n.btn-blue{background:#3B6E8F;color:var(--paper);border-color:#3B6E8F;}\n.btn-grey{background:var(--muted);color:var(--paper);border-color:var(--muted);}\n.btn-orange{background:#C4732B;color:var(--paper);border-color:#C4732B;}\n.btn-purple{background:#7A5A9E;color:var(--paper);border-color:#7A5A9E;}\n.btn-yellow{background:var(--tag);color:var(--ink);border-color:var(--tag);}\n.btn-nav-section{background:#0274BA;color:#fff;border-color:#0274BA;text-align:left;display:flex;align-items:center;gap:10px;}\n.btn-nav-tool{background:#2E88C4;color:#fff;border-color:#2E88C4;text-align:left;display:flex;align-items:center;gap:10px;}\n.btn-profile-nav{background:#0274BA;color:#fff;border-color:#0274BA;}\n.btn-profile-tool{background:#3C9142;color:#fff;border-color:#3C9142;}\n.btn-full{width:100%;}\n.btn-sm{padding:7px 12px;font-size:13px;}\n.status-badge{display:inline-block;background:var(--muted2);color:var(--paper);font-size:9px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em;padding:2px 6px;border-radius:8px;margin-left:6px;}\n.empty{text-align:center;padding:50px 20px;color:var(--muted2);font-family:Arial,sans-serif;font-size:15px;line-height:1.6;}\n.back{display:flex;align-items:center;gap:8px;font-family:Arial,sans-serif;font-size:13px;\n    letter-spacing:.05em;color:var(--paper);text-transform:uppercase;font-weight:700;\n    background:#3C9142;border:2px solid #3C9142;border-radius:10px;box-shadow:0 2px 5px rgba(43,38,32,.16);\n    padding:12px 14px;cursor:pointer;width:100%;margin-bottom:16px;}\n.back:active{transform:translateY(1px);}\n.detail-num{font-size:34px;font-weight:700;font-family:Arial,sans-serif;line-height:1;}\n.section-label{font-family:Arial,sans-serif;font-size:11px;letter-spacing:.15em;text-transform:uppercase;\n    color:var(--pasture);font-weight:700;margin:20px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px;}\n.record{background:var(--paper-raised);border:1.5px solid var(--line);border-left:6px solid var(--line);border-radius:2px;padding:12px 14px;margin-bottom:8px;position:relative;}\n.record.note-entry{border-left-color:#3B6E8F;}\n.record.note-entry .record-date{color:#3B6E8F;}\n.record-date{font-family:Arial,sans-serif;font-size:19px;font-weight:700;color:var(--barn);}\n.record-med{font-size:19px;font-weight:700;margin:3px 0 2px;}\n.record-reason{font-size:16px;color:#4a4433;}\n.record-notes{font-family:Arial,sans-serif;font-size:14px;color:var(--muted);margin-top:6px;border-top:1px dashed var(--line);padding-top:6px;}\n.record-del{position:absolute;top:10px;right:10px;background:none;border:none;color:var(--muted3);font-size:16px;cursor:pointer;padding:4px;}\n.record-edit{position:absolute;top:6px;right:40px;background:none;border:none;color:var(--muted3);font-size:26px;cursor:pointer;padding:4px 6px;line-height:1;}\n#profileView .record{background:#fff;padding:9px 12px;}\n#profileView .record-med{font-size:19px;}\n#profileView .record-reason{font-size:19px;}\n#profileView .record-notes{font-size:19px;}\n#profileView .record.has-tools{padding-right:84px;}\n.profile-info-row:active, #profileStatusBadge:active{opacity:.7;}\n#profileView .section-label{font-size:22px;letter-spacing:.02em;margin:26px 0 12px;}\n.modal-backdrop{position:fixed;inset:0;background:rgba(43,38,32,.55);display:flex;align-items:flex-end;justify-content:center;z-index:50;}\n.modal{background:var(--paper);width:100%;max-width:480px;border-top:3px solid var(--ink);border-radius:12px 12px 0 0;padding:20px 18px 28px;max-height:88vh;overflow-y:auto;}\n.modal-title{font-size:22px;font-weight:700;margin:0 0 16px;font-family:Arial,sans-serif;}\n.modal-actions{display:flex;gap:10px;margin-top:18px;}\n.modal-actions .btn{flex:1;}\n.vlt-card-acts .btn{flex:1;padding:11px 6px;font-size:13px;justify-content:center;text-align:center;}\n.card-head .status-badge{margin-left:0;}";
  var NEED = ['cows','treatments','calvings','general_notes','weights','breeding_records','cow_photos','calf_treatments','calf_weights','locations','owners','cow_groups','medicines','med_reasons','bulls'];
  var activeBack = { screen: 'cattle', args: {} };
  var listState = { search: '', sort: 'number', filter: '', scroll: 0 };

  function addStyles(){
    if(document.getElementById('lite-cows-css')) return;
    var st = document.createElement('style');
    st.id = 'lite-cows-css';
    st.textContent = STYLE_TEXT;
    document.head.appendChild(st);
  }

  // Show what the phone has saved right away, then bring in anything older than a minute.
  function ensure(done){
    Lite.useSaved(NEED.filter(function(n){ return !Lite.data[n]; }));
    syncData();
    var stale = NEED.filter(function(n){ return !Lite.liveAt[n] || Date.now() - Lite.liveAt[n] > 60000; });
    var p = stale.length ? Lite.load(stale) : Promise.resolve({});
    return p.then(function(){ syncData(); if(done) done(); });
  }

  function wireQuickAddCardOpen(container){
    var back = activeBack;
    container.querySelectorAll('[data-open-num]').forEach(function(el){
      el.addEventListener('click', function(e){
        e.stopPropagation();
        var epd = e.target.closest('[data-open-epd]');
        if(epd){ openEpdModal(epd.dataset.openEpd); return; }
        closeModal();
        listState.scroll = window.pageYOffset || 0;
        Lite.cowBack = back;
        Lite.show('cow', { num: el.dataset.openNum });
      });
    });
  }
  // + Med / + Weight / + Note (and the quick-add bar) open CHAmp's forms; the rest come in the next steps
  Lite.toggleInHeat = function(num, checked){ return toggleInHeat(num, checked); };
  function addRecord(type, num, calvingId){
    if(type === 'calf'){ if(Lite.records && Lite.records.openCalf) Lite.records.openCalf(calvingId); else showToast('That opens in the next step'); return; }
    var k = Lite.records && Lite.records.kinds && Lite.records.kinds[type];
    if(k) k.add(num); else showToast('That opens in the next step');
  }
  function wireProfileQuickAddButtons(container){
    container.querySelectorAll('.profile-quick-add-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){ e.stopPropagation(); addRecord(btn.dataset.type, btn.dataset.num, btn.dataset.calvingId); });
    });
  }
  document.addEventListener('lite:synced', function(){ if(Lite.redraw) Lite.redraw(); });
  function wireCards(container){
    wireQuickAddCardOpen(container);
    wireProfileQuickAddButtons(container);
    wireNeedsEntryCheckboxes(container);
    wireCalvedCheckboxes(container);
    wireOpenCheckboxes(container);
    wireSellCheckboxes(container);
  }

  // ---- the cattle list (Profile button) ----
  Lite.register('cattle', function(root, args){
    addStyles();
    syncData();
    activeBack = { screen: 'cattle', args: { restore: true } };
    root.innerHTML = LIST_HTML;
    profileSearchBox = document.getElementById('profileSearchBox');
    var sortEl = document.getElementById('profileSortBy'), filterEl = document.getElementById('profileLocationGroupFilter'), emptyEl = document.getElementById('profileEmptyState');
    var emptyText = emptyEl.innerHTML;
    if(!args.restore){ listState.search = ''; listState.sort = 'number'; listState.filter = ''; }
    if(args.filter) listState.filter = args.filter;
    profileSearchBox.value = listState.search; sortEl.value = listState.sort;
    function draw(){
      if(!document.getElementById('profileCowList')) return;
      syncData();
      populateLocationGroupFilter('profileLotFilterRow', 'profileLocationGroupFilter');
      if([].some.call(filterEl.options, function(o){ return o.value === listState.filter; })) filterEl.value = listState.filter;
      renderProfileList();
    }
    if(!Lite.data.cows) emptyEl.innerHTML = 'Loading cattle…';
    document.getElementById('profileListHomeBtn').addEventListener('click', function(){ Lite.show('home'); });
    profileSearchBox.addEventListener('input', function(){ listState.search = profileSearchBox.value; renderProfileList(); });
    sortEl.addEventListener('change', function(){ listState.sort = sortEl.value; renderProfileList(); });
    filterEl.addEventListener('change', function(){ listState.filter = filterEl.value; renderProfileList(); });
    document.getElementById('profilePrintListBtn').addEventListener('click', function(){ Lite.reports.printList(lastFilteredProfileCows); });
    Lite.useSaved(NEED.filter(function(n){ return !Lite.data[n]; }));
    syncData();
    if(Lite.data.cows){ emptyEl.innerHTML = emptyText; draw(); }
    ensure().then(function(){ emptyEl.innerHTML = emptyText; draw(); });
    Lite.redraw = draw;
    if(args.restore) window.scrollTo(0, listState.scroll || 0);
  });

  // ---- the cards for the cows the home number pad found (CHAmp's "quick entry" screen) ----
  Lite.register('cards', function(root, args){
    addStyles();
    syncData();
    activeBack = { screen: 'cards', args: args };
    root.innerHTML = '<div class="view"><button class="btn btn-outline btn-full" id="cardsHomeBtn" style="margin-bottom:16px;">🏠 Home</button><div id="cardsList"></div></div>';
    document.getElementById('cardsHomeBtn').addEventListener('click', function(){ Lite.show('home'); });
    var nums = args.cows.map(function(c){ return c.number; });
    function draw(){
      var listEl = document.getElementById('cardsList');
      if(!listEl) return;
      syncData();
      var fresh = nums.map(function(n){ return cows.filter(function(c){ return c.number === n; })[0]; }).filter(Boolean);
      listEl.innerHTML = fresh.map(function(cow){ return quickAddCardHtml(cow); }).join('');
      wireCards(listEl);
    }
    draw();
    Lite.redraw = draw;
    ensure(draw);
  });

  // ---- one cow ----
  Lite.register('cow', function(root, args){
    addStyles();
    syncData();
    currentProfileCow = args.num;
    var back = Lite.cowBack || { screen: 'cattle', args: { restore: true } };
    root.innerHTML = PROFILE_HTML;
    document.getElementById('profileBackBtn').textContent = back.label || (back.screen === 'cards' ? '\u2190 Back' : '\u2190 All Cattle');
    document.getElementById('profileHomeBtn').addEventListener('click', function(){ Lite.show('home'); });
    document.getElementById('profileBackBtn').addEventListener('click', function(){
      Lite.show(back.screen, back.args || {});
      if(back.args && back.args.restore) window.scrollTo(0, listState.scroll || 0);
    });
    var view = document.getElementById('profileView');
    view.addEventListener('click', async function(e){
      var tileBtn = e.target.closest('.profile-tile-btn button[data-type]');
      if(tileBtn){ addRecord(tileBtn.dataset.type, currentProfileCow, tileBtn.dataset.calvingId); return; }
      var calfBtn = e.target.closest('.calf-record-btn[data-id]');
      if(calfBtn){ addRecord('calf', currentProfileCow, calfBtn.dataset.id); return; }
      var ed = e.target.closest('.record-edit[data-kind]'), del = e.target.closest('.record-del[data-kind]');
      if(ed || del){
        var b = ed || del, k = Lite.records && Lite.records.kinds && Lite.records.kinds[b.dataset.kind];
        if(!k) return;
        var rec = (Lite.data[k.list] || []).filter(function(r){ return String(r.id) === String(b.dataset.id); })[0];
        if(!rec) return;
        if(ed){ k.edit(rec); return; }
        if(!window.confirm('Delete this ' + k.label + '? It will be moved to Recently Deleted.')) return;
        await k.del(b.dataset.id, currentProfileCow);
        if(Lite.redraw) Lite.redraw();
        return;
      }
      var ban = e.target.closest('[data-edit]');
      if(ban){ if(Lite.records && Lite.records.editBanner) Lite.records.editBanner(ban.dataset.edit, currentProfileCow); else showToast('Changing this opens in the next step'); return; }
    });
    function draw(){
      if(!document.getElementById('profileView')) return;
      syncData();
      renderProfile();
    }
    draw();
    Lite.redraw = draw;
    ensure(draw);
  });
})();
