/* ===== Status Recorder App ===== */
(function () {
  'use strict';

  // ===== Defaults & Constants =====
  const HOURS = 24;
  const STORAGE_KEY_RECORDS = 'status_records_v1';
  const STORAGE_KEY_SETTINGS = 'status_settings_v1';
  const STORAGE_KEY_CATEGORIES = 'status_categories_v1';
  const STORAGE_KEY_ADMIN_MODE = 'status_admin_mode_v1'; // 管理者模式开关（独立于settings，方便settings.js/history.js也读）
  const DEFAULT_TIME_RANGE_MINUTES_LOCKED = 15; // 关闭管理者模式时，时间容差固定为此值（用户要求默认15）

  const DEFAULT_CATEGORIES = [
    // ===== SCC Patrol Record 默认配置 =====
    // 检查内容1: TMs Fresh — 平台及设备: Open SCC, DFH-4, DFH-4E, DFH3B
    //   Open SCC: 7, M&C
    //   DFH-4:   9, 6C, DPM, IC, MCS, SCC
    //   DFH-4E:  6D, DPM, IC, MCS
    //   DFH3B:   6E
    // 检查内容2: Unrecoverd Alarm ? If so,please specify — 平台及设备: Open SCC, DFH-4, DFH-4E, DFH3B
    //   Open SCC:  7, M&C
    //   DFH-4:    9, 6C, DPM, IC, MCS, SCC
    //   DFH-4E:   6D, DPM, IC, MCS
    //   DFH3B:    6E
    { id: 'cat_tms_ossc',   name: 'Open SCC',   parentId: 'p_tmf', subStatuses: [
      { id: 's_7',   name: '7' },   { id: 's_mc',  name: 'M&C' },
    ]},
    { id: 'cat_tms_dfh4',   name: 'DFH-4', parentId: 'p_tmf', subStatuses: [
      { id: 's_9',   name: '9' },   { id: 's_6c',  name: '6C' },
      { id: 's_dpm', name: 'DPM' },  { id: 's_ic',  name: 'IC' },
      { id: 's_mcs', name: 'MCS' },  { id: 's_scc', name: 'SCC' },
    ]},
    { id: 'cat_tms_dfh4e',  name: 'DFH-4E', parentId: 'p_tmf', subStatuses: [
      { id: 's_6d',  name: '6D' },   { id: 's_dpm', name: 'DPM' },
      { id: 's_ic',  name: 'IC' },   { id: 's_mcs', name: 'MCS' },
      { id: 's_scc', name: 'SCC' },
    ]},
    { id: 'cat_tms_dfh3b',  name: 'DFH3B', parentId: 'p_tmf', subStatuses: [
      { id: 's_6e',  name: '6E' },
    ]},
    { id: 'cat_ua_ossc',    name: 'Open SCC',   parentId: 'p_ua', subStatuses: [
      { id: 's_7',   name: '7' },   { id: 's_mc',  name: 'M&C' },
    ]},
    { id: 'cat_ua_dfh4',    name: 'DFH-4', parentId: 'p_ua', subStatuses: [
      { id: 's_9',   name: '9' },   { id: 's_6c',  name: '6C' },
      { id: 's_dpm', name: 'DPM' },  { id: 's_ic',  name: 'IC' },
      { id: 's_mcs', name: 'MCS' },  { id: 's_scc', name: 'SCC' },
    ]},
    { id: 'cat_ua_dfh4e',   name: 'DFH-4E', parentId: 'p_ua', subStatuses: [
      { id: 's_6d',  name: '6D' },   { id: 's_dpm', name: 'DPM' },
      { id: 's_ic',  name: 'IC' },   { id: 's_mcs', name: 'MCS' },
      { id: 's_scc', name: 'SCC' },
    ]},
    { id: 'cat_ua_dfh3b',   name: 'DFH3B', parentId: 'p_ua', subStatuses: [
      { id: 's_6e',  name: '6E' },
    ]},
  ];

  const DEFAULT_SETTINGS = {
    highlightColor: '#ffeb3b',
    timeRangeMinutes: 15, // 普通用户固定15分钟；管理者可改
    outOfRangeHighlight: true,
    reminderEnabled: true,
    reminderQuietStart: 0,
    reminderQuietEnd: 6,
    reminderLeadMinutes: 5,
    pdfTitle: 'SCC Patrol Record',
    parents: [
      { id: 'p_tmf', name: 'TMs Fresh' },
      { id: 'p_ua',  name: 'Unrecoverd Alarm ? If so,please specify' },
    ],
    oneClickName: '一键打卡',
    oneClickPreset: {
      status: '✓',
      targets: null,
      parentTargets: null,
    },
    columnWidths: {
      // TMs Fresh
      'cat_tms_ossc_s_7': 50,   'cat_tms_ossc_s_mc': 55,
      'cat_tms_dfh4_s_9':  45,  'cat_tms_dfh4_s_6c': 50,
      'cat_tms_dfh4_s_dpm': 50, 'cat_tms_dfh4_s_ic': 45,
      'cat_tms_dfh4_s_mcs': 50, 'cat_tms_dfh4_s_scc': 45,
      'cat_tms_dfh4e_s_6d': 50, 'cat_tms_dfh4e_s_dpm': 50,
      'cat_tms_dfh4e_s_ic': 45, 'cat_tms_dfh4e_s_mcs': 50,
      'cat_tms_dfh4e_s_scc': 45,
      'cat_tms_dfh3b_s_6e': 50,
      // Unrecoverd Alarm ? If so,please specify
      'cat_ua_ossc_s_7':   50,  'cat_ua_ossc_s_mc': 55,
      'cat_ua_dfh4_s_9':   45,  'cat_ua_dfh4_s_6c': 50,
      'cat_ua_dfh4_s_dpm': 50,  'cat_ua_dfh4_s_ic': 45,
      'cat_ua_dfh4_s_mcs': 50,  'cat_ua_dfh4_s_scc': 45,
      'cat_ua_dfh4e_s_6d': 50,  'cat_ua_dfh4e_s_dpm': 50,
      'cat_ua_dfh4e_s_ic': 45,  'cat_ua_dfh4e_s_mcs': 50,
      'cat_ua_dfh4e_s_scc': 45,
      'cat_ua_dfh3b_s_6e': 50,
      // Fixed columns
      'hour': 75, 'note': 120, 'time': 80, 'del': 32,
    },
    defaultColWidth: 60,
    pdfExportDays: 7,
    fontSize: 'medium',
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
    // 用户："整点后时间容差内为正常，不在时间容差范围内需高亮"
    // 例：容差15，8时段内 8:15 后打卡均需高亮。
    // 解释：记录的填入时间 ts 若不在 [recordHourStart, recordHourStart + tolerance] 就算容差外。
    //  - ts < recordHourStart：提前填入（按规则"未到时间不可填入"，算容差外 / 异常）
    //  - ts > recordHourStart + tolerance：超过容差窗口 → 高亮
    const ts = new Date(timestamp).getTime();
    return ts < recordHourStart || ts > recordHourStart + tolerance;
  }

  // ===== Editability windows based on time tolerance =====
  // Returns one of: 'future' (hour not yet reached), 'editable' (within tolerance),
  //                 'grace-fill' (past tolerance but still allow filling blanks with highlight),
  //                 'locked' (cannot modify at all)
  //
  // Rules per user request:
  //   - 没到时间的那栏：不可填入 (future → blocked)
  //   - 容差范围内：可修改 (editable → normal)
  //     新容差定义：整点起 + N 分钟 为正常（例：容差15, 8时段 → 8:00 - 8:15 正常；8:15 以后算容差外）
  //   - 过了时间容差：可填入但须高亮 (grace-fill → highlighted, and edit=overwrite existing is LOCKED)
  function getHourAccessState(dateStr, hourStr, refNowMs) {
    const now = refNowMs || getNow().getTime();
    const toleranceMs = settings.timeRangeMinutes * 60 * 1000;
    const y = parseInt(dateStr.slice(0, 4));
    const mo = parseInt(dateStr.slice(5, 7)) - 1;
    const d = parseInt(dateStr.slice(8, 10));
    const h = parseInt(hourStr, 10);
    const hourStart = new Date(Date.UTC(y, mo, d, h, 0, 0, 0)).getTime();
    // 新正常窗口：整点起 [hourStart, hourStart + tolerance]（容差只给整点之后的N分钟，不再是前后容差）
    const toleranceWinEnd = hourStart + toleranceMs;

    if (now < hourStart) return 'future';       // 没到时间：不可填入
    if (now <= toleranceWinEnd) return 'editable';  // 整点后容差内：可修改
    // 超出容差窗口：按照你说的"过了时间容差的可填入，但须高亮显示"
    // "可填入"在这里的解释：之前是空的可以填；已有的不能再修改 (避免随意篡改历史)
    return 'grace-fill';
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
  // scheduleIdle 兼容垫片：优先 requestIdleCallback（iOS 16+ 支持），其次 rAF + 延时
  function _scheduleIdle(fn, timeoutMs) {
    const maxWait = timeoutMs || 250;
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      try { return window.requestIdleCallback(fn, { timeout: maxWait }); } catch (e) {}
    }
    // 回退：在下一帧之后再执行，避免阻塞当前交互（移动端交互-渲染关键路径）
    return setTimeout(() => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => { try { fn(); } catch (e) {} });
      } else {
        try { fn(); } catch (e) {}
      }
    }, 0);
  }

  // 通用的 debounce：用于 input / 保存 / 定时器 等高频触发场景
  function _debounce(fn, waitMs) {
    let t = null;
    return function debounced(...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; fn.apply(this, args); }, waitMs);
    };
  }

  function loadSettings() {
    try {
      const s = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (s) return { ...DEFAULT_SETTINGS, ...JSON.parse(s) };
    } catch (e) { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  }

  // saveSettings 去抖 + 空闲时再序列化+写入，避免拖拽/打字时的主线程 IO 阻塞
  let _saveSettingsPending = null;
  function _flushSaveSettings() {
    try { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings)); } catch (e) {}
    _saveSettingsPending = null;
  }
  function saveSettings() {
    if (_saveSettingsPending) return; // 已经有一次挂起就合并（避免堆积）
    _saveSettingsPending = _scheduleIdle(_flushSaveSettings, 350);
  }
  // 保存 settings 的同步版本（用于离开页面/打印/导出这种必须立即写盘的场景）
  function saveSettingsSync() {
    if (_saveSettingsPending) { try { clearTimeout(_saveSettingsPending); } catch (e) {} _saveSettingsPending = null; }
    try { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings)); } catch (e) {}
  }

  function loadCategories() {
    try {
      const c = localStorage.getItem(STORAGE_KEY_CATEGORIES);
      if (c) return JSON.parse(c);
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }

  function saveCategories() {
    // categories 改动频率低，直接 idle 写
    _scheduleIdle(() => {
      try { localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories)); } catch (e) {}
    }, 400);
  }

  function loadRecords() {
    try {
      const r = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (r) return JSON.parse(r);
    } catch (e) { /* ignore */ }
    return {};
  }

  // saveRecords 走 debounce(150ms) + 空闲时写盘
  // 150ms 对「连续打勾/打字」足够合并为一次写入，又不会让用户感知到"不保存"
  const _debouncedFlushRecords = _debounce(() => {
    _scheduleIdle(() => {
      try { localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records)); } catch (e) {}
    }, 250);
  }, 150);
  function saveRecords() {
    _debouncedFlushRecords();
  }
  // 同步写盘（pageshow/pagehide/export/print 等关键时机调用）
  function saveRecordsSync() {
    try { localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records)); } catch (e) {}
  }
  // 离开页面前保证写盘一次（移动端切到后台/杀进程前 iOS Safari 可能不执行，但多一层保障）
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => { try { saveRecordsSync(); saveSettingsSync(); } catch (e) {} }, { passive: true });
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { try { saveRecordsSync(); saveSettingsSync(); } catch (e) {} }
    }, { passive: true });
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
  // 移动端性能优化：
  //   1) 列宽写入 + querySelectorAll 循环都塞到下一帧 requestAnimationFrame 执行
  //   2) 移动端 touchstart 不调用 preventDefault 防止触发 Safari 300ms 点击延迟合成器阻塞
  //   3) touchmove 用被动监听无法 preventDefault，但拖拽手柄本身已加 touch-action:none，Safari 合成器不会吞事件
  function makeResizable(column, key) {
    column.style.position = 'relative';
    const resizer = document.createElement('div');
    resizer.className = 'column-resizer';
    resizer.title = '拖拽调整列宽';
    column.appendChild(resizer);

    let startX = 0, startWidth = 0, isResizing = false;
    let rafPending = false, pendingWidth = 0;
    const allTargets = () => Array.from(document.querySelectorAll(`[data-col-key="${CSS.escape(key)}"]`));

    // 统一的「写入宽度到 DOM」函数（合并 rAF，避免 60Hz 内多次 layout）
    function applyWidth(newWidth) {
      let MIN = 40, MAX = 600;
      if (key === 'hour') { MIN = 60; MAX = 130; }
      if (key === 'del') { MIN = 28; MAX = 60; }
      if (key === 'time') { MIN = 70; MAX = 180; }
      if (key === 'note') { MIN = 80; MAX = 500; }
      const clamped = Math.max(MIN, Math.min(MAX, Math.round(newWidth)));

      // Write to colgroup col (single source of truth)
      const colEl = document.querySelector(`colgroup#status-colgroup col[data-col-key="${CSS.escape(key)}"]`);
      if (colEl) { colEl.style.width = clamped + 'px'; }

      // Update all THs/TDs with this col-key
      document.querySelectorAll(`[data-col-key="${CSS.escape(key)}"]`).forEach(el => {
        el.style.width = clamped + 'px';
        el.style.minWidth = clamped + 'px';
        el.style.maxWidth = clamped + 'px';
      });

      // Sync total table width
      const tableEl = document.getElementById('status-table') || document.querySelector('.status-table');
      if (tableEl) {
        const colEls = document.querySelectorAll('colgroup#status-colgroup col');
        let total = 0;
        colEls.forEach(c => {
          const k = c.dataset.colKey;
          total += (k === key) ? clamped : getColumnWidth(k);
        });
        tableEl.style.width = total + 'px';
        tableEl.style.minWidth = total + 'px';
      }
    }

    function recalcTableWidth() {
      const tbl = document.getElementById('status-table');
      if (!tbl) return;
      // 用 settings.columnWidths 直接求和（无需再遍历 DOM）
      const custom = settings.columnWidths || {};
      let total = 0;
      const seen = new Set();
      document.querySelectorAll('[data-col-key]').forEach((el) => {
        const k = el.dataset.colKey;
        if (seen.has(k)) return;
        seen.add(k);
        total += (typeof custom[k] === 'number' && custom[k] > 0) ? custom[k] : getColumnWidth(k);
      });
      tbl.style.width = total + 'px';
      tbl.style.minWidth = total + 'px';
    }

    function commitWidthAndTeardown(keepCursor) {
      if (!isResizing) return;
      isResizing = false;
      if (!keepCursor) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
      }
      const newWidth = column.offsetWidth;
      if (!settings.columnWidths) settings.columnWidths = {};
      settings.columnWidths[key] = newWidth;
      saveSettings();
      recalcTableWidth();
    }

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.pageX;
      startWidth = column.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', resize, { passive: true });
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
      // 拖拽手柄的 CSS 已设置 touch-action: none，这里不调用 preventDefault 避免 300ms 点击延迟
      document.body.style.touchAction = 'none';
      document.addEventListener('touchmove', touchResize, { passive: false });
      document.addEventListener('touchend', touchStop, { passive: true });
      document.addEventListener('touchcancel', touchStop, { passive: true });
      e.stopPropagation();
    });

    function resize(e) {
      if (!isResizing) return;
      applyWidth(Math.max(40, startWidth + (e.pageX - startX)));
    }

    function touchResize(e) {
      if (!isResizing || e.touches.length !== 1) return;
      applyWidth(Math.max(40, startWidth + (e.touches[0].pageX - startX)));
      // 被动监听不能 preventDefault，但 resizer 本身 touch-action:none，Safari 已不会滚动
    }

    function stopResize() {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResize);
      commitWidthAndTeardown(false);
    }

    function touchStop() {
      document.removeEventListener('touchmove', touchResize);
      document.removeEventListener('touchend', touchStop);
      document.removeEventListener('touchcancel', touchStop);
      commitWidthAndTeardown(true);
    }

    // Double-click to auto-fit column width (Excel-like behavior)
    resizer.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      autoFitColumn(column, key);
    });
    column.addEventListener('dblclick', (e) => {
      // Only auto-fit if double-clicked on the column header text area (not on buttons)
      if (e.target === column || e.target.tagName === 'TH') {
        autoFitColumn(column, key);
      }
    });

    function autoFitColumn(col, colKey) {
      // Find all cells in this column and compute max content width
      const cells = document.querySelectorAll(`[data-col-key="${CSS.escape(colKey)}"]`);
      let maxW = 40;
      const originalW = col.style.width;
      // Temporarily set to auto to measure content
      cells.forEach(c => {
        c.style.width = 'auto';
        c.style.minWidth = '0';
        c.style.maxWidth = 'none';
      });
      // Measure
      cells.forEach(c => {
        const w = c.scrollWidth;
        if (w > maxW) maxW = w;
      });
      // Add padding
      maxW = Math.min(maxW + 16, 300);
      // Apply
      applyWidth(maxW);
      if (!settings.columnWidths) settings.columnWidths = {};
      settings.columnWidths[colKey] = maxW;
      saveSettings();
      recalcTableWidth();
      showSnackbar(`列宽已自适应: ${maxW}px`);
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
    document.title = `SCC Patrol Record · ${currentDate}`;
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

    // ===== Build ordered list of ALL concrete data columns (bottom-level only) =====
    const allConcreteColKeys = [];
    allConcreteColKeys.push('hour');
    orderedCats.forEach(cat => {
      if (cat.subStatuses && cat.subStatuses.length > 0) {
        cat.subStatuses.forEach(sub => {
          allConcreteColKeys.push(getColumnKey('category', cat.id, sub.id));
        });
      } else {
        allConcreteColKeys.push(getColumnKey('category', cat.id));
      }
    });
    allConcreteColKeys.push('note');
    allConcreteColKeys.push('time');

    // ===== Build colgroup as the SINGLE source of truth for column widths =====
    const table = document.getElementById('status-table') || document.querySelector('.status-table');
    const colgroup = document.createElement('colgroup');
    colgroup.id = 'status-colgroup';
    allConcreteColKeys.forEach(key => {
      const col = document.createElement('col');
      col.dataset.colKey = key;
      const w = getColumnWidth(key);
      col.style.width = w + 'px';
      colgroup.appendChild(col);
    });
    if (table) {
      const existingColgroup = table.querySelector('colgroup');
      if (existingColgroup) existingColgroup.remove();
      table.insertBefore(colgroup, table.firstChild || null);
    }

    // ===== Compute explicit total table width =====
    const totalWidth = allConcreteColKeys.reduce((s, k) => s + getColumnWidth(k), 0);
    if (table) {
      table.style.width = totalWidth + 'px';
      table.style.minWidth = totalWidth + 'px';
      table.style.maxWidth = 'none';
      table.style.tableLayout = 'fixed';
    }

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
          // 无子状态的类别：不能设 visibility:hidden，否则 resizer 无法接收事件
          // 改为透明背景+空文本，但保持可交互
          const th = document.createElement('th');
          th.textContent = '';
          th.style.color = 'transparent';
          th.style.background = 'transparent';
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

    // ===== FINAL PASS: Attach resizer to BOTTOM-MOST row of every concrete column =====
    const allHeaderRows = Array.from(head.querySelectorAll('tr'));
    const bottomHeaderRow = allHeaderRows[allHeaderRows.length - 1];
    const bottomRowTHs = Array.from(bottomHeaderRow.children);
    allConcreteColKeys.forEach((key, colIdx) => {
      const th = bottomRowTHs[colIdx];
      if (!th) return;
      th.dataset.colKey = key;
      const w = getColumnWidth(key);
      th.style.width = w + 'px';
      th.style.minWidth = w + 'px';
      resizerTargets.push({ th, key });
    });

    const now = getNow();
    const today = getGMTDateString(now);
    const currentHour = getGMTHourString(now);

    for (let h = 0; h < HOURS; h++) {
      const hourStr = String(h).padStart(2, '0');
      const tr = document.createElement('tr');

      if (currentDate === today && hourStr === currentHour) {
        tr.className = 'current-hour';
      }

      const access = getHourAccessState(currentDate, hourStr, now.getTime());
      tr.dataset.hourAccess = access;
      if (access === 'future') tr.classList.add('row-future');
      if (access === 'grace-fill') tr.classList.add('row-grace-fill');

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
          if (access === 'future') td.classList.add('cell-disabled');
          if (access === 'grace-fill') td.classList.add('cell-grace');

          const colKey = getColumnKey('category', cat.id, sub ? sub.id : null);
          applyColumnWidth(td, colKey);

          // Apply category color as background tint
          if (cat.color) td.style.background = cat.color;

          // Parent group divider only on the FIRST cell of a new parent group
          if (isNewParentGroup && subi === 0) {
            td.classList.add('parent-divider');
          }

          renderStatusCell(td, currentDate, hourStr, cat.id, sub ? sub.id : null, access);
          td.addEventListener('click', () => handleCellClick(td, currentDate, hourStr, cat.id, sub ? sub.id : null));
          tr.appendChild(td);
        });
      });

      const tdNote = document.createElement('td');
      tdNote.className = 'note-cell';
      applyColumnWidth(tdNote, 'note');
      renderNoteCell(tdNote, currentDate, hourStr, access);
      tr.appendChild(tdNote);

      const tdTime = document.createElement('td');
      tdTime.className = 'time-cell';
      applyColumnWidth(tdTime, 'time');
      renderTimeCell(tdTime, currentDate, hourStr);
      tr.appendChild(tdTime);

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

    // ===== Multi-row header per-row sticky top (写入 3 个 CSS 变量：供 styles.css 里 nth-child(1/2/3) 使用 =====
    // 不再对 tr 写 inline style.position / style.top（避免 rowspan 跨行的 行1行2文字 被合成层堆叠覆盖 → 用户反馈"检查内容/平台及设备不见了"）。
    // 原理：
    //   row0.top = baseOffset (app-header + sticky-top-controls 总高度)
    //   row1.top = base + row0.height
    //   row2.top = base + row0.height + row1.height
    // 以上结果分别写入 CSS 变量：--thead-r0-top / --thead-r1-top / --thead-r2-top
    // CSS 侧 .status-table thead tr:nth-child(n) 分别使用这 3 个变量作为 top。
    function refreshHeaderRowStickyTops() {
      try {
        const headEl = document.getElementById('table-head');
        if (!headEl) return;
        const rows = Array.from(headEl.querySelectorAll('tr'));
        const basePx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--thead-sticky-top')) || 0;
        const heights = [0, 0, 0];
        // 先读取 3 行的真实 offsetHeight（此时浏览器已经 layout，值是稳定的，不再预估）
        for (let i = 0; i < Math.min(rows.length, 3); i++) {
          heights[i] = rows[i].getBoundingClientRect().height || rows[i].offsetHeight || 0;
        }
        const r0 = basePx;
        const r1 = r0 + heights[0];
        const r2 = r1 + heights[1];
        document.documentElement.style.setProperty('--thead-r0-top', r0 + 'px');
        document.documentElement.style.setProperty('--thead-r1-top', r1 + 'px');
        document.documentElement.style.setProperty('--thead-r2-top', r2 + 'px');
        // 交叉点：thead th.hour-cell（跨 3 行 rowspan 的 sticky left 时间格）
        // 只在 CSS 中 sticky left: 0，并且 top = base（它跟着第1行一起滚，不逐行变）——之前 JS 覆盖 style.top 导致它错位，这里移除
      } catch (e) {}
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(refreshHeaderRowStickyTops);
      // 字体 / Safari 在字体加载后高度可能变，再在 120ms、500ms、1200ms 后各补三次。
      [120, 500, 1200].forEach(t => setTimeout(refreshHeaderRowStickyTops, t));
    } else {
      setTimeout(refreshHeaderRowStickyTops, 0);
    }
    // 挂到全局，供 resize/刷新 sticky 偏移时复用
    window._refreshHeaderRowStickyTops = refreshHeaderRowStickyTops;
  }

  function renderStatusCell(td, date, hour, categoryId, subId, accessHint) {
    const entry = getEntry(date, hour, categoryId, subId);
    const access = accessHint || getHourAccessState(date, hour);
    const oorByTs = settings.outOfRangeHighlight && entry.timestamp
      ? isOutOfRange(date, hour, entry.timestamp)
      : false;
    // 用户："过时未填写的不需要高亮，保持表格原形态"→ out-of-range 只看真正的 oorByTs（已填且填入时间超容差）
    // 不再因 access === 'grace-fill' 就整行/空格高亮
    const outOfRange = oorByTs;

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

    if (outOfRange && entry.status !== STATUS_EMPTY) {
      td.classList.add('out-of-range');
      if (entry.timestamp) {
        td.title = '超时填入 (GMT): ' + getTimestampString(entry.timestamp);
      }
    } else if (entry.timestamp) {
      td.title = '填入时间 (GMT): ' + getTimestampString(entry.timestamp);
    } else if (access === 'grace-fill') {
      // 仅保留 title 提示（用户若 hover 知道现在已不可再改；视觉不再强制加背景色）
      td.title = '已超过正常填入窗口（空白仍可填入一次；已有记录不可再修改）';
    } else if (access === 'future') {
      td.title = '时段未到，暂时不可填入';
    } else {
      td.title = '';
    }
  }

  function renderNoteCell(tdNote, date, hour, accessHint) {
    const meta = getHourMeta(date, hour);
    const access = accessHint || getHourAccessState(date, hour);
    tdNote.innerHTML = '';
    const textarea = document.createElement('textarea');
    textarea.className = 'note-input';
    textarea.placeholder = access === 'future' ? '未到时间' : 'Note...';
    textarea.value = meta.note || '';
    textarea.dataset.hour = hour;
    if (access === 'future') {
      textarea.disabled = true;
      textarea.classList.add('note-disabled');
    }
    // 过时未填空白 → 不再给 cell-grace 视觉样式（保持表格原样）；只有真正 noteTimestamp 在容差外的才会高亮(见 updateNoteHighlight)
    textarea.addEventListener('input', _debounce((e) => {
      const h = e.target.dataset.hour;
      saveNote(date, h, e.target.value);
      updateNoteHighlight(tdNote, date, h);
    }, 180));
    textarea.addEventListener('blur', (e) => {
      const h = e.target.dataset.hour;
      if (!h) return;
      const m = getHourMeta(date, h);
      if (m.note !== e.target.value) {
        m.note = e.target.value;
        m.noteTimestamp = Date.now ? Date.now() : getNow().getTime();
      }
      saveRecordsSync();
      updateNoteHighlight(tdNote, date, h);
    }, { passive: true });
    tdNote.appendChild(textarea);

    updateNoteHighlight(tdNote, date, hour, access);
  }

  function updateNoteHighlight(tdNote, date, hour, accessHint) {
    const meta = getHourMeta(date, hour);
    const ta = tdNote.querySelector('.note-input');
    if (!ta) return;
    // Q1: 只有真正有 noteTimestamp 并且它在容差外才高亮（过时未填的空白保持原形态，不再因 grace-fill 直接加高亮）
    let highlight = false;
    if (settings.outOfRangeHighlight && meta.noteTimestamp && (meta.note || '').trim().length > 0) {
      highlight = isOutOfRange(date, hour, meta.noteTimestamp);
    }
    if (highlight) ta.classList.add('out-of-range');
    else ta.classList.remove('out-of-range');
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
    const access = getHourAccessState(date, hour);

    if (access === 'future') {
      showSnackbar(`${hour}:00 还未到，不能填入`);
      return;
    }

    const entry = getEntry(date, hour, categoryId, subId);
    const hadContent = entry.status !== STATUS_EMPTY;

    if (access === 'grace-fill') {
      // 过了容差窗口：只允许填入空单元格（不能改写已有的）
      if (hadContent) {
        showSnackbar(`${hour}:00 已过容差时间，不可修改已填内容`);
        return;
      }
      // 空的，允许填入；但这条记录会被自动标记为 OOR（超时填入高亮）
      const newStatus = nextStatus(entry.status);
      if (newStatus === STATUS_EMPTY) return; // 空→空 没意义
      entry.status = newStatus;
      entry.timestamp = getNow().getTime();
      saveRecords();
      renderStatusCell(td, date, hour, categoryId, subId);
      _refreshRowAux(date, hour, td);
      renderPendingCount();
      renderReminderBanner();
      return;
    }

    // access === 'editable' (容差内)：正常修改
    // 但如果之前已经填过，切换时提示"覆盖"
    if (hadContent) {
      const willCycle = entry.status === STATUS_CROSSED && (nextStatus(entry.status) === STATUS_EMPTY);
      const willOverwrite = (entry.status === STATUS_CHECKED || entry.status === STATUS_CROSSED)
        && nextStatus(entry.status) !== STATUS_EMPTY;
      if (willOverwrite || willCycle) {
        // 非空→非空 或 非空→清空：给用户确认
        showDialog('覆盖确认', `${hour}:00 该时段已有打卡记录，确认${willCycle ? '清空' : '修改'}该记录吗？`, () => {
          entry.status = nextStatus(entry.status);
          entry.timestamp = entry.status === STATUS_EMPTY ? null : getNow().getTime();
          saveRecords();
          renderStatusCell(td, date, hour, categoryId, subId);
          _refreshRowAux(date, hour, td);
          renderPendingCount();
          renderReminderBanner();
        });
        return;
      }
    }

    // 原来空的：正常填入
    const newStatus = nextStatus(entry.status);
    entry.status = newStatus;
    entry.timestamp = newStatus === STATUS_EMPTY ? null : getNow().getTime();
    saveRecords();
    renderStatusCell(td, date, hour, categoryId, subId);
    _refreshRowAux(date, hour, td);
    renderPendingCount();
    renderReminderBanner();
  }

  function _refreshRowAux(date, hour, tdOrRow) {
    const tr = (tdOrRow && tdOrRow.closest && tdOrRow.closest('tr')) ? tdOrRow.closest('tr') : null;
    if (!tr) return;
    const timeCell = tr.querySelector('.time-cell');
    if (timeCell) renderTimeCell(timeCell, date, hour);
    const noteCell = tr.querySelector('.note-cell');
    if (noteCell) updateNoteHighlight(noteCell, date, hour);
  }

  function saveNote(date, hour, value) {
    const access = getHourAccessState(date, hour);
    const meta = getHourMeta(date, hour);
    const hadExistingNote = !!(meta && meta.note && meta.note.length > 0);

    if (access === 'future') {
      // 未来时段：完全不允许写（虽然 input 也会 disabled，双保险）
      return;
    }
    if (access === 'grace-fill') {
      // 过了容差：之前空备注可以写；之前有备注就不能再修改
      if (hadExistingNote && value !== meta.note) {
        // 用户在 textarea 里打了字尝试改——我们回滚到原值并提示
        const ta = document.querySelector(`.note-input[data-hour="${hour}"]`);
        if (ta && ta.value !== meta.note) ta.value = meta.note;
        showSnackbar(`${hour}:00 已过容差时间，不可修改已有备注`);
        return;
      }
      // 第一次填备注（之前空）：允许
      meta.note = value;
      meta.noteTimestamp = getNow().getTime();
      saveRecords();
      return;
    }
    // editable：正常修改；值变化才更新时间戳（保留"最新"时间语义）
    if (meta.note !== value) {
      meta.note = value;
      meta.noteTimestamp = getNow().getTime();
    }
    saveRecords();
  }

  // ===== One-Click Record =====
  function oneClickCurrentHour() {
    const now = getNow();
    const hourStr = getGMTHourString(now);
    const date = getTodayDate();

    const access = getHourAccessState(date, hourStr, now.getTime());
    if (access === 'future') {
      showSnackbar(`${hourStr}:00 还未到，不能填入`);
      return;
    }

    const preset = getPresetTargets();
    const status = preset.status || STATUS_CHECKED;
    const targets = preset.targets;
    const parentTargets = preset.parentTargets;

    // 检测该时段是否已有任何打卡
    const hourMeta = getHourMeta(date, hourStr);
    let hasAnyStatus = false;
    const dr = getDayRecords(date);
    if (dr[hourStr]) {
      const rec = dr[hourStr];
      const keys = Object.keys(rec);
      for (const k of keys) {
        if (k === 'meta') continue;
        const v = rec[k];
        if (!v) continue;
        if (typeof v === 'object') {
          for (const sk of Object.keys(v)) {
            if (v[sk] && v[sk].status && v[sk].status !== STATUS_EMPTY) { hasAnyStatus = true; break; }
          }
        } else if (v.status && v.status !== STATUS_EMPTY) {
          hasAnyStatus = true;
        }
        if (hasAnyStatus) break;
      }
    }

    function doFill() {
      const count = fillRange(date, hourStr, hourStr, status, targets, parentTargets, now.getTime(), access);
      if (count > 0) {
        showSnackbar(`已打卡 ${hourStr}:00 (${count} 项)`);
      } else {
        showSnackbar('未填入任何项，请在设置中勾选填入对象');
      }
      renderAll(true);
    }

    if (hasAnyStatus) {
      if (access === 'grace-fill') {
        // 过了容差：已有的不能改
        showSnackbar(`${hourStr}:00 已过容差时间，已有记录不可覆盖`);
        return;
      }
      showDialog('覆盖确认', `${hourStr}:00 该时段已打卡，请确认是否覆盖？`, doFill);
    } else {
      doFill();
    }
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

  function fillRange(date, startHour, endHour, status, targets, parentTargets, overrideNowMs, accessHint) {
    const start = parseInt(startHour);
    const end = parseInt(endHour);
    const now = overrideNowMs || getNow().getTime();
    const skip = status === 'skip';
    const targetStatus = status === 'skip' ? STATUS_CHECKED : status;
    let filledCount = 0;

    for (let h = start; h <= end; h++) {
      const hourStr = String(h).padStart(2, '0');
      const access = accessHint || getHourAccessState(date, hourStr, now);
      if (access === 'future') continue; // 未来时段：不可填
      categories.forEach(cat => {
        // Skip entire category if its parent is disabled in preset
        const pid = effParentId(cat);
        if (parentTargets && pid && parentTargets[pid] === false) return;

        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [null];
        subs.forEach(sub => {
          const subKey = sub ? sub.id : '_main';
          if (targets && targets[cat.id] && targets[cat.id][subKey] === false) return;

          const entry = getEntry(date, hourStr, cat.id, sub ? sub.id : null);
          const had = entry.status && entry.status !== STATUS_EMPTY;
          if (access === 'grace-fill') {
            if (had) return; // 容差外：不能覆盖已填的
          }
          if (skip && entry.status !== STATUS_EMPTY) return;
          entry.status = targetStatus;
          entry.timestamp = now; // 记录最新记录时间
          filledCount++;
        });
      });
    }
    saveRecords();
    return filledCount;
  }

  // ===== PDF Export (uses quick-export habit) =====
  async function exportPDF() {
    const start = settings.quickExportStart;
    const end = settings.quickExportEnd;
    if (start && end && start <= end) {
      showSnackbar(`正在导出: ${start} 至 ${end}`);
      setTimeout(() => exportRangeAsPDF(start, end), 100);
      return;
    }
    showSnackbar('正在生成 PDF...');
    try {
      await exportRangeViaCanvasPDF([currentDate]);
    } catch (err) {
      console.error(err);
      showSnackbar('导出失败: ' + (err && err.message ? err.message : err));
    }
  }

  // ================================================================
  // Canvas-based PDF export — NO html2canvas, NO external CDN needed.
  // We draw the table directly onto a <canvas> using 2D API, then feed
  // the canvas image to jsPDF. This works on ALL devices including
  // iPhone / iPad Safari because it uses only native canvas APIs.
  // ================================================================

  function _getPDFTableMeta() {
    const parents = Array.isArray(settings.parents)
      ? settings.parents.filter(p => p && p.name && p.name.trim())
      : [];
    const hasParents = parents.length > 0;
    function effPid(c) {
      if (c.parentId && parents.some(p => p.id === c.parentId)) return c.parentId;
      return hasParents ? parents[0].id : null;
    }
    const groups = [];
    if (hasParents) {
      parents.forEach(p => {
        const cats = categories.filter(c => effPid(c) === p.id);
        if (cats.length > 0) groups.push({ parent: p, cats });
      });
    } else {
      groups.push({ parent: null, cats: categories.slice() });
    }
    const orderedCats = [];
    groups.forEach(g => g.cats.forEach(c => orderedCats.push(c)));

    // Flatten columns
    const cw = (settings && settings.columnWidths) || {};
    const defW = (settings && settings.defaultColWidth) || 50;
    const rawWidths = [cw.hour || 80];
    const colHeaders = ['时间'];
    orderedCats.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
      subs.forEach(sub => {
        rawWidths.push(cw[cat.id + '_' + sub.id] || defW);
        colHeaders.push(sub.name || cat.name);
      });
    });
    rawWidths.push(cw.note || 130);
    colHeaders.push('Note');
    rawWidths.push(cw.time || 85);
    colHeaders.push('填入');

    // Scale to fit target width
    const target = 1100;
    const rawTotal = rawWidths.reduce((a, b) => a + b, 0);
    let fitScale = rawTotal > target ? target / rawTotal : (rawTotal < target * 0.6 ? Math.min(target / rawTotal, 1.3) : 1);
    const colWidths = rawWidths.map(w => Math.round(w * fitScale));
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    return { parents, hasParents, groups, orderedCats, colWidths, colHeaders, totalWidth, effPid };
  }

  function _getLatestTimeString(row) {
    let latest = null;
    categories.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
      subs.forEach(sub => {
        const ed = row.entries[cat.id] ? row.entries[cat.id][sub.id] : null;
        if (ed && ed.timestamp && (!latest || ed.timestamp > latest)) latest = ed.timestamp;
      });
    });
    if (row.noteTimestamp && (!latest || row.noteTimestamp > latest)) latest = row.noteTimestamp;
    return latest ? getGMTTimeString(latest) : '';
  }

  // Draw one day's table onto a canvas and return the canvas.
  function _drawDayToCanvas(date, data, showTitle, titleText, subtitleText) {
    const meta = _getPDFTableMeta();
    const { orderedCats, colWidths, colHeaders, totalWidth, hasParents, groups, effPid } = meta;

    // Layout constants (in canvas pixels, scale=2 for sharpness)
    const S = 2; // scale factor
    const padX = 6 * S, padY = 5 * S;
    const headerH = (hasParents ? 3 : 2) * (24 * S) + 4 * S;
    const rowH = 28 * S;
    const hourCount = data.length;
    const tableH = headerH + hourCount * rowH;

    // Top area for title + subtitle + date header
    let topH = 0;
    if (showTitle) topH += 30 * S + 14 * S; // title + subtitle
    topH += 22 * S + 6 * S; // date header bar
    const totalCanvasW = totalWidth * S + 20 * S;
    const totalCanvasH = topH + tableH + 10 * S;

    const canvas = document.createElement('canvas');
    canvas.width = totalCanvasW;
    canvas.height = totalCanvasH;
    const ctx = canvas.getContext('2d');
    ctx.scale(1, 1);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let y = 6 * S;

    // Title
    if (showTitle && titleText) {
      ctx.fillStyle = '#333';
      ctx.font = `bold ${18 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(titleText, canvas.width / 2, y + 16 * S);
      y += 24 * S;
    }
    // Subtitle
    if (showTitle && subtitleText) {
      ctx.fillStyle = '#666';
      ctx.font = `${11 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(subtitleText, canvas.width / 2, y + 12 * S);
      y += 16 * S;
    }

    // Date header bar
    const dateObj = new Date(date + 'T00:00:00Z');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dateLabel = `${date} ${weekdays[dateObj.getUTCDay()]} (GMT)`;
    ctx.fillStyle = '#e3f2fd';
    ctx.fillRect(10 * S, y, totalWidth * S, 20 * S);
    ctx.fillStyle = '#1565c0';
    ctx.font = `bold ${12 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('📅 ' + dateLabel, 16 * S, y + 14 * S);
    y += 26 * S;

    // Table start position
    const tableX = 10 * S;

    // Draw header rows
    let headerY = y;
    // Row 1: "时间" (rowspan) + parent names or cat names + "Note" + "填入"
    const r1H = 24 * S;
    // "时间" cell
    ctx.fillStyle = '#e8f0fe';
    ctx.fillRect(tableX, headerY, colWidths[0] * S, (hasParents ? 3 : 2) * r1H + 4 * S);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1 * S;
    ctx.strokeRect(tableX, headerY, colWidths[0] * S, (hasParents ? 3 : 2) * r1H + 4 * S);
    ctx.fillStyle = '#1976d2';
    ctx.font = `bold ${13 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('时间', tableX + padX, headerY + ((hasParents ? 3 : 2) * r1H + 4 * S) / 2 + 4 * S);

    let cx = tableX + colWidths[0] * S;
    let colIdx = 1;

    if (hasParents) {
      // Row 1: parent headers
      groups.forEach((g, gi) => {
        let colCount = 0;
        g.cats.forEach(c => {
          const sc = c.subStatuses ? c.subStatuses.length : 0;
          colCount += sc > 0 ? sc : 1;
        });
        let groupW = 0;
        for (let k = 0; k < colCount; k++) groupW += colWidths[colIdx + k] * S;
        ctx.fillStyle = g.parent.color || '#e8f0fe';
        if (gi > 0) { ctx.fillStyle = '#bbdefb'; }
        ctx.fillRect(cx, headerY, groupW, r1H);
        ctx.strokeRect(cx, headerY, groupW, r1H);
        ctx.fillStyle = '#1565c0';
        ctx.font = `bold ${12 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(g.parent.name, cx + groupW / 2, headerY + r1H / 2 + 4 * S);
        cx += groupW;
        colIdx += colCount;
      });
    } else {
      // Row 1: category headers
      orderedCats.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
        let catW = 0;
        for (let k = 0; k < subs.length; k++) catW += colWidths[colIdx + k] * S;
        ctx.fillStyle = cat.color || '#e8f0fe';
        ctx.fillRect(cx, headerY, catW, r1H);
        ctx.strokeRect(cx, headerY, catW, r1H);
        ctx.fillStyle = '#333';
        ctx.font = `bold ${11 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(cat.name, cx + catW / 2, headerY + r1H / 2 + 4 * S);
        cx += catW;
        colIdx += subs.length;
      });
    }

    // Note + 填入 headers (rowspan)
    const noteW = colWidths[colWidths.length - 2] * S;
    const timeW = colWidths[colWidths.length - 1] * S;
    ctx.fillStyle = '#e8f0fe';
    ctx.fillRect(cx, headerY, noteW, (hasParents ? 3 : 2) * r1H + 4 * S);
    ctx.strokeRect(cx, headerY, noteW, (hasParents ? 3 : 2) * r1H + 4 * S);
    ctx.fillStyle = '#333';
    ctx.font = `bold ${11 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Note', cx + noteW / 2, headerY + ((hasParents ? 3 : 2) * r1H + 4 * S) / 2 + 4 * S);
    cx += noteW;
    ctx.fillStyle = '#e8f0fe';
    ctx.fillRect(cx, headerY, timeW, (hasParents ? 3 : 2) * r1H + 4 * S);
    ctx.strokeRect(cx, headerY, timeW, (hasParents ? 3 : 2) * r1H + 4 * S);
    ctx.fillText('填入', cx + timeW / 2, headerY + ((hasParents ? 3 : 2) * r1H + 4 * S) / 2 + 4 * S);

    headerY += r1H;

    // Row 2: category headers (only if hasParents)
    if (hasParents) {
      cx = tableX + colWidths[0] * S;
      colIdx = 1;
      orderedCats.forEach((cat, i) => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
        let catW = 0;
        for (let k = 0; k < subs.length; k++) catW += colWidths[colIdx + k] * S;
        ctx.fillStyle = cat.color || '#e8f0fe';
        ctx.fillRect(cx, headerY, catW, r1H);
        ctx.strokeRect(cx, headerY, catW, r1H);
        ctx.fillStyle = '#333';
        ctx.font = `bold ${10 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(cat.name, cx + catW / 2, headerY + r1H / 2 + 3 * S);
        cx += catW;
        colIdx += subs.length;
      });
      headerY += r1H;
    }

    // Sub-status header row
    cx = tableX + colWidths[0] * S;
    colIdx = 1;
    orderedCats.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: '' }];
      subs.forEach(sub => {
        const w = colWidths[colIdx] * S;
        ctx.fillStyle = '#f0f4f8';
        ctx.fillRect(cx, headerY, w, r1H + 4 * S);
        ctx.strokeRect(cx, headerY, w, r1H + 4 * S);
        ctx.fillStyle = '#555';
        ctx.font = `${9 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(sub.name || '●', cx + w / 2, headerY + (r1H + 4 * S) / 2 + 3 * S);
        cx += w;
        colIdx++;
      });
    });
    // Note + time sub headers already drawn via rowspan

    let dataY = headerY + r1H + 4 * S;

    // Draw data rows
    data.forEach(row => {
      const rh = rowH;
      let dx = tableX;
      // Hour cell
      const rowBg = parseInt(row.hour) % 2 === 0 ? '#fafbfc' : '#ffffff';
      ctx.fillStyle = rowBg;
      ctx.fillRect(dx, dataY, colWidths[0] * S, rh);
      ctx.strokeRect(dx, dataY, colWidths[0] * S, rh);
      ctx.fillStyle = '#1976d2';
      ctx.font = `bold ${11 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(row.hour + ':00', dx + colWidths[0] * S / 2, dataY + rh / 2 + 4 * S);
      dx += colWidths[0] * S;

      // Status cells
      colIdx = 1;
      orderedCats.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
        subs.forEach(sub => {
          const w = colWidths[colIdx] * S;
          ctx.fillStyle = rowBg;
          ctx.fillRect(dx, dataY, w, rh);
          ctx.strokeRect(dx, dataY, w, rh);
          const ed = row.entries[cat.id] ? row.entries[cat.id][sub.id] : null;
          const status = ed ? ed.status : '';
          const color = status === '✓' ? '#2e7d32' : status === '✗' ? '#c62828' : '#ccc';
          ctx.fillStyle = color;
          ctx.font = `bold ${12 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
          ctx.textAlign = 'center';
          if (status) ctx.fillText(status, dx + w / 2, dataY + rh / 2 + 4 * S);
          dx += w;
          colIdx++;
        });
      });

      // Note cell
      const nw = colWidths[colWidths.length - 2] * S;
      ctx.fillStyle = rowBg;
      ctx.fillRect(dx, dataY, nw, rh);
      ctx.strokeRect(dx, dataY, nw, rh);
      ctx.fillStyle = '#333';
      ctx.font = `${10 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      const noteText = (row.note || '').substring(0, 40);
      ctx.fillText(noteText, dx + padX, dataY + rh / 2 + 3 * S);
      dx += nw;

      // Time cell
      const tw = colWidths[colWidths.length - 1] * S;
      ctx.fillStyle = rowBg;
      ctx.fillRect(dx, dataY, tw, rh);
      ctx.strokeRect(dx, dataY, tw, rh);
      ctx.fillStyle = '#666';
      ctx.font = `${10 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'right';
      const timeStr = _getLatestTimeString(row);
      ctx.fillText(timeStr, dx + tw - padX, dataY + rh / 2 + 3 * S);

      dataY += rh;
    });

    return canvas;
  }

  // Main entry: render each day to canvas, assemble into a single PDF via jsPDF
  async function exportRangeViaCanvasPDF(dates) {
    if (!window.jspdf || !jspdf.jsPDF) {
      throw new Error('PDF 库未加载');
    }
    const { jsPDF } = jspdf;
    const PAGE_W_MM = 297, PAGE_H_MM = 210, MARGIN_MM = 8;
    const CONTENT_W_MM = PAGE_W_MM - 2 * MARGIN_MM;
    const CONTENT_H_MM = PAGE_H_MM - 2 * MARGIN_MM;

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let total = 0, filled = 0;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const data = collectDayData(date);
      data.forEach(row => {
        categories.forEach(cat => {
          const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [null];
          subs.forEach(sub => {
            const key = sub ? sub.id : '_main';
            total++;
            const ed = row.entries[cat.id] ? row.entries[cat.id][key] : null;
            if (ed && ed.status && ed.status !== '') filled++;
          });
        });
      });

      const showTitle = (i === 0);
      let titleText = null, subtitleText = null;
      if (showTitle) {
        titleText = dates.length > 1 ? 'SCC Patrol Record·历史汇总' : 'SCC Patrol Record';
        if (dates.length > 1) {
          const rate = total > 0 ? Math.round((filled / total) * 100) : 0;
          subtitleText = `日期范围: ${dates[0]} 至 ${dates[dates.length - 1]} (GMT) · 共 ${dates.length} 天 · 填写率 ${rate}%`;
        } else {
          subtitleText = `生成时间: ${getGMTTimeString(getNow())} GMT`;
        }
      }

      const canvas = _drawDayToCanvas(date, data, showTitle, titleText, subtitleText);

      if (i > 0) pdf.addPage();

      const ratio = canvas.width / canvas.height;
      let drawWmm = CONTENT_W_MM;
      let drawHmm = drawWmm / ratio;
      if (drawHmm > CONTENT_H_MM) {
        drawHmm = CONTENT_H_MM;
        drawWmm = drawHmm * ratio;
      }
      const x = MARGIN_MM + (CONTENT_W_MM - drawWmm) / 2;
      const y = MARGIN_MM + (CONTENT_H_MM - drawHmm) / 2;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(dataUrl, 'JPEG', x, y, drawWmm, drawHmm, undefined, 'FAST');
    }

    const fileDate = (dates.length > 1 ? `${dates[0]}-${dates[dates.length - 1]}` : dates[0]);
    pdf.save(`SCC-Patrol-Record_${fileDate}.pdf`);
    showSnackbar('PDF 已生成下载');
  }

  function exportRangeAsPDF(startStr, endStr) {
    const dates = getDateRangeApp(startStr, endStr);
    showSnackbar(`正在生成 PDF (${dates.length} 天)...`);
    exportRangeViaCanvasPDF(dates).catch(err => {
      console.error(err);
      showSnackbar('导出失败: ' + (err && err.message ? err.message : err));
    });
  }

  function getDateRangeApp(startStr, endStr) {
    const dates = [];
    const start = new Date(startStr + 'T00:00:00Z');
    const end = new Date(endStr + 'T00:00:00Z');
    const cur = new Date(start);
    while (cur <= end) {
      dates.push(getGMTDateString(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return dates;
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
    const dateObj = new Date(date + 'T00:00:00Z');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dateLabel = `${date} ${weekdays[dateObj.getUTCDay()]}`;
    const { thead: pdfThead, colgroup, totalWidth, orderedCats, hasParents, headerRows, effPid, noWrapBase } = buildPDFTableHeader(1020);
    const css = buildPrintCSSBase(totalWidth);

    let rowsHTML = '';
    hours.forEach(row => {
      let statusCells = '';
      orderedCats.forEach((cat, ci) => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
        const prevCat = ci > 0 ? orderedCats[ci - 1] : null;
        const isNewGroup = hasParents && ci > 0 && effPid(cat) !== effPid(prevCat);
        subs.forEach((sub, subi) => {
          const key = sub.id;
          const ed = row.entries[cat.id] ? row.entries[cat.id][key] : null;
          const status = ed ? ed.status : '';
          const div = (subi === 0 && isNewGroup) ? 'border-left:3px solid #1976d2;' : '';
          const color = status === '✓' ? '#2e7d32' : status === '✗' ? '#c62828' : '#ccc';
          statusCells += `<td style="border:1px solid #333;padding:6px 3px;text-align:center;font-size:14px;color:${color};${div}${noWrapBase}">${status || ''}</td>`;
        });
      });

      const timeStr = getLatestTimeString(row);
      const note = (row.note || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const rowClass = parseInt(row.hour) % 2 === 0 ? 'background:#fafbfc;' : '';

      rowsHTML += `<tr style="${rowClass}">
        <td style="border:1px solid #333;padding:6px 8px;font-weight:bold;font-size:13px;color:#1976d2;${noWrapBase}">${row.hour}:00</td>
        ${statusCells}
        <td class="note-cell" style="border:1px solid #333;padding:6px;font-size:12px;word-break:break-word;white-space:normal;">${note}</td>
        <td style="border:1px solid #333;padding:6px;font-size:12px;color:#666;text-align:right;${noWrapBase}">${timeStr}</td>
      </tr>`;
    });

    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>SCC Patrol Record - ${date}</title>
${css.headExtra}
${css.styleTag}
</head><body>
<h1>SCC Patrol Record</h1>
<div class="subtitle">日期: ${dateLabel} (GMT) · 生成时间: ${getGMTTimeString(getNow())} GMT</div>
<div class="pdf-holder"><div class="pdf-wrap">
  <table class="pdf-table">
    ${colgroup}
    ${pdfThead}
    <tbody>${rowsHTML}</tbody>
  </table>
</div></div>
<div class="footer">SCC Patrol Record · 共 ${hours.length} 小时记录</div>
<script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }<\/script>
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

  // ===== Render All =====
  // Apply settings (font-size, highlight color, one-click label, etc.) to the live DOM
  // - Must be idempotent: safe to call at init and any time we re-load from localStorage
  // - Replaces the old "do it once inside init()" approach because returning from settings via
  //   same-page navigation (location.href='index.html') / visibilitychange / pageshow needs to
  //   re-apply everything, not just swap the `settings` object reference.
  function applySettingsToDOM() {
    // Q3: 关闭管理者模式时不再自动回写 timeRangeMinutes=15；
    // 只是 UI 层面禁用 <input>（设置页实现），真正的值保持"上次管理者配置的结果"。
    // 新用户首次初始化 DEFAULT_SETTINGS.timeRangeMinutes=15，符合"默认值15分钟"要求。

    // 1) Font size CSS var --fs
    const fsMap = { 'small': 0.8, 'medium': 1.0, 'large': 1.3, 'xlarge': 1.6 };
    const fs = settings.fontSize || 'medium';
    document.documentElement.style.setProperty('--fs', String(fsMap[fs] || 1.0));

    // 2) Highlight color: CSS var + legend dot
    applyHighlightColor();
    const legend = document.getElementById('legend-dot');
    if (legend) legend.style.background = settings.highlightColor;

    // 3) One-click button label (settings → 按钮文字)
    const oneClickLabel = document.getElementById('one-click-label');
    if (oneClickLabel) {
      oneClickLabel.textContent = settings.oneClickName || '一键打卡';
    }
    // 3b) One-click button visibility / hint: if preset selects nothing, mark button as disabled-looking
    const oneClickBtn = document.getElementById('btn-one-click');
    const preset = settings.oneClickPreset || { status: '✓', targets: null, parentTargets: null };
    let anyChecked = true;
    if (preset.parentTargets && Object.keys(preset.parentTargets).length > 0) {
      anyChecked = Object.values(preset.parentTargets).some(v => v !== false);
    }
    if (anyChecked && preset.targets && typeof preset.targets === 'object') {
      const cats = Object.keys(preset.targets);
      if (cats.length > 0) {
        const hasAtLeastOne = cats.some(cid => {
          const sub = preset.targets[cid];
          if (!sub || typeof sub !== 'object') return true;
          return Object.values(sub).some(v => v !== false);
        });
        anyChecked = hasAtLeastOne;
      }
    }
    if (oneClickBtn) {
      oneClickBtn.style.opacity = anyChecked ? '1' : '0.55';
      oneClickBtn.title = anyChecked ? '' : '请在设置中勾选一键打卡的填入项';
    }

    // 4) 应用管理者模式到 DOM（挂到全局，isAdminMode/setAdminMode 会调用）
    window._applyAdminModeToDOM = function _applyAdminModeToDOM() {
      const on = isAdminMode();
      document.documentElement.dataset.adminMode = on ? '1' : '0';
      // 管理者：给 html 一个样式钩子；主页面显示一个小徽章
      const banner = document.getElementById('reminder-banner');
      updateClock(); // 刷新时钟显示的🛠徽章
    };
    window._applyAdminModeToDOM();
  }

  // 渲染：full=true 用于 初始化/pageshow/从设置返回/批量修改后 这种"必须重建DOM"的场景
  //       full=false（默认）只刷新轻量 UI（时钟/banner/待填/表头高亮），不重建表格，避免手机端反复 layout 卡顿
  let _lastHourHighlightDate = null;
  let _lastHourHighlightHour = -1;
  function renderAll(full) {
    applyHighlightColor();
    renderHeader();
    if (full === true) renderTable();
    renderPendingCount();
    renderReminderBanner();
    // 即使不是 full，跨整点也要立即重建一次（新进入当前小时需要高亮 tr.current-hour）
    const now = getNow();
    const today = getGMTDateString(now);
    const hr = parseInt(getGMTHourString(now), 10);
    if ((_lastHourHighlightDate !== today || _lastHourHighlightHour !== hr) && full !== true) {
      // 只更新 tr.current-hour 的高亮：先移除旧，再加新，避免整表重绘
      const oldCurr = document.querySelector('#status-table tr.current-hour, table.status-table tr.current-hour');
      if (oldCurr) oldCurr.classList.remove('current-hour');
      const allRows = document.querySelectorAll('#status-table tbody tr, table.status-table tbody tr');
      if (allRows && allRows[hr]) allRows[hr].classList.add('current-hour');
      _lastHourHighlightDate = today;
      _lastHourHighlightHour = hr;
    }
    if (full === true) {
      _lastHourHighlightDate = today;
      _lastHourHighlightHour = hr;
    }
  }

  // ===== Admin Mode (管理者模式) =====
  // 打开方式：连续点击右上角 GMT 时钟 3 下（每次间隔 <= 1.2s）。
  // 关闭同理（再连击3下）。
  function isAdminMode() {
    try {
      return localStorage.getItem(STORAGE_KEY_ADMIN_MODE) === '1';
    } catch (e) { return false; }
  }
  function setAdminMode(on) {
    try {
      if (on) localStorage.setItem(STORAGE_KEY_ADMIN_MODE, '1');
      else localStorage.removeItem(STORAGE_KEY_ADMIN_MODE);
    } catch (e) {}
    if (typeof _applyAdminModeToDOM === 'function') _applyAdminModeToDOM();
    showSnackbar(on
      ? '🛠 管理者模式：已开启（时间容差、时间模拟可改）'
      : '🔒 管理者模式：已关闭（时间容差已锁定，时间编辑功能已隐藏）');
  }
  function bindAdminClockTripleClick() {
    const el = document.getElementById('gmt-clock');
    if (!el) return;
    el.style.cursor = 'pointer';
    el.title = '连续点击3次可切换管理者模式';
    let clicks = 0;
    let timer = null;
    function reset() { clicks = 0; if (timer) { clearTimeout(timer); timer = null; } }
    el.addEventListener('click', () => {
      clicks++;
      if (timer) clearTimeout(timer);
      if (clicks >= 3) {
        // 3连击：切换
        reset();
        setAdminMode(!isAdminMode());
        return;
      }
      timer = setTimeout(reset, 1200);
    });
  }

  // ===== GMT Clock =====
  function updateClock() {
    const now = getNow();
    const el = document.getElementById('gmt-clock');
    if (el) el.textContent = getGMTTimeString(now) + ' GMT' + (isAdminMode() ? ' 🛠' : '');
  }

  // ===== Reminder System =====
  function setupReminderSystem() {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      // 延迟请求权限，避免首屏启动期打断关键渲染
      setTimeout(() => Notification.requestPermission().catch(() => {}), 4000);
    }

    // 时钟/banner 走 5 秒（UI 层面），但不再触发 renderTable
    setInterval(() => {
      updateClock();
      renderReminderBanner();
      renderPendingCount();

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
                new Notification('SCC Patrol Record 提醒', {
                  body: `时段 ${nextHour}:00 尚未填写，请及时记录`,
                  tag: 'status-reminder-' + today + '-' + nextHour,
                });
                sessionStorage.setItem('last_notification_' + today + '_' + nextHour, '1');
              } catch (e) { /* ignore */ }
            }
          }
        }
      }

      // 整点时刻（仅一次，UTC 秒 0 ~ 8 窗口）跨到新小时时，执行 1 次 full 渲染重建表格
      if (now.getUTCSeconds() <= 8) {
        renderAll(true);
      }
    }, 5000);
  }

  // ===== Init =====
  // Central reload: idempotently re-read settings/cats/records from storage,
  // apply to DOM, and re-render. Called from init(), pageshow, visibilitychange.
  function reloadAllAndRender(reason) {
    settings = loadSettings();
    categories = loadCategories();
    records = loadRecords();
    currentDate = getGMTDateString(getNow());
    applySettingsToDOM();
    renderAll(true);
    refreshTheadStickyOffset();
  }

  // Sticky 表头偏移：app-header + sticky-top-controls 总高度 -> --thead-sticky-top
  function refreshTheadStickyOffset() {
    try {
      const header = document.querySelector('.app-header');
      const controls = document.getElementById('sticky-top-controls');
      let total = 0;
      if (header && header.getBoundingClientRect) {
        total += header.getBoundingClientRect().height;
      }
      if (controls && controls.getBoundingClientRect) {
        total += controls.getBoundingClientRect().height;
      }
      document.documentElement.style.setProperty('--thead-sticky-top', total + 'px');
      // 刷新每一行表头的逐行 sticky top 堆叠
      if (typeof window !== 'undefined' && typeof window._refreshHeaderRowStickyTops === 'function') {
        try { window._refreshHeaderRowStickyTops(); } catch (e) {}
      }
    } catch (e) {}
  }

  let _refreshStickyRaf = null;
  function scheduleRefreshStickyOffset() {
    if (_refreshStickyRaf) return;
    const cb = () => {
      _refreshStickyRaf = null;
      refreshTheadStickyOffset();
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      _refreshStickyRaf = window.requestAnimationFrame(cb);
    } else {
      setTimeout(cb, 0);
    }
  }

  function init() {
    // Always use today's date
    currentDate = getTodayDate();

    // Apply all settings to DOM (font size, highlight color, one-click label, one-click preset state)
    applySettingsToDOM();

    // Date is always today in GMT mode
    document.getElementById('current-date').addEventListener('click', () => {
      currentDate = getTodayDate();
      renderAll(true);
      scheduleRefreshStickyOffset();
    });

    // Buttons
    document.getElementById('btn-one-click').addEventListener('click', oneClickCurrentHour);
    document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
    document.getElementById('btn-settings').addEventListener('click', () => {
      try { saveRecordsSync(); saveSettingsSync(); } catch (e) {}
      window.location.href = 'settings.html';
    });
    document.getElementById('btn-history').addEventListener('click', () => {
      try { saveRecordsSync(); saveSettingsSync(); } catch (e) {}
      window.location.href = 'history.html';
    });

    // Reminder banner close —— 切 hidden 可能导致高度变化（banner本身在 sticky-top-controls 里）
    document.getElementById('reminder-close').addEventListener('click', () => {
      document.getElementById('reminder-banner').classList.add('hidden');
      scheduleRefreshStickyOffset();
    });

    // Initial sticky offset (先于 renderAll 先做一次，之后 render 里再 refine)
    scheduleRefreshStickyOffset();

    // Render（首次加载必须 full 重建表格 DOM）
    renderAll(true);
    scheduleRefreshStickyOffset();

    // 5 分钟一次兜底刷新（应对 banner 定时显隐 / 字体加载 / 旋转屏）
    setInterval(scheduleRefreshStickyOffset, 60 * 1000);

    // Start clock
    bindAdminClockTripleClick();
    updateClock();

    // Setup reminder system (auto-refreshes every 5s)
    setupReminderSystem();

    // ------------------------------------------------------------------
    // Auto-refresh when returning from settings/history:
    //  1) pageshow - triggered on history.back() from settings/history (recommended route)
    //  2) visibilitychange (hidden -> visible) - triggered when iOS Safari switches
    //     from another tab/window back to PWA (pageshow may not fire in some cases)
    // We use both to be robust, plus guard against duplicate render loops.
    // ------------------------------------------------------------------
    let _pendingReload = false;
    function scheduleReload() {
      if (_pendingReload) return;
      _pendingReload = true;
      setTimeout(() => {
        _pendingReload = false;
        reloadAllAndRender();
        scheduleRefreshStickyOffset();
      }, 30);
    }
    window.addEventListener('pageshow', scheduleReload, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleReload();
    }, { passive: true });

    // Resize / orientation change -> sticky 高度重算
    let _resizeRaf = null;
    window.addEventListener('resize', () => {
      if (_resizeRaf) return;
      _resizeRaf = setTimeout(() => { _resizeRaf = null; scheduleRefreshStickyOffset(); }, 120);
    }, { passive: true });
    if (typeof window !== 'undefined' && 'orientationchange' in window) {
      window.addEventListener('orientationchange', scheduleRefreshStickyOffset, { passive: true });
    }
    // 字体加载完成后重算高度
    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleRefreshStickyOffset);
      }
    } catch (e) {}
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
      reloadAllAndRender('expose');
    }
  };
})();
