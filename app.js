/* ===== Status Recorder App ===== */
(function () {
  'use strict';

  // ===== Defaults & Constants =====
  const HOURS = 24;
  const STORAGE_KEY_RECORDS = 'status_records_v1';
  const STORAGE_KEY_SETTINGS = 'status_settings_v1';
  const STORAGE_KEY_CATEGORIES = 'status_categories_v1';

  const DEFAULT_CATEGORIES = [
    { id: 'health', name: '身体', subStatuses: [{ id: 'sleep', name: '睡眠' }, { id: 'mood', name: '情绪' }] },
    { id: 'work', name: '工作', subStatuses: [] },
    { id: 'study', name: '学习', subStatuses: [] },
  ];

  const DEFAULT_SETTINGS = {
    highlightColor: '#ffeb3b',
    timeRangeMinutes: 30,
    outOfRangeHighlight: true,
    reminderEnabled: true,
    reminderQuietStart: 0,
    reminderQuietEnd: 6,
    reminderLeadMinutes: 5,
    pdfTitle: '状态巡检记录',
    parents: [],
    oneClickName: '一键打卡',
    oneClickPreset: {
      status: '✓',
      targets: null, // null = all; otherwise { catId: { subId: true/false } }
    },
    columnWidths: {},
    defaultColWidth: 80,
  };

  const STATUS_EMPTY = '';
  const STATUS_CHECKED = '✓';
  const STATUS_CROSSED = '✗';

  // ===== Time Offset (shared with settings.js for simulated time) =====
  const STORAGE_KEY_TIME_OFFSET = 'status_time_offset_ms_v1';
  function getTimeOffsetMs() {
    const v = localStorage.getItem(STORAGE_KEY_TIME_OFFSET);
    return v ? parseInt(v, 10) || 0 : 0;
  }
  function getNow() {
    return new Date(Date.now() + getTimeOffsetMs());
  }

  // ===== State =====
  let currentDate = getGMTDateString(getNow());
  let settings = loadSettings();
  // Migrate legacy parentName/parentNames -> parents (array of {id,name})
  if (!Array.isArray(settings.parents)) {
    settings.parents = [];
    if (Array.isArray(settings.parentNames)) {
      settings.parentNames.forEach(n => {
        if (n && n.trim()) {
          const id = 'p_' + Math.random().toString(36).slice(2, 10);
          settings.parents.push({ id, name: n.trim() });
        }
      });
    } else if (typeof settings.parentName === 'string' && settings.parentName.trim()) {
      settings.parents.push({ id: 'p_' + Math.random().toString(36).slice(2, 10), name: settings.parentName.trim() });
    }
    delete settings.parentNames;
    delete settings.parentName;
  }
  let categories = loadCategories();
  let records = loadRecords();

  // ===== Helpers =====
  function getGMTDateString(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getGMTHourString(date) {
    return String(date.getUTCHours()).padStart(2, '0');
  }

  function getGMTTimeString(date) {
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function getTimestampString(timestamp) {
    const d = new Date(timestamp);
    return getGMTTimeString(d);
  }

  function getFullDateString(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${dateStr} ${weekdays[d.getUTCDay()]}`;
  }

  function isOutOfRange(date, hour, timestamp) {
    const tolerance = settings.timeRangeMinutes * 60 * 1000;
    const y = parseInt(date.slice(0, 4));
    const m = parseInt(date.slice(5, 7)) - 1;
    const d = parseInt(date.slice(8, 10));
    const recordHourStart = new Date(Date.UTC(y, m, d, parseInt(hour), 0, 0, 0)).getTime();
    const recordHourEnd = recordHourStart + 3600000;
    const ts = new Date(timestamp).getTime();
    return ts < recordHourStart - tolerance || ts > recordHourEnd + tolerance;
  }

  function isInQuietHours(hour) {
    const start = settings.reminderQuietStart;
    const end = settings.reminderQuietEnd;
    if (start === end) return false;
    if (start < end) return hour >= start && hour < end;
    return hour >= start || hour < end;
  }

  function getTodayDate() {
    return getGMTDateString(getNow());
  }

  // ===== Storage =====
  function loadSettings() {
    try {
      const s = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (s) return { ...DEFAULT_SETTINGS, ...JSON.parse(s) };
    } catch (e) { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }

  function loadCategories() {
    try {
      const c = localStorage.getItem(STORAGE_KEY_CATEGORIES);
      if (c) return JSON.parse(c);
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }

  function saveCategories() {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
  }

  function loadRecords() {
    try {
      const r = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (r) return JSON.parse(r);
    } catch (e) { /* ignore */ }
    return {};
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
  }

  function getDayRecords(dateStr) {
    if (!records[dateStr]) records[dateStr] = {};
    return records[dateStr];
  }

  function getHourRecords(dateStr, hour) {
    const day = getDayRecords(dateStr);
    if (!day[hour]) day[hour] = {};
    return day[hour];
  }

  function getHourMeta(dateStr, hour) {
    const hourRecs = getHourRecords(dateStr, hour);
    if (!hourRecs._meta) hourRecs._meta = { note: '', noteTimestamp: null };
    return hourRecs._meta;
  }

  function getEntry(dateStr, hour, categoryId, subId) {
    const hourRecs = getHourRecords(dateStr, hour);
    const key = subId || '_main';
    if (!hourRecs[categoryId]) hourRecs[categoryId] = {};
    if (!hourRecs[categoryId][key]) hourRecs[categoryId][key] = { status: STATUS_EMPTY, timestamp: null };
    return hourRecs[categoryId][key];
  }

  // ===== Status Cycle =====
  function nextStatus(current) {
    if (current === STATUS_EMPTY) return STATUS_CHECKED;
    if (current === STATUS_CHECKED) return STATUS_CROSSED;
    return STATUS_EMPTY;
  }

  // ===== Column Width Helpers =====
  function getColumnKey(type, catId, subId = null) {
    if (type === 'category') return subId ? `${catId}_${subId}` : catId;
    return type; // 'hour' / 'note' / 'time' / 'del'
  }

  function getColumnWidth(key) {
    return settings.columnWidths && typeof settings.columnWidths[key] === 'number'
      ? settings.columnWidths[key]
      : settings.defaultColWidth;
  }

  function applyColumnWidth(el, key) {
    const w = getColumnWidth(key);
    el.style.width = `${w}px`;
    el.style.minWidth = `${w}px`;
    el.style.maxWidth = `${w}px`;
    el.dataset.colKey = key;
  }

  // ===== Make a header column resizable by drag =====
  function makeResizable(column, key) {
    column.style.position = 'relative';
    const resizer = document.createElement('div');
    resizer.className = 'column-resizer';
    resizer.title = '拖拽调整列宽';
    column.appendChild(resizer);

    let startX, startWidth, isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.pageX;
      startWidth = column.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResize);
      e.preventDefault();
      e.stopPropagation();
    });

    // Touch support for mobile
    resizer.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      isResizing = true;
      startX = e.touches[0].pageX;
      startWidth = column.offsetWidth;
      document.addEventListener('touchmove', touchResize, { passive: false });
      document.addEventListener('touchend', touchStop);
      e.preventDefault();
      e.stopPropagation();
    });

    function resize(e) {
      if (!isResizing) return;
      const width = Math.max(40, startWidth + (e.pageX - startX));
      column.style.width = `${width}px`;
      column.style.minWidth = `${width}px`;
      column.style.maxWidth = `${width}px`;
      document.querySelectorAll(`[data-col-key="${key}"]`).forEach(td => {
        if (td !== column) {
          td.style.width = `${width}px`;
          td.style.minWidth = `${width}px`;
          td.style.maxWidth = `${width}px`;
        }
      });
    }

    function touchResize(e) {
      if (!isResizing || e.touches.length !== 1) return;
      const width = Math.max(40, startWidth + (e.touches[0].pageX - startX));
      column.style.width = `${width}px`;
      column.style.minWidth = `${width}px`;
      column.style.maxWidth = `${width}px`;
      document.querySelectorAll(`[data-col-key="${key}"]`).forEach(td => {
        if (td !== column) {
          td.style.width = `${width}px`;
          td.style.minWidth = `${width}px`;
          td.style.maxWidth = `${width}px`;
        }
      });
      e.preventDefault();
    }

    function recalcTableWidth() {
      const tbl = document.getElementById('status-table');
      if (tbl) {
        const seen = new Set();
        let total = 0;
        document.querySelectorAll('[data-col-key]').forEach(el => {
          const k = el.dataset.colKey;
          if (!seen.has(k)) { seen.add(k); total += getColumnWidth(k); }
        });
        tbl.style.width = total + 'px';
        tbl.style.minWidth = total + 'px';
      }
    }

    function stopResize() {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const newWidth = column.offsetWidth;
      if (!settings.columnWidths) settings.columnWidths = {};
      settings.columnWidths[key] = newWidth;
      saveSettings();
      recalcTableWidth();
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResize);
    }

    function touchStop() {
      if (!isResizing) return;
      isResizing = false;
      const newWidth = column.offsetWidth;
      if (!settings.columnWidths) settings.columnWidths = {};
      settings.columnWidths[key] = newWidth;
      saveSettings();
      recalcTableWidth();
      document.removeEventListener('touchmove', touchResize);
      document.removeEventListener('touchend', touchStop);
    }
  }

  // ===== Pending Count =====
  function computePendingCount(date) {
    const day = records[date];
    let pending = 0;
    const now = getNow();
    const today = getGMTDateString(now);
    const currentHour = parseInt(getGMTHourString(now));

    for (let h = 0; h < HOURS; h++) {
      const hourStr = String(h).padStart(2, '0');
      let hasAnyStatus = false;
      if (day && day[hourStr]) {
        for (const catId in day[hourStr]) {
          if (catId === '_meta') continue;
          for (const key in day[hourStr][catId]) {
            const e = day[hourStr][catId][key];
            if (e && e.status !== STATUS_EMPTY) { hasAnyStatus = true; break; }
          }
          if (hasAnyStatus) break;
        }
      }
      if (!hasAnyStatus) {
        // Count only hours up to current (today only)
        if (date === today && h <= currentHour) pending++;
        else if (date !== today) pending++; // For historical dates, count all empty
      }
    }
    return pending;
  }

  function computeNextPendingHour(date) {
    const day = records[date];
    const now = getNow();
    const today = getGMTDateString(now);
    const currentHour = parseInt(getGMTHourString(now));
    let targetHour = (date === today) ? currentHour : 0;

    for (let h = targetHour; h < HOURS; h++) {
      const hourStr = String(h).padStart(2, '0');
      let hasAnyStatus = false;
      if (day && day[hourStr]) {
        for (const catId in day[hourStr]) {
          if (catId === '_meta') continue;
          for (const key in day[hourStr][catId]) {
            const e = day[hourStr][catId][key];
            if (e && e.status !== STATUS_EMPTY) { hasAnyStatus = true; break; }
          }
          if (hasAnyStatus) break;
        }
      }
      if (!hasAnyStatus) return hourStr;
    }
    return null;
  }

  // ===== Rendering =====
  function applyHighlightColor() {
    document.documentElement.style.setProperty('--highlight-color', settings.highlightColor);
  }

  function renderHeader() {
    const dateEl = document.getElementById('current-date');
    dateEl.textContent = '今日记录 (GMT)';
    const fullDate = getFullDateString(currentDate);
    document.getElementById('date-full').textContent = fullDate;
    document.title = `状态记录 · ${currentDate}`;
  }

  function renderPendingCount() {
    const pending = computePendingCount(currentDate);
    const el = document.getElementById('pending-count');
    if (el) {
      el.textContent = `待填写: ${pending} 小时`;
      if (pending > 0) {
        el.style.color = '#e53935';
        el.style.fontWeight = '600';
      } else {
        el.style.color = '#2e7d32';
        el.style.fontWeight = '600';
      }
    }
  }

  function renderReminderBanner() {
    const banner = document.getElementById('reminder-banner');
    if (!settings.reminderEnabled) {
      banner.classList.add('hidden');
      return;
    }
    const pending = computePendingCount(currentDate);
    const nextHour = computeNextPendingHour(currentDate);
    const now = getNow();
    const today = getGMTDateString(now);
    const currentHourInt = parseInt(getGMTHourString(now));

    if (currentDate === today && nextHour !== null) {
      const nextH = parseInt(nextHour);
      if (!isInQuietHours(currentHourInt)) {
        let msg = '';
        if (nextH === currentHourInt) {
          msg = `⚠ 当前小时 ${nextHour}:00 尚未填写，请及时记录`;
        } else if (nextH === currentHourInt + 1) {
          msg = `⏰ 下一小时 ${nextHour}:00 即将到来，请准备填写`;
        } else {
          msg = `📋 有 ${pending} 小时待填写，下一个: ${nextHour}:00`;
        }
        document.getElementById('reminder-text').textContent = msg;
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    } else {
      banner.classList.add('hidden');
    }
  }

  function renderTable() {
    const head = document.getElementById('table-head');
    const body = document.getElementById('table-body');
    head.innerHTML = '';
    body.innerHTML = '';

    const parents = Array.isArray(settings.parents)
      ? settings.parents.filter(p => p && p.name && p.name.trim())
      : [];
    const hasParents = parents.length > 0;

    // Resolve each category's effective parentId (orphans fall back to first parent)
    function effPid(c) {
      if (c.parentId && parents.some(p => p.id === c.parentId)) return c.parentId;
      return hasParents ? parents[0].id : null;
    }

    // Build ordered groups: each parent -> its categories (in storage order)
    const groups = [];
    if (hasParents) {
      parents.forEach(p => {
        const cats = categories.filter(c => effPid(c) === p.id);
        if (cats.length > 0) groups.push({ parent: p, cats });
      });
    } else {
      groups.push({ parent: null, cats: categories.slice() });
    }

    // Flatten ordered categories (matches header column order)
    const orderedCats = [];
    groups.forEach(g => g.cats.forEach(c => orderedCats.push(c)));

    const hasSubs = orderedCats.some(c => c.subStatuses && c.subStatuses.length > 0);

    function groupColCount(g) {
      let n = 0;
      g.cats.forEach(c => {
        const sc = c.subStatuses ? c.subStatuses.length : 0;
        n += sc > 0 ? sc : 1;
      });
      return n;
    }

    // Determine number of header rows: categories(1) + (parents?1:0) + (subs?1:0)
    let headerRows = 1 + (hasParents ? 1 : 0) + (hasSubs ? 1 : 0);

    // Collect the "bottom-most header row" columns (the concrete per-data columns) for resizer attachment
    const resizerTargets = []; // array of { thElement, colKey }

    // Row 1: hour + parents/categories + Note + time + delete
    const headerTr = document.createElement('tr');

    const thHour = document.createElement('th');
    thHour.className = 'hour-cell';
    thHour.rowSpan = headerRows;
    thHour.innerHTML = '时间 (GMT)<br><span class="header-date">' + currentDate + '</span>';
    applyColumnWidth(thHour, 'hour');
    headerTr.appendChild(thHour);
    resizerTargets.push({ th: thHour, key: 'hour' });

    if (hasParents) {
      groups.forEach((g, gi) => {
        const th = document.createElement('th');
        th.textContent = g.parent.name;
        th.colSpan = groupColCount(g);
        th.className = 'parent-header';
        if (g.parent.color) th.style.background = g.parent.color;
        if (gi > 0) th.classList.add('parent-divider');
        headerTr.appendChild(th);
      });
    } else {
      orderedCats.forEach(cat => {
        const subCount = cat.subStatuses ? cat.subStatuses.length : 0;
        const th = document.createElement('th');
        th.textContent = cat.name;
        th.dataset.categoryId = cat.id;
        if (subCount > 0) th.colSpan = subCount;
        if (cat.color) th.style.background = cat.color;
        headerTr.appendChild(th);
      });
    }

    const thNote = document.createElement('th');
    thNote.className = 'note-cell';
    thNote.textContent = 'Note';
    thNote.rowSpan = headerRows;
    applyColumnWidth(thNote, 'note');
    headerTr.appendChild(thNote);
    resizerTargets.push({ th: thNote, key: 'note' });

    const thTime = document.createElement('th');
    thTime.className = 'time-cell';
    thTime.textContent = '填入时间';
    thTime.rowSpan = headerRows;
    applyColumnWidth(thTime, 'time');
    headerTr.appendChild(thTime);
    resizerTargets.push({ th: thTime, key: 'time' });

    const thDel = document.createElement('th');
    thDel.className = 'del-cell';
    thDel.textContent = '操作';
    thDel.rowSpan = headerRows;
    applyColumnWidth(thDel, 'del');
    headerTr.appendChild(thDel);
    resizerTargets.push({ th: thDel, key: 'del' });

    head.appendChild(headerTr);

    // Categories row (only when parents exist)
    let catHeaderRow = null;
    if (hasParents) {
      catHeaderRow = document.createElement('tr');
      orderedCats.forEach((cat, i) => {
        const subCount = cat.subStatuses ? cat.subStatuses.length : 0;
        const th = document.createElement('th');
        th.textContent = cat.name;
        th.dataset.categoryId = cat.id;
        if (subCount > 0) th.colSpan = subCount;
        // Divider only when crossing to a different parent group
        const prevCat = i > 0 ? orderedCats[i - 1] : null;
        if (i > 0 && effPid(cat) !== effPid(prevCat)) th.classList.add('parent-divider');
        catHeaderRow.appendChild(th);
      });
      head.appendChild(catHeaderRow);
    }

    // Sub-status row (only when has subs) -- this is the bottom row, so attach resizers here for sub-cols
    let subHeaderRow = null;
    if (hasSubs) {
      subHeaderRow = document.createElement('tr');
      orderedCats.forEach((cat, i) => {
        if (cat.subStatuses && cat.subStatuses.length > 0) {
          cat.subStatuses.forEach((sub, subi) => {
            const th = document.createElement('th');
            th.className = 'sub-col';
            th.textContent = sub.name;
            th.dataset.categoryId = cat.id;
            th.dataset.subId = sub.id;
            const colKey = getColumnKey('category', cat.id, sub.id);
            applyColumnWidth(th, colKey);
            // Divider only on first sub cell AND only when crossing parent groups
            if (subi === 0) {
              const prevCat = i > 0 ? orderedCats[i - 1] : null;
              if (i > 0 && effPid(cat) !== effPid(prevCat)) th.classList.add('parent-divider');
            }
            subHeaderRow.appendChild(th);
            resizerTargets.push({ th, key: colKey });
          });
        } else {
          const th = document.createElement('th');
          th.style.visibility = 'hidden';
          const colKey = getColumnKey('category', cat.id);
          applyColumnWidth(th, colKey);
          const prevCat = i > 0 ? orderedCats[i - 1] : null;
          if (i > 0 && effPid(cat) !== effPid(prevCat)) th.classList.add('parent-divider');
          subHeaderRow.appendChild(th);
          resizerTargets.push({ th, key: colKey });
        }
      });
      head.appendChild(subHeaderRow);
    } else {
      // No subs: attach resizers to category row (or parent row) bottom header
      // Attach to headerTr's category columns (if no parents) or catHeaderRow (if has parents)
      const targetRowForCatCols = hasParents ? catHeaderRow : headerTr;
      let colIdx = 0; // index within category columns (skip hour column at 0)
      const catColsInTargetRow = Array.from(targetRowForCatCols.children).filter(el => {
        // only columns between hour (first) and note are category columns
        return true;
      });
      // The category columns in target row are those that are NOT hour/note/time/del
      // In headerTr: 0=hour, then cat cols, then note, time, del
      // In catHeaderRow: all are cat cols
      orderedCats.forEach((cat, i) => {
        // Find the TH for this category in the target row
        // This is tricky; easier: iterate orderedCats, and just use the resizer on the last-row-of-header for this cat column
        // Since no subs, each cat = 1 column
        // We'll create a synthetic "attach here" using the category row header (catHeaderRow if hasParents, else headerTr th for that cat)
        // But since we can't easily index, collect during iteration
      });
      // Simpler: do it during a second pass below
    }

    // ===== Second pass: attach resizer targets for category columns when no subs =====
    if (!hasSubs) {
      const targetHeaderRowEls = hasParents
        ? Array.from(catHeaderRow.children) // category row THs
        : Array.from(headerTr.children).filter(c => c !== thHour && c !== thNote && c !== thTime && c !== thDel); // cat cols in first row
      orderedCats.forEach((cat, i) => {
        const colKey = getColumnKey('category', cat.id);
        const theCol = targetHeaderRowEls[i];
        if (theCol) {
          applyColumnWidth(theCol, colKey);
          resizerTargets.push({ th: theCol, key: colKey });
        }
      });
    }

    const now = getNow();
    const today = getGMTDateString(now);
    const currentHour = getGMTHourString(now);

    for (let h = 0; h < HOURS; h++) {
      const hourStr = String(h).padStart(2, '0');
      const tr = document.createElement('tr');

      if (currentDate === today && hourStr === currentHour) {
        tr.className = 'current-hour';
      }

      const tdHour = document.createElement('td');
      tdHour.className = 'hour-cell';
      tdHour.textContent = `${hourStr}:00`;
      applyColumnWidth(tdHour, 'hour');
      tr.appendChild(tdHour);

      orderedCats.forEach((cat, ci) => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [null];
        const isNewParentGroup = hasParents && ci > 0 && effPid(cat) !== effPid(orderedCats[ci - 1]);
        subs.forEach((sub, subi) => {
          const td = document.createElement('td');
          td.className = 'status-cell';
          td.dataset.hour = hourStr;
          td.dataset.categoryId = cat.id;
          td.dataset.subId = sub ? sub.id : '_main';

          const colKey = getColumnKey('category', cat.id, sub ? sub.id : null);
          applyColumnWidth(td, colKey);

          // Apply category color as background tint
          if (cat.color) td.style.background = cat.color;

          // Parent group divider only on the FIRST cell of a new parent group
          if (isNewParentGroup && subi === 0) {
            td.classList.add('parent-divider');
          }

          renderStatusCell(td, currentDate, hourStr, cat.id, sub ? sub.id : null);
          td.addEventListener('click', () => handleCellClick(td, currentDate, hourStr, cat.id, sub ? sub.id : null));
          tr.appendChild(td);
        });
      });

      const tdNote = document.createElement('td');
      tdNote.className = 'note-cell';
      applyColumnWidth(tdNote, 'note');
      renderNoteCell(tdNote, currentDate, hourStr);
      tr.appendChild(tdNote);

      const tdTime = document.createElement('td');
      tdTime.className = 'time-cell';
      applyColumnWidth(tdTime, 'time');
      renderTimeCell(tdTime, currentDate, hourStr);
      tr.appendChild(tdTime);

      const tdDel = document.createElement('td');
      tdDel.className = 'del-cell';
      applyColumnWidth(tdDel, 'del');
      const delBtn = document.createElement('button');
      delBtn.className = 'del-hour-btn';
      delBtn.textContent = '🗑';
      delBtn.title = '删除 ' + hourStr + ':00 的记录';
      delBtn.addEventListener('click', () => deleteHour(currentDate, hourStr));
      tdDel.appendChild(delBtn);
      tr.appendChild(tdDel);

      body.appendChild(tr);
    }

    // ===== Compute total table width from all column keys and set it explicitly =====
    // (required for table-layout: fixed to honor per-column pixel widths instead of expanding)
    const tableEl = document.getElementById('status-table') || document.querySelector('.status-table');
    if (tableEl) {
      const allColKeys = new Set();
      document.querySelectorAll('[data-col-key]').forEach(el => allColKeys.add(el.dataset.colKey));
      let totalWidth = 0;
      allColKeys.forEach(k => { totalWidth += getColumnWidth(k); });
      tableEl.style.width = totalWidth + 'px';
      tableEl.style.minWidth = totalWidth + 'px';
    }

    // ===== Attach drag resizers to each target column header =====
    resizerTargets.forEach(item => {
      makeResizable(item.th, item.key);
    });
  }

  function renderStatusCell(td, date, hour, categoryId, subId) {
    const entry = getEntry(date, hour, categoryId, subId);
    const outOfRange = settings.outOfRangeHighlight && entry.timestamp
      ? isOutOfRange(date, hour, entry.timestamp)
      : false;

    td.classList.remove('status-checked', 'status-crossed', 'out-of-range');

    if (entry.status === STATUS_CHECKED) {
      td.textContent = STATUS_CHECKED;
      td.classList.add('status-checked');
    } else if (entry.status === STATUS_CROSSED) {
      td.textContent = STATUS_CROSSED;
      td.classList.add('status-crossed');
    } else {
      td.textContent = '';
    }

    if (outOfRange && (entry.status !== STATUS_EMPTY)) {
      td.classList.add('out-of-range');
      td.title = '超时填入 (GMT): ' + getTimestampString(entry.timestamp);
    } else if (entry.timestamp) {
      td.title = '填入时间 (GMT): ' + getTimestampString(entry.timestamp);
    }
  }

  function renderNoteCell(tdNote, date, hour) {
    const meta = getHourMeta(date, hour);
    tdNote.innerHTML = '';
    const textarea = document.createElement('textarea');
    textarea.className = 'note-input';
    textarea.placeholder = 'Note...';
    textarea.value = meta.note || '';
    textarea.dataset.hour = hour;
    textarea.addEventListener('input', (e) => {
      const h = e.target.dataset.hour;
      saveNote(date, h, e.target.value);
      updateNoteHighlight(tdNote, date, h);
    });
    tdNote.appendChild(textarea);

    updateNoteHighlight(tdNote, date, hour);
  }

  function updateNoteHighlight(tdNote, date, hour) {
    const meta = getHourMeta(date, hour);
    const ta = tdNote.querySelector('.note-input');
    if (!ta) return;
    if (settings.outOfRangeHighlight && meta.noteTimestamp) {
      const isOOR = isOutOfRange(date, hour, meta.noteTimestamp);
      if (isOOR) {
        ta.classList.add('out-of-range');
      } else {
        ta.classList.remove('out-of-range');
      }
    } else {
      ta.classList.remove('out-of-range');
    }
  }

  function renderTimeCell(tdTime, date, hour) {
    const day = records[date];
    let latest = null;
    let any = false;

    if (day && day[hour]) {
      for (const catId in day[hour]) {
        if (catId === '_meta') continue;
        for (const key in day[hour][catId]) {
          const e = day[hour][catId][key];
          if (e && e.timestamp && e.status !== STATUS_EMPTY) {
            any = true;
            if (latest === null || e.timestamp > latest) latest = e.timestamp;
          }
        }
      }
      const meta = day[hour]._meta;
      if (meta && meta.noteTimestamp && meta.note) {
        any = true;
        if (latest === null || meta.noteTimestamp > latest) latest = meta.noteTimestamp;
      }
    }

    tdTime.classList.remove('out-of-range');
    if (any && latest !== null) {
      tdTime.textContent = getTimestampString(latest);
      if (settings.outOfRangeHighlight && isOutOfRange(date, hour, latest)) {
        tdTime.classList.add('out-of-range');
      }
    } else {
      tdTime.textContent = '';
    }
  }

  // ===== Interactions =====
  function handleCellClick(td, date, hour, categoryId, subId) {
    const entry = getEntry(date, hour, categoryId, subId);
    const newStatus = nextStatus(entry.status);
    entry.status = newStatus;
    entry.timestamp = newStatus === STATUS_EMPTY ? null : getNow().getTime();

    saveRecords();
    renderStatusCell(td, date, hour, categoryId, subId);

    const timeCell = td.closest('tr').querySelector('.time-cell');
    if (timeCell) renderTimeCell(timeCell, date, hour);

    const noteCell = td.closest('tr').querySelector('.note-cell');
    if (noteCell) updateNoteHighlight(noteCell, date, hour);

    renderPendingCount();
    renderReminderBanner();
  }

  function saveNote(date, hour, value) {
    const meta = getHourMeta(date, hour);
    meta.note = value;
    meta.noteTimestamp = getNow().getTime();
    saveRecords();
  }

  // ===== One-Click Record =====
  function oneClickCurrentHour() {
    const now = new Date();
    const hourStr = getGMTHourString(now);
    const date = getTodayDate();
    const preset = getPresetTargets();
    const status = preset.status || STATUS_CHECKED;
    const targets = preset.targets;
    const parentTargets = preset.parentTargets;
    const count = fillRange(date, hourStr, hourStr, status, targets, parentTargets);
    if (count > 0) {
      showSnackbar(`已打卡 ${hourStr}:00 (${count} 项)`);
    } else {
      showSnackbar('未填入任何项，请在设置中勾选填入对象');
    }
    renderAll();
  }

  function getPresetTargets() {
    const preset = settings.oneClickPreset || { status: STATUS_CHECKED, targets: null };
    return preset;
  }

  // Resolve a category's effective parent id (orphans fall back to first parent)
  function effParentId(cat) {
    const parents = Array.isArray(settings.parents) ? settings.parents : [];
    if (cat.parentId && parents.some(p => p.id === cat.parentId)) return cat.parentId;
    return parents.length > 0 ? parents[0].id : null;
  }

  function fillRange(date, startHour, endHour, status, targets, parentTargets) {
    const start = parseInt(startHour);
    const end = parseInt(endHour);
    const now = getNow().getTime();
    const skip = status === 'skip';
    const targetStatus = status === 'skip' ? STATUS_CHECKED : status;
    let filledCount = 0;

    for (let h = start; h <= end; h++) {
      const hourStr = String(h).padStart(2, '0');
      categories.forEach(cat => {
        // Skip entire category if its parent is disabled in preset
        const pid = effParentId(cat);
        if (parentTargets && pid && parentTargets[pid] === false) return;

        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [null];
        subs.forEach(sub => {
          const subKey = sub ? sub.id : '_main';
          // Check if this target is enabled in preset
          if (targets && targets[cat.id] && targets[cat.id][subKey] === false) return;

          const entry = getEntry(date, hourStr, cat.id, sub ? sub.id : null);
          if (skip && entry.status !== STATUS_EMPTY) return;
          entry.status = targetStatus;
          entry.timestamp = now;
          filledCount++;
        });
      });
    }
    saveRecords();
    return filledCount;
  }

  // ===== PDF Export =====
  async function exportPDF() {
    const date = currentDate;
    const data = collectDayData(date);

    const win = window.open('', '_blank');
    if (!win) { showSnackbar('请允许弹窗以导出 PDF'); return; }

    const html = generatePDFHTML(date, data);
    win.document.write(html);
    win.document.close();
    win.onload = function () {
      setTimeout(() => { win.print(); }, 500);
    };
  }

  function collectDayData(date) {
    const day = records[date] || {};
    const hours = [];
    for (let h = 0; h < HOURS; h++) {
      const hourStr = String(h).padStart(2, '0');
      const hourData = day[hourStr] || {};
      const meta = hourData._meta || { note: '', noteTimestamp: null };

      const row = {
        hour: hourStr,
        entries: {},
        note: meta.note || '',
        noteTimestamp: meta.noteTimestamp,
      };

      categories.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [null];
        row.entries[cat.id] = {};
        subs.forEach(sub => {
          const key = sub ? sub.id : '_main';
          const ed = hourData[cat.id] ? hourData[cat.id][key] : null;
          row.entries[cat.id][key] = {
            name: sub ? sub.name : cat.name,
            status: ed ? ed.status : STATUS_EMPTY,
            timestamp: ed ? ed.timestamp : null,
          };
        });
      });
      hours.push(row);
    }
    return hours;
  }

  function generatePDFHTML(date, hours) {
    const title = settings.pdfTitle || '状态巡检记录';
    const dateObj = new Date(date + 'T00:00:00Z');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dateLabel = `${date} ${weekdays[dateObj.getUTCDay()]}`;

    let catHeaders = '';
    categories.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
      catHeaders += `<th colspan="${subs.length}" style="border:1px solid #333;padding:6px 4px;background:#e8f0fe;font-weight:bold;font-size:11px;">${cat.name}</th>`;
    });

    let subHeaders = '';
    categories.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: '' }];
      subs.forEach(sub => {
        subHeaders += `<th style="border:1px solid #333;padding:4px;font-size:10px;background:#f5f5f5;">${sub.name || '●'}</th>`;
      });
    });

    let rowsHTML = '';
    hours.forEach(row => {
      let statusCells = '';
      categories.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
        subs.forEach(sub => {
          const key = sub.id;
          const ed = row.entries[cat.id] ? row.entries[cat.id][key] : null;
          const status = ed ? ed.status : '';
          statusCells += `<td style="border:1px solid #333;padding:4px 2px;text-align:center;font-size:12px;color:${status === '✓' ? '#2e7d32' : status === '✗' ? '#c62828' : '#ccc'};">${status || ''}</td>`;
        });
      });

      const timeStr = getLatestTimeString(row);
      const note = row.note || '';
      const rowClass = parseInt(row.hour) % 2 === 0 ? 'background:#fafafa;' : '';

      rowsHTML += `<tr style="${rowClass}">
        <td style="border:1px solid #333;padding:4px 6px;font-weight:bold;font-size:11px;">${row.hour}:00</td>
        ${statusCells}
        <td style="border:1px solid #333;padding:4px;font-size:11px;max-width:120px;word-break:break-word;">${note}</td>
        <td style="border:1px solid #333;padding:4px;font-size:10px;color:#666;text-align:right;">${timeStr}</td>
      </tr>`;
    });

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title} - ${date}</title>
<style>
  body { font-family: -apple-system, "Microsoft YaHei", sans-serif; padding: 20px; color: #333; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #333; }
  .footer { margin-top: 20px; font-size: 11px; color: #888; text-align: right; }
  @media print {
    body { padding: 10mm; }
    button { display: none; }
  }
</style></head>
<body>
  <h1>${title}</h1>
  <div class="subtitle">日期: ${dateLabel} (GMT) · 生成时间: ${getGMTTimeString(getNow())} GMT</div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="border:1px solid #333;padding:6px;background:#e8f0fe;">时间</th>
        ${catHeaders}
        <th rowspan="2" style="border:1px solid #333;padding:6px;background:#e8f0fe;">Note</th>
        <th rowspan="2" style="border:1px solid #333;padding:6px;background:#e8f0fe;">填入时间</th>
      </tr>
      <tr>${subHeaders}</tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="footer">状态记录系统 · 共 ${hours.length} 小时记录</div>
  <script>window.onload = function() { setTimeout(function(){ window.print(); }, 300); }<\/script>
</body></html>`;
  }

  function getLatestTimeString(row) {
    let latest = null;
    categories.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
      subs.forEach(sub => {
        const key = sub.id;
        const ed = row.entries[cat.id] ? row.entries[cat.id][key] : null;
        if (ed && ed.timestamp) {
          if (latest === null || ed.timestamp > latest) latest = ed.timestamp;
        }
      });
    });
    if (row.noteTimestamp) {
      if (latest === null || row.noteTimestamp > latest) latest = row.noteTimestamp;
    }
    return latest ? getTimestampString(latest) : '';
  }

  // ===== Action Dialog =====
  function showDialog(title, message, onConfirm) {
    const dialog = document.getElementById('action-dialog');
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-message').textContent = message;
    dialog.classList.remove('hidden');

    const confirmBtn = document.getElementById('dialog-confirm');
    const cancelBtn = document.getElementById('dialog-cancel');

    const close = () => {
      dialog.classList.add('hidden');
      confirmBtn.removeEventListener('click', confirmHandler);
      cancelBtn.removeEventListener('click', cancelHandler);
    };

    const confirmHandler = () => { close(); if (onConfirm) onConfirm(); };
    const cancelHandler = close;

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
  }

  function showSnackbar(message) {
    const existing = document.querySelector('.snackbar');
    if (existing) existing.remove();
    const sb = document.createElement('div');
    sb.className = 'snackbar';
    sb.textContent = message;
    document.body.appendChild(sb);
    setTimeout(() => sb.remove(), 2800);
  }

  // ===== Delete Single Hour =====
  function deleteHour(date, hour) {
    showDialog('删除时段', `确定删除 ${date} ${hour}:00 的记录？`, () => {
      const day = getDayRecords(date);
      if (day[hour]) {
        delete day[hour];
        saveRecords();
      }
      renderAll();
      showSnackbar(`${hour}:00 记录已删除`);
    });
  }

  // ===== Render All =====
  function renderAll() {
    applyHighlightColor();
    renderHeader();
    renderTable();
    renderPendingCount();
    renderReminderBanner();
  }

  // ===== GMT Clock =====
  function updateClock() {
    const now = getNow();
    const el = document.getElementById('gmt-clock');
    if (el) el.textContent = getGMTTimeString(now) + ' GMT';
  }

  // ===== Reminder System =====
  function setupReminderSystem() {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    setInterval(() => {
      updateClock();
      renderReminderBanner();
      renderPendingCount();

      // Check if we should show browser notification
      const now = getNow();
      const today = getGMTDateString(now);
      const currentHour = parseInt(getGMTHourString(now));

      if (settings.reminderEnabled && currentDate === today && !isInQuietHours(currentHour)) {
        const nextHour = computeNextPendingHour(today);
        if (nextHour && parseInt(nextHour) <= currentHour) {
          if ('Notification' in window && Notification.permission === 'granted') {
            const recentlyNotified = sessionStorage.getItem('last_notification_' + today + '_' + nextHour);
            if (!recentlyNotified) {
              try {
                new Notification('状态记录提醒', {
                  body: `时段 ${nextHour}:00 尚未填写，请及时记录`,
                  tag: 'status-reminder-' + today + '-' + nextHour,
                });
                sessionStorage.setItem('last_notification_' + today + '_' + nextHour, '1');
              } catch (e) { /* ignore */ }
            }
          }
        }
      }

      // Auto refresh the current hour highlight every minute
      if (now.getUTCSeconds() < 2) {
        renderTable();
      }
    }, 5000);
  }

  // ===== Init =====
  function init() {
    // Always use today's date
    currentDate = getTodayDate();

    applyHighlightColor();
    document.getElementById('legend-dot').style.background = settings.highlightColor;

    // Set one-click button label from settings
    const oneClickLabel = document.getElementById('one-click-label');
    if (oneClickLabel) {
      oneClickLabel.textContent = settings.oneClickName || '一键打卡';
    }

    // Date is always today in GMT mode
    document.getElementById('current-date').addEventListener('click', () => {
      currentDate = getTodayDate();
      renderAll();
    });

    // Buttons
    document.getElementById('btn-one-click').addEventListener('click', oneClickCurrentHour);
    document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
    document.getElementById('btn-settings').addEventListener('click', () => {
      window.location.href = 'settings.html';
    });
    document.getElementById('btn-history').addEventListener('click', () => {
      window.location.href = 'history.html';
    });

    // Reminder banner close
    document.getElementById('reminder-close').addEventListener('click', () => {
      document.getElementById('reminder-banner').classList.add('hidden');
    });

    // Render
    renderAll();

    // Start clock
    updateClock();

    // Setup reminder system (auto-refreshes every 5s)
    setupReminderSystem();

    // Refresh every 30s
    setInterval(() => { renderAll(); }, 30000);

    // Auto-refresh when returning from settings/history (page shown again)
    window.addEventListener('pageshow', () => {
      settings = loadSettings();
      categories = loadCategories();
      records = loadRecords();
      currentDate = getGMTDateString(getNow());
      renderAll();
    });
  }

  // DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose
  window.StatusApp = {
    refresh: function () {
      settings = loadSettings();
      categories = loadCategories();
      records = loadRecords();
      currentDate = getGMTDateString(getNow());
      renderAll();
    }
  };
})();
