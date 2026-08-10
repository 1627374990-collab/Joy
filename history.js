/* ===== History Page ===== */
(function () {
  'use strict';

  const STORAGE_KEY_RECORDS = 'status_records_v1';
  const STORAGE_KEY_SETTINGS = 'status_settings_v1';
  const STORAGE_KEY_CATEGORIES = 'status_categories_v1';
  const HOURS = 24;

  const DEFAULT_CATEGORIES = [
    { id: 'health', name: '身体', subStatuses: [{ id: 'sleep', name: '睡眠' }, { id: 'mood', name: '情绪' }] },
    { id: 'work', name: '工作', subStatuses: [] },
    { id: 'study', name: '学习', subStatuses: [] },
  ];

  const STATUS_EMPTY = '';
  const STATUS_CHECKED = '✓';
  const STATUS_CROSSED = '✗';

  let settings = loadSettings();
  let categories = loadCategories();
  let records = loadRecords();

  // Apply font size from settings
  (function applyFontSize() {
    const map = { 'small': 0.8, 'medium': 1.0, 'large': 1.3, 'xlarge': 1.6 };
    const s = settings.fontSize || 'medium';
    document.documentElement.style.setProperty('--fs', String(map[s] || 1.0));
  })();

  // ===== Storage =====
  function loadSettings() {
    try {
      const s = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (s) return JSON.parse(s);
    } catch (e) { /* ignore */ }
    return { highlightColor: '#ffeb3b', timeRangeMinutes: 30, outOfRangeHighlight: true, reminderEnabled: true, pdfTitle: 'SCC Patrol Record', pdfExportDays: 7, fontSize: 'medium' };
  }

  function loadCategories() {
    try {
      const c = localStorage.getItem(STORAGE_KEY_CATEGORIES);
      if (c) return JSON.parse(c);
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
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

  // ===== Helpers =====
  function getGMTDateString(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ===== Time Offset (shared with settings.js for simulated time) =====
  const STORAGE_KEY_TIME_OFFSET = 'status_time_offset_ms_v1';
  function getTimeOffsetMs() {
    const v = localStorage.getItem(STORAGE_KEY_TIME_OFFSET);
    return v ? parseInt(v, 10) || 0 : 0;
  }
  function getNow() {
    return new Date(Date.now() + getTimeOffsetMs());
  }

  function getTodayDate() {
    return getGMTDateString(getNow());
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return getGMTDateString(d);
  }

  function getFullDateLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${dateStr} ${weekdays[d.getUTCDay()]}`;
  }

  function getGMTTimeString(date) {
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function getTimestampString(ts) {
    const d = new Date(ts);
    return getGMTTimeString(d);
  }

  // ===== Data Analysis =====
  function getDateRange(startStr, endStr) {
    const dates = [];
    let d = startStr;
    while (d <= endStr) {
      dates.push(d);
      d = shiftDate(d, 1);
    }
    return dates;
  }

  function analyzeDate(dateStr) {
    const day = records[dateStr] || {};
    let filledHours = 0;
    let totalStatuses = 0;
    let filledStatuses = 0;

    for (let h = 0; h < HOURS; h++) {
      const hourStr = String(h).padStart(2, '0');
      const hourData = day[hourStr] || {};
      let hasAny = false;
      for (const catId in hourData) {
        if (catId === '_meta') continue;
        for (const key in hourData[catId]) {
          totalStatuses++;
          const e = hourData[catId][key];
          if (e && e.status !== STATUS_EMPTY) {
            filledStatuses++;
            hasAny = true;
          }
        }
      }
      if (hasAny) filledHours++;
    }

    const totalPossible = HOURS * getTotalSubCount();
    const completeRate = totalPossible > 0 ? Math.round((filledStatuses / totalPossible) * 100) : 0;

    return {
      date: dateStr,
      filledHours,
      totalHours: HOURS,
      filledStatuses,
      totalStatuses: totalPossible,
      completeRate,
      hasData: filledStatuses > 0,
    };
  }

  function getTotalSubCount() {
    let count = 0;
    categories.forEach(cat => {
      count += cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses.length : 1;
    });
    return count || 1;
  }

  function isOutOfRange(date, hour, timestamp) {
    const tolerance = (settings.timeRangeMinutes != null) ? settings.timeRangeMinutes * 60 * 1000 : 15 * 60 * 1000;
    const y = parseInt(date.slice(0, 4), 10);
    const m = parseInt(date.slice(5, 7), 10) - 1;
    const d = parseInt(date.slice(8, 10), 10);
    const recordHourStart = new Date(Date.UTC(y, m, d, parseInt(hour, 10), 0, 0, 0)).getTime();
    const ts = new Date(timestamp).getTime();
    return ts < recordHourStart || ts > recordHourStart + tolerance;
  }

  function collectDateData(date) {
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
        // ===== PDF 使用：行级异常状态 =====
        hasCrossed: false,
        noteHasText: !!(meta.note && meta.note.trim().length > 0),
        // key = catId + '::' + subId  →  { oor:boolean }
        entryOorMap: {},
        // note 自己是否容差外（对应 .note-input.out-of-range 高亮）
        noteOor: false,
        // 最新填入总时间戳是否容差外（对应 .time-cell.out-of-range）
        timeOor: false,
        _latestTs: null,
      };

      categories.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [null];
        row.entries[cat.id] = {};
        subs.forEach(sub => {
          const key = sub ? sub.id : '_main';
          const ed = hourData[cat.id] ? hourData[cat.id][key] : null;
          const status = ed ? ed.status : STATUS_EMPTY;
          const ts = ed ? ed.timestamp : null;
          row.entries[cat.id][key] = {
            name: sub ? sub.name : cat.name,
            status: status,
            timestamp: ts,
          };
          if (status === STATUS_CROSSED) row.hasCrossed = true;
          const mapKey = cat.id + '::' + key;
          let oor = false;
          if (ts && status !== STATUS_EMPTY && settings.outOfRangeHighlight) {
            oor = isOutOfRange(date, hourStr, ts);
          }
          row.entryOorMap[mapKey] = { oor };
          if (ts) {
            if (row._latestTs === null || ts > row._latestTs) row._latestTs = ts;
          }
        });
      });

      // 汇总 noteOor 与 timeOor
      if (meta.noteTimestamp && (meta.note || '').trim().length > 0 && settings.outOfRangeHighlight) {
        row.noteOor = isOutOfRange(date, hourStr, meta.noteTimestamp);
      }
      if (meta.noteTimestamp) {
        if (row._latestTs === null || meta.noteTimestamp > row._latestTs) row._latestTs = meta.noteTimestamp;
      }
      if (row._latestTs && settings.outOfRangeHighlight) {
        row.timeOor = isOutOfRange(date, hourStr, row._latestTs);
      }
      hours.push(row);
    }
    return hours;
  }

  // ===== Rendering =====
  function renderHistoryList(startStr, endStr) {
    const dates = getDateRange(startStr, endStr);
    const list = document.getElementById('history-list');
    const emptyState = document.getElementById('empty-state');

    // Update summary
    const totalDays = dates.length;
    let totalFilled = 0;
    let totalPossible = 0;
    const analyses = dates.map(d => {
      const a = analyzeDate(d);
      totalFilled += a.filledStatuses;
      totalPossible += a.totalStatuses;
      return a;
    });
    const overallRate = totalPossible > 0 ? Math.round((totalFilled / totalPossible) * 100) : 0;

    document.getElementById('summary-date').textContent = `${startStr} 至 ${endStr}`;
    document.getElementById('summary-days').textContent = `${totalDays} 天`;
    document.getElementById('summary-rate').textContent = `${overallRate}%`;

    if (dates.length === 0 || totalFilled === 0) {
      list.innerHTML = '';
      list.appendChild(emptyState);
      emptyState.style.display = '';
      emptyState.querySelector('p').textContent = totalFilled === 0 ? '所选日期范围内无记录' : '请选择日期范围';
      return;
    }

    emptyState.style.display = 'none';
    list.innerHTML = '';

    analyses.forEach(a => {
      const card = document.createElement('div');
      card.className = 'day-card';
      if (!a.hasData) card.classList.add('no-data');

      const rateColor = a.completeRate >= 80 ? '#2e7d32' : a.completeRate >= 50 ? '#ed6c02' : '#c62828';
      const rateBar = document.createElement('div');
      rateBar.className = 'rate-bar';
      rateBar.innerHTML = `<div class="rate-fill" style="width:${a.completeRate}%;background:${rateColor};"></div>`;

      const header = document.createElement('div');
      header.className = 'day-card-header';
      header.innerHTML = `
        <span class="day-date">${getFullDateLabel(a.date)}</span>
        <span class="day-rate" style="color:${rateColor}">${a.completeRate}%</span>
      `;

      const stats = document.createElement('div');
      stats.className = 'day-card-stats';
      stats.innerHTML = `
        <span>已填: ${a.filledHours}/${a.totalHours} 小时</span>
        <span>状态: ${a.filledStatuses}/${a.totalStatuses}</span>
      `;

      const actions = document.createElement('div');
      actions.className = 'day-card-actions';
      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn btn-sm';
      viewBtn.textContent = '查看详情';
      viewBtn.addEventListener('click', () => showDayDetail(a.date));

      const exportBtn = document.createElement('button');
      exportBtn.className = 'btn btn-sm btn-outline';
      exportBtn.textContent = '导出PDF';
      exportBtn.addEventListener('click', () => exportSingleDay(a.date));

      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn btn-sm btn-danger';
      clearBtn.textContent = '清除';
      clearBtn.addEventListener('click', () => {
        showDialog('清除记录', `确定要清除 ${a.date} 的记录吗？`, () => {
          delete records[a.date];
          saveRecords();
          renderHistoryList(startStr, endStr);
        });
      });

      actions.appendChild(viewBtn);
      actions.appendChild(exportBtn);
      actions.appendChild(clearBtn);

      card.appendChild(header);
      card.appendChild(stats);
      card.appendChild(rateBar);
      card.appendChild(actions);

      list.appendChild(card);
    });
  }

  // 历史界面「查看详情」改为跳转到主界面编辑当天记录（直接编辑而非只读模态）。
  // 跨页传参双保险：① URL ?date=YYYY-MM-DD（主路径，刷新也不丢）② sessionStorage（兼容 iOS/PWA 后台切换）。
  function showDayDetail(date) {
    if (!date) return;
    try {
      window.sessionStorage.setItem('history_target_date', date);
    } catch (e) {}
    // 同步保存用户当前修改，防止 PWA 回跳时未保存的状态丢失
    try { saveRecordsSync(); saveSettingsSync(); } catch (e) {}
    const url = new URL('index.html', window.location.href);
    url.searchParams.set('date', date);
    window.location.href = url.toString();
  }

  // ===== PDF Export =====
  // Build PDF table header + <colgroup> with explicit per-column pixel widths
  // (required for WebKit / Safari printing to never squish columns)
  // Build PDF table header + <colgroup> with explicit per-column pixel widths.
  // Columns are PROPORTIONALLY scaled to fit within `maxWidth` (px) so the table
  // is natively the right size — NO CSS zoom/transform needed. This is the only
  // approach that works reliably on iOS Safari print-to-PDF.
  function buildPDFTableHeader(maxWidth) {
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
    const headerRows = hasParents ? 3 : 2;

    // Flatten all columns with explicit pixel widths (same logic as app.js)
    const cw = (settings && settings.columnWidths) || {};
    const defW = (settings && settings.defaultColWidth) || 50;
    const rawWidths = [];
    rawWidths.push(cw.hour || 75);
    orderedCats.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
      subs.forEach(sub => {
        const k = cat.id + '_' + sub.id;
        rawWidths.push(cw[k] || defW);
      });
    });
    rawWidths.push(cw.note || 120);
    rawWidths.push(cw.time || 80);

    // ---- KEY FIX: scale columns natively to fit page width ----
    const target = maxWidth || 1020;
    const rawTotal = rawWidths.reduce((a, b) => a + b, 0);
    let fitScale = 1;
    if (rawTotal > target) {
      fitScale = target / rawTotal;
    } else if (rawTotal < target * 0.65) {
      fitScale = Math.min(target / rawTotal, 1.3);
    }
    const colWidths = rawWidths.map(w => Math.round(w * fitScale));
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    let colgroup = '<colgroup>';
    colWidths.forEach(w => { colgroup += `<col style="width:${w}px">`; });
    colgroup += '</colgroup>';

    const noWrapBase = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;word-break:normal;overflow-wrap:normal;';

    // Row 1: hour + parent headers (or cat headers) + note + time
    let row1 = '<tr>';
    row1 += `<th rowspan="${headerRows}" style="border:1px solid #333;padding:7px 8px;background:#e8f0fe;color:#1976d2;font-weight:700;text-align:left;font-size:14px;${noWrapBase}">时间</th>`;
    if (hasParents) {
      groups.forEach((g, gi) => {
        let colCount = 0;
        g.cats.forEach(c => {
          const sc = c.subStatuses ? c.subStatuses.length : 0;
          colCount += sc > 0 ? sc : 1;
        });
        const div = gi > 0 ? 'border-left:3px solid #1976d2;' : '';
        const bg = g.parent.color || '#e8f0fe';
        row1 += `<th colspan="${colCount}" style="border:1px solid #333;padding:7px 5px;background:${bg};font-weight:700;font-size:13px;color:#1565c0;text-align:center;${div}${noWrapBase}">${g.parent.name}</th>`;
      });
    } else {
      orderedCats.forEach((cat) => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
        const bg = cat.color || '#e8f0fe';
        row1 += `<th colspan="${subs.length}" style="border:1px solid #333;padding:7px 5px;background:${bg};font-weight:700;font-size:13px;${noWrapBase}">${cat.name}</th>`;
      });
    }
    row1 += `<th rowspan="${headerRows}" style="border:1px solid #333;padding:7px;background:#e8f0fe;font-weight:700;font-size:13px;${noWrapBase}">Note</th>`;
    row1 += `<th rowspan="${headerRows}" style="border:1px solid #333;padding:7px;background:#e8f0fe;font-weight:700;font-size:13px;${noWrapBase}">填入</th>`;
    row1 += '</tr>';

    // Row 2: category headers (only if has parents)
    let row2 = '';
    if (hasParents) {
      row2 = '<tr>';
      orderedCats.forEach((cat, i) => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
        const prevCat = i > 0 ? orderedCats[i - 1] : null;
        const div = (i > 0 && effPid(cat) !== effPid(prevCat)) ? 'border-left:3px solid #1976d2;' : '';
        const bg = cat.color || '#e8f0fe';
        row2 += `<th colspan="${subs.length}" style="border:1px solid #333;padding:5px 4px;background:${bg};font-weight:bold;font-size:12px;${div}${noWrapBase}">${cat.name}</th>`;
      });
      row2 += '</tr>';
    }

    // Bottom row: sub-status headers
    let subRow = '<tr>';
    orderedCats.forEach((cat, i) => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: '' }];
      const prevCat = i > 0 ? orderedCats[i - 1] : null;
      subs.forEach((sub, subi) => {
        const div = (subi === 0 && i > 0 && hasParents && effPid(cat) !== effPid(prevCat)) ? 'border-left:3px solid #1976d2;' : '';
        subRow += `<th style="border:1px solid #333;padding:5px 3px;font-size:11px;background:#f0f4f8;color:#555;font-weight:500;${div}${noWrapBase}">${sub.name || '●'}</th>`;
      });
    });
    subRow += '</tr>';

    let thead = '<thead>' + row1;
    if (hasParents) thead += row2;
    thead += subRow + '</thead>';

    return { thead, colgroup, totalWidth, orderedCats, hasParents, headerRows, effPid, noWrapBase };
  }

  // Build print CSS for A4 landscape. NO zoom/transform — the table's column
  // widths are already natively scaled by buildPDFTableHeader to fit the page.
  // This is the only approach that works reliably on iOS Safari print-to-PDF.
  function buildPrintCSSBase(totalWidth) {
    return {
      headExtra:
        '<meta name="viewport" content="width=1200,initial-scale=1">' +
        '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
      styleTag: `<style>
@page { size: 297mm 210mm; margin: 8mm; }
@page :first { size: 297mm 210mm; margin: 8mm; }
@page :left  { size: 297mm 210mm; margin: 8mm; }
@page :right { size: 297mm 210mm; margin: 8mm; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #333; font-family: -apple-system, "Microsoft YaHei", BlinkMacSystemFont, "Segoe UI", sans-serif; }
html { width: 297mm; }
body { width: 297mm; padding: 8mm; }
h1 { font-size: 20px; margin: 0 0 4px 0; text-align: center; }
.subtitle { color: #666; font-size: 13px; margin: 0 0 12px 0; text-align: center; }
.pdf-holder { width: ${totalWidth}px; margin: 0 auto; }
.day-page { width: 100%; margin: 0 auto; padding: 0; }
.day-page + .day-page { margin-top: 0; }
.day-page-header { font-size: 15px; font-weight: bold; margin: 0 auto 8px auto; padding: 5px 10px; background: #e3f2fd; border-radius: 4px; display: table; }
.day-page-date { color: #1565c0; }
.pdf-wrap { width: ${totalWidth}px; }
table.pdf-table { border-collapse: separate; border-spacing: 0; width: ${totalWidth}px; table-layout: fixed; font-size: 13px; }
table.pdf-table th, table.pdf-table td {
  border: 1px solid #333;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  word-break: normal; overflow-wrap: normal;
}
.note-cell { white-space: normal !important; word-break: break-word !important; }
.footer { margin-top: 14px; font-size: 11px; color: #888; text-align: center; width: 100%; }
@media print {
  @page { size: 297mm 210mm; margin: 8mm; }
  html { width: 297mm !important; }
  body { width: 297mm !important; padding: 8mm !important; }
  .day-page { page-break-after: always; break-after: page; }
  .day-page:last-child { page-break-after: auto; break-after: auto; }
  .noprint { display: none !important; }
}
</style>`,
    };
  }

  function buildPDFHTML(date, hours) {
    const dateObj = new Date(date + 'T00:00:00Z');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dateLabel = `${date} ${weekdays[dateObj.getUTCDay()]}`;
    const { thead: pdfThead, colgroup, totalWidth, orderedCats, hasParents, headerRows, effPid, noWrapBase } = buildPDFTableHeader(1020);
    const css = buildPrintCSSBase(totalWidth);
    // ===== 用户自定义颜色值注入到打印 HTML（保证 PDF 生效）=====
    const highlightColor = settings.highlightColor || '#ffeb3b';
    const badBorderColor = settings.rowBadBorderColor || '#d32f2f';
    const badBorderStyle = `box-shadow: inset 0 0 0 2px ${badBorderColor};`;

    let rowsHTML = '';
    hours.forEach(row => {
      const rowBg = parseInt(row.hour) % 2 === 0 ? '#fafbfc' : '#ffffff';
      const rowIsBad = row.hasCrossed || row.noteHasText;
      const rowBadBorder = rowIsBad ? badBorderStyle : '';

      let statusCells = '';
      orderedCats.forEach((cat, ci) => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
        const prevCat = ci > 0 ? orderedCats[ci - 1] : null;
        const isNewGroup = hasParents && ci > 0 && effPid(cat) !== effPid(prevCat);
        subs.forEach((sub, subi) => {
          const key = sub.id;
          const ed = row.entries[cat.id] ? row.entries[cat.id][key] : null;
          const status = ed ? ed.status : '';
          const mapKey = cat.id + '::' + key;
          const oorInfo = row.entryOorMap && row.entryOorMap[mapKey];
          const oorBg = oorInfo && oorInfo.oor ? `background:${highlightColor};` : '';
          const div = (subi === 0 && isNewGroup) ? 'border-left:3px solid #1976d2;' : '';
          const color = status === '✓' ? '#2e7d32' : status === '✗' ? '#c62828' : '#ccc';
          statusCells += `<td style="border:1px solid #333;padding:6px 3px;text-align:center;font-size:14px;color:${color};${oorBg}${div}${rowBadBorder}${noWrapBase}">${status || ''}</td>`;
        });
      });

      const timeStr = _getLatestTimeString(row);
      const note = (row.note || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r?\n/g, '<br>');
      const hourBg = row.timeOor ? `background:${highlightColor};` : '';
      const noteBg = row.noteOor ? `background:${highlightColor};` : '';
      const timeBg = row.timeOor ? `background:${highlightColor};` : '';

      rowsHTML += `<tr style="background:${rowBg};">
        <td style="border:1px solid #333;padding:6px 8px;font-weight:bold;font-size:13px;color:#1976d2;${hourBg}${rowBadBorder}${noWrapBase}">${row.hour}:00</td>
        ${statusCells}
        <td class="note-cell" style="border:1px solid #333;padding:6px;font-size:13px;line-height:1.5;word-break:break-word;white-space:pre-wrap;vertical-align:top;${noteBg}${rowBadBorder}">${note}</td>
        <td style="border:1px solid #333;padding:6px;font-size:12px;color:#666;text-align:right;${timeBg}${rowBadBorder}${noWrapBase}">${timeStr}</td>
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
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 500); }<\/script>
</body></html>`;
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
    return latest ? getTimestampString(latest) : '';
  }

  function _drawDayToCanvas(date, data, showTitle, titleText, subtitleText) {
    const meta = _getPDFTableMeta();
    const { orderedCats, colWidths, colHeaders, totalWidth, hasParents, groups, effPid } = meta;

    // Layout constants (in canvas pixels, scale=2 for sharpness)
    const S = 2; // scale factor
    const padX = 6 * S, padY = 5 * S;
    const headerH = (hasParents ? 3 : 2) * (24 * S) + 4 * S;
    const baseRowH = 28 * S;          // 单行最小高度
    const noteLineH = 14 * S;         // note 文字行高（对应字号 11S，行距 1.27）
    const noteFontSize = 11 * S;

    // ===== 第一步：预处理每行 Note 文本 wrap 后的行数 → 决定该行真实高度 rh =====
    const tmpCanvas = document.createElement('canvas');
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.font = `${noteFontSize}px -apple-system, "Microsoft YaHei", sans-serif`;
    const noteColW = colWidths[colWidths.length - 2];
    const noteInnerW = noteColW * S - 2 * padX;

    function wrapNoteText(text) {
      if (!text) return [];
      const lines = [];
      const paragraphs = String(text).split(/\r?\n/);
      paragraphs.forEach(para => {
        if (!para) { lines.push(''); return; }
        let cur = '';
        for (let i = 0; i < para.length; i++) {
          const ch = para[i];
          const tryStr = cur + ch;
          if (tmpCtx.measureText(tryStr).width > noteInnerW && cur) {
            lines.push(cur);
            cur = ch;
          } else {
            cur = tryStr;
          }
        }
        if (cur) lines.push(cur);
      });
      return lines;
    }

    const rowHeights = [];
    const rowNoteLines = [];
    data.forEach(row => {
      const lines = wrapNoteText(row.note || '');
      rowNoteLines.push(lines);
      const noteNeeded = 2 * padY + Math.max(1, lines.length) * noteLineH;
      rowHeights.push(Math.max(baseRowH, noteNeeded));
    });

    const tableH = headerH + rowHeights.reduce((s, h) => s + h, 0);

    let topH = 0;
    if (showTitle) topH += 30 * S + 14 * S;
    topH += 22 * S + 6 * S;
    const totalCanvasW = totalWidth * S + 20 * S;
    const totalCanvasH = topH + tableH + 10 * S;

    const canvas = document.createElement('canvas');
    canvas.width = totalCanvasW;
    canvas.height = totalCanvasH;
    const ctx = canvas.getContext('2d');
    ctx.scale(1, 1);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ===== 用户自定义异常高亮色 & 异常行边框色（PDF 里也要真实生效）=====
    const highlightColor = settings.highlightColor || '#ffeb3b';
    const badBorderColor = settings.rowBadBorderColor || '#d32f2f';

    let y = 6 * S;

    if (showTitle && titleText) {
      ctx.fillStyle = '#333';
      ctx.font = `bold ${18 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(titleText, canvas.width / 2, y + 16 * S);
      y += 24 * S;
    }
    if (showTitle && subtitleText) {
      ctx.fillStyle = '#666';
      ctx.font = `${11 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(subtitleText, canvas.width / 2, y + 12 * S);
      y += 16 * S;
    }

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

    const tableX = 10 * S;
    let headerY = y;
    const r1H = 24 * S;
    const defaultHeaderBg = '#e8f0fe';
    const defaultSubBg = '#f0f4f8';

    // "时间" cell
    ctx.fillStyle = defaultHeaderBg;
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
      groups.forEach((g, gi) => {
        let colCount = 0;
        g.cats.forEach(c => {
          const sc = c.subStatuses ? c.subStatuses.length : 0;
          colCount += sc > 0 ? sc : 1;
        });
        let groupW = 0;
        for (let k = 0; k < colCount; k++) groupW += colWidths[colIdx + k] * S;
        ctx.fillStyle = g.parent.color || defaultHeaderBg;
        if (!g.parent.color && gi > 0) { ctx.fillStyle = '#bbdefb'; }
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
      orderedCats.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
        let catW = 0;
        for (let k = 0; k < subs.length; k++) catW += colWidths[colIdx + k] * S;
        ctx.fillStyle = cat.color || defaultHeaderBg;
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

    const noteW = colWidths[colWidths.length - 2] * S;
    const timeW = colWidths[colWidths.length - 1] * S;
    ctx.fillStyle = defaultHeaderBg;
    ctx.fillRect(cx, headerY, noteW, (hasParents ? 3 : 2) * r1H + 4 * S);
    ctx.strokeRect(cx, headerY, noteW, (hasParents ? 3 : 2) * r1H + 4 * S);
    ctx.fillStyle = '#333';
    ctx.font = `bold ${11 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Note', cx + noteW / 2, headerY + ((hasParents ? 3 : 2) * r1H + 4 * S) / 2 + 4 * S);
    cx += noteW;
    ctx.fillStyle = defaultHeaderBg;
    ctx.fillRect(cx, headerY, timeW, (hasParents ? 3 : 2) * r1H + 4 * S);
    ctx.strokeRect(cx, headerY, timeW, (hasParents ? 3 : 2) * r1H + 4 * S);
    ctx.fillText('填入', cx + timeW / 2, headerY + ((hasParents ? 3 : 2) * r1H + 4 * S) / 2 + 4 * S);

    headerY += r1H;

    if (hasParents) {
      cx = tableX + colWidths[0] * S;
      colIdx = 1;
      orderedCats.forEach((cat, i) => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
        let catW = 0;
        for (let k = 0; k < subs.length; k++) catW += colWidths[colIdx + k] * S;
        ctx.fillStyle = cat.color || defaultHeaderBg;
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

    cx = tableX + colWidths[0] * S;
    colIdx = 1;
    orderedCats.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: '' }];
      subs.forEach(sub => {
        const w = colWidths[colIdx] * S;
        ctx.fillStyle = defaultSubBg;
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

    let dataY = headerY + r1H + 4 * S;

    data.forEach((row, rIdx) => {
      const rh = rowHeights[rIdx];
      const noteLines = rowNoteLines[rIdx];
      const rowBg = parseInt(row.hour) % 2 === 0 ? '#fafbfc' : '#ffffff';
      const rowIsBad = row.hasCrossed || row.noteHasText;

      // Hour cell 背景 + 文字
      ctx.fillStyle = rowBg;
      ctx.fillRect(tableX, dataY, colWidths[0] * S, rh);
      ctx.fillStyle = '#1976d2';
      ctx.font = `bold ${11 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(row.hour + ':00', tableX + colWidths[0] * S / 2, dataY + Math.min(rh / 2, baseRowH / 2) + 4 * S);
      if (row.timeOor) {
        ctx.fillStyle = highlightColor;
        ctx.fillRect(tableX, dataY, colWidths[0] * S, rh);
        ctx.fillStyle = '#1976d2';
        ctx.fillText(row.hour + ':00', tableX + colWidths[0] * S / 2, dataY + Math.min(rh / 2, baseRowH / 2) + 4 * S);
      }

      let dx = tableX + colWidths[0] * S;

      colIdx = 1;
      orderedCats.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
        subs.forEach(sub => {
          const w = colWidths[colIdx] * S;
          const mapKey = cat.id + '::' + (sub ? sub.id : '_main');
          const oorInfo = row.entryOorMap[mapKey];
          const ed = row.entries[cat.id] ? row.entries[cat.id][sub ? sub.id : '_main'] : null;
          const status = ed ? ed.status : '';
          ctx.fillStyle = rowBg;
          ctx.fillRect(dx, dataY, w, rh);
          if (oorInfo && oorInfo.oor) {
            ctx.fillStyle = highlightColor;
            ctx.fillRect(dx + 1, dataY + 1, w - 2, rh - 2);
          }
          const color = status === '✓' ? '#2e7d32' : status === '✗' ? '#c62828' : '#ccc';
          ctx.fillStyle = color;
          ctx.font = `bold ${12 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
          ctx.textAlign = 'center';
          if (status) ctx.fillText(status, dx + w / 2, dataY + Math.min(rh / 2, baseRowH / 2) + 4 * S);
          dx += w;
          colIdx++;
        });
      });

      const nw = colWidths[colWidths.length - 2] * S;
      ctx.fillStyle = rowBg;
      ctx.fillRect(dx, dataY, nw, rh);
      if (row.noteOor) {
        ctx.fillStyle = highlightColor;
        ctx.fillRect(dx + 1, dataY + 1, nw - 2, rh - 2);
      }
      ctx.fillStyle = '#333';
      ctx.font = `${noteFontSize}px -apple-system, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      const lines = noteLines || [];
      for (let li = 0; li < lines.length; li++) {
        const lineY = dataY + padY + (li + 1) * noteLineH;
        ctx.fillText(lines[li], dx + padX, lineY);
      }

      const tw = colWidths[colWidths.length - 1] * S;
      ctx.fillStyle = rowBg;
      ctx.fillRect(dx, dataY, tw, rh);
      if (row.timeOor) {
        ctx.fillStyle = highlightColor;
        ctx.fillRect(dx + 1, dataY + 1, tw - 2, rh - 2);
      }
      ctx.fillStyle = '#666';
      ctx.font = `${10 * S}px -apple-system, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'right';
      const timeStr = _getLatestTimeString(row);
      ctx.fillText(timeStr, dx + tw - padX, dataY + Math.min(rh / 2, baseRowH / 2) + 3 * S);

      // 绘制整行网格边框
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1 * S;
      let gridX = tableX;
      for (let i = 0; i < colWidths.length; i++) {
        const ww = colWidths[i] * S;
        ctx.strokeRect(gridX, dataY, ww, rh);
        gridX += ww;
      }

      // ===== 异常行描边：hasCrossed || noteHasText → 在整行外描 2px badBorderColor =====
      if (rowIsBad) {
        ctx.save();
        ctx.strokeStyle = badBorderColor;
        ctx.lineWidth = 2 * S;
        const halfLW = S;
        ctx.strokeRect(tableX + halfLW, dataY + halfLW, totalWidth * S - 2 * halfLW, rh - 2 * halfLW);
        ctx.restore();
      }

      dataY += rh;
    });

    return canvas;
  }

  // =================================================================
  // 辅助：把超大尺寸 canvas 按比例缩小到不超过设备安全上限，避免
  // iOS Safari / 部分 Chrome GPU 进程在 toDataURL 阶段直接报错。
  // =================================================================
  function _resizeCanvasToSafe(canvas) {
    const SAFE_AREA = 16 * 1000 * 1000;
    const SAFE_EDGE = 4096;
    const W = canvas.width, H = canvas.height;
    const maxEdge = Math.max(W, H);
    const area = W * H;
    let scale = 1;
    if (maxEdge > SAFE_EDGE) scale = Math.min(scale, SAFE_EDGE / maxEdge);
    if (area > SAFE_AREA) scale = Math.min(scale, Math.sqrt(SAFE_AREA / area));
    if (scale >= 0.999) return canvas;
    const nW = Math.max(1, Math.round(W * scale));
    const nH = Math.max(1, Math.round(H * scale));
    const off = document.createElement('canvas');
    off.width = nW;
    off.height = nH;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(canvas, 0, 0, nW, nH);
    return off;
  }

  function _canvasToBestDataURL(canvas, quality) {
    let fmt = 'JPEG', url;
    try {
      url = canvas.toDataURL('image/jpeg', quality);
    } catch (eJpeg) {
      fmt = 'PNG';
      try {
        url = canvas.toDataURL('image/png');
      } catch (ePng) {
        try {
          url = canvas.toDataURL('image/jpeg', 0.85);
          fmt = 'JPEG';
        } catch (_) {
          throw ePng;
        }
      }
    }
    return { fmt, url };
  }

  async function exportRangeViaCanvasPDF(dates) {
    if (!window.jspdf || !jspdf.jsPDF) {
      const msg = 'PDF 组件未加载，请检查网络或刷新页面后再试';
      console.error('[PDF] jsPDF 缺失: window.jspdf=', window.jspdf);
      showSnackbar(msg);
      throw new Error(msg);
    }
    const { jsPDF } = jspdf;
    const PAGE_W_MM = 297, PAGE_H_MM = 210, MARGIN_MM = 8;
    const CONTENT_W_MM = PAGE_W_MM - 2 * MARGIN_MM;
    const CONTENT_H_MM = PAGE_H_MM - 2 * MARGIN_MM;

    let pdf;
    try {
      pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    } catch (initErr) {
      console.error('[PDF] jsPDF 初始化失败:', initErr);
      showSnackbar('PDF 初始化失败: ' + (initErr && initErr.message ? initErr.message : '未知错误'));
      throw initErr;
    }

    let total = 0, filled = 0, failedDays = 0;
    const errors = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      let data = null;
      try {
        data = collectDateData(date);
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
      } catch (dataErr) {
        failedDays++;
        errors.push(`${date}: 数据加载失败 (${dataErr.message || dataErr})`);
        console.error(`[PDF] ${date} 数据收集失败:`, dataErr);
        continue;
      }

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

      try {
        const rawCanvas = _drawDayToCanvas(date, data, showTitle, titleText, subtitleText);
        const canvas = _resizeCanvasToSafe(rawCanvas);

        if (i > 0) {
          try { pdf.addPage(); } catch (apErr) {
            throw new Error('新增 PDF 页面失败: ' + (apErr && apErr.message || apErr));
          }
        }

        const ratio = canvas.width / canvas.height;
        let drawWmm = CONTENT_W_MM;
        let drawHmm = drawWmm / ratio;
        if (drawHmm > CONTENT_H_MM) {
          drawHmm = CONTENT_H_MM;
          drawWmm = drawHmm * ratio;
        }
        const x = MARGIN_MM + (CONTENT_W_MM - drawWmm) / 2;
        const y = MARGIN_MM + (CONTENT_H_MM - drawHmm) / 2;

        const { fmt, url } = _canvasToBestDataURL(canvas, 0.92);

        try {
          pdf.addImage(url, fmt, x, y, drawWmm, drawHmm, undefined, 'FAST');
        } catch (imgErr) {
          try {
            const pngFallback = fmt === 'PNG' ? url : canvas.toDataURL('image/png');
            pdf.addImage(pngFallback, 'PNG', x, y, drawWmm, drawHmm, undefined, 'MEDIUM');
          } catch (imgErr2) {
            try {
              pdf.setTextColor(198, 40, 40);
              pdf.setFontSize(11);
              pdf.text(`[渲染失败] ${date}: ${imgErr2 && imgErr2.message || imgErr2 || 'addImage error'}`, MARGIN_MM + 2, MARGIN_MM + 10);
            } catch (_) {}
            throw new Error('页面图片写入失败: ' + (imgErr2 && imgErr2.message || imgErr2));
          }
        }
      } catch (pageErr) {
        failedDays++;
        errors.push(`${date}: ${pageErr.message || pageErr}`);
        console.error(`[PDF] ${date} 页面生成失败:`, pageErr);
        if (i > 0) {
          try {
            pdf.setTextColor(198, 40, 40);
            pdf.setFontSize(11);
            pdf.text(`[渲染失败] ${date}: ${pageErr.message || pageErr}`, MARGIN_MM + 2, MARGIN_MM + 10);
          } catch (_) {}
          try { pdf.addPage(); } catch (_) {}
        } else {
          try {
            pdf.setTextColor(198, 40, 40);
            pdf.setFontSize(11);
            pdf.text(`[首页渲染失败] ${date}: ${pageErr.message || pageErr}`, MARGIN_MM + 2, MARGIN_MM + 10);
          } catch (_) {}
        }
      }
    }

    const fileDate = (dates.length > 1 ? `${dates[0]}-${dates[dates.length - 1]}` : dates[0]);
    try {
      pdf.save(`SCC-Patrol-Record_${fileDate}.pdf`);
    } catch (saveErr) {
      console.error('[PDF] save 失败:', saveErr);
      showSnackbar('PDF 保存失败: ' + (saveErr && saveErr.message ? saveErr.message : saveErr));
      throw saveErr;
    }

    if (failedDays === 0) {
      showSnackbar(`PDF 已生成下载（${dates.length} 天）`);
    } else {
      const hint = errors.length ? errors.slice(0, 2).join('；') : '';
      showSnackbar(`PDF 已下载，但 ${failedDays}/${dates.length} 天渲染失败: ${hint}`);
    }
  }

  function exportSingleDay(date) {
    showSnackbar('正在生成 PDF...');
    exportRangeViaCanvasPDF([date]).catch(err => {
      console.error(err);
      showSnackbar('导出失败: ' + (err && err.message ? err.message : err));
    });
  }

  function exportRange(startStr, endStr) {
    const dates = getDateRange(startStr, endStr);
    showSnackbar(`正在生成 PDF (${dates.length} 天)...`);
    exportRangeViaCanvasPDF(dates).catch(err => {
      console.error(err);
      showSnackbar('导出失败: ' + (err && err.message ? err.message : err));
    });
  }

  // Dead code kept for reference; replaced by buildPDFTableHeader
  function buildCatHeaders() {
    let html = '';
    categories.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
      html += `<th colspan="${subs.length}" style="border:1px solid #333;padding:4px;background:#e8f0fe;font-weight:bold;font-size:10px;">${cat.name}</th>`;
    });
    return html;
  }

  function buildSubHeaders() {
    let html = '';
    categories.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: '' }];
      subs.forEach(sub => {
        html += `<th style="border:1px solid #333;padding:3px;font-size:9px;background:#f5f5f5;">${sub.name || '●'}</th>`;
      });
    });
    return html;
  }

  // ===== Dialog =====
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

  // ===== 一键导出习惯：相对日期选择 =====
  // 返回数组每项：{ value:'YYYY-MM-DD' 用于当下真实日期选择, label:'本周一 (mm-dd)',
  //                 relKey:'rel:this_week_monday' 用于存到习惯(同步今天动态计算) }
  function buildRelativeDateOptions(refNow) {
    const now = refNow || getNow();
    // 本周一 (GMT)
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
    const mondayThisWeek = new Date(now);
    mondayThisWeek.setUTCDate(now.getUTCDate() - ((dayOfWeek + 6) % 7));
    mondayThisWeek.setUTCHours(0, 0, 0, 0);

    // 上上周一 = 本周一 - 14天
    const earliest = new Date(mondayThisWeek);
    earliest.setUTCDate(mondayThisWeek.getUTCDate() - 14);

    const weekdayNames = ['一', '二', '三', '四', '五', '六', '日'];
    const weekdayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const options = [];
    const todayStr = getGMTDateString(now);

    let d = new Date(earliest);
    while (d <= now) {
      const dateStr = getGMTDateString(d);
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const dow = d.getUTCDay(); // 0=Sun
      const dowIdx = (dow + 6) % 7; // 0=Mon
      const dayName = weekdayNames[dowIdx];

      // 计算是第几周
      const diffDays = Math.round((d - mondayThisWeek) / (24 * 60 * 60 * 1000));
      let prefix, relWeekPrefix;
      if (dateStr === todayStr) {
        prefix = '今天';
        relWeekPrefix = 'today';
      } else if (diffDays >= 0) {
        prefix = '本周';
        relWeekPrefix = 'this_week';
      } else if (diffDays >= -7) {
        prefix = '上周';
        relWeekPrefix = 'last_week';
      } else {
        prefix = '上上周';
        relWeekPrefix = 'two_weeks_ago';
      }

      const relKey = prefix === '今天'
        ? 'rel:today'
        : `rel:${relWeekPrefix}_${weekdayKeys[dowIdx]}`;

      const label = `${prefix}${dayName} (${mm}-${dd})`;
      options.push({ value: dateStr, label, relKey });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return options;
  }

  // 根据习惯(rel:xxx 或 旧的绝对日期) 反解为一个"真实 YYYY-MM-DD"，并在当前 options 中找匹配项；找不到 fallback 默认
  function resolveHabitToOptionValue(habit, options, fallbackValue, refNow) {
    if (!habit) return fallbackValue;

    // 优先：相对键（rel:xxx），按今天动态计算 -> 找到对应真实日期 option
    if (typeof habit === 'string' && habit.startsWith('rel:')) {
      const realDate = resolveRelativeKeyToDate(habit, refNow || getNow());
      if (realDate) {
        const ds = getGMTDateString(realDate);
        if (options.some(o => o.value === ds)) return ds;
      }
      // relKey 合法但今天算出的日期超出下拉范围(如上周一还没到本周的下拉)时：fallback 默认值
      return fallbackValue;
    }
    // 兼容老习惯(绝对日期字符串):如果它还在当前下拉范围内(即近20天内), 直接用它, 否则 fallback
    if (typeof habit === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(habit)) {
      if (options.some(o => o.value === habit)) return habit;
    }
    return fallbackValue;
  }

  // rel:xxx -> Date (GMT 0:0:0)
  function resolveRelativeKeyToDate(relKey, refNow) {
    const now = refNow || getNow();
    if (!relKey || typeof relKey !== 'string' || !relKey.startsWith('rel:')) return null;
    const key = relKey.slice(4); // 'rel:'.length
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (key === 'today') return today;

    // key like: this_week_monday, last_week_friday, two_weeks_ago_sunday
    const parts = key.split('_');
    // parts e.g. ['this','week','monday'] / ['last','week','tuesday'] / ['two','weeks','ago','sunday']
    let weekOffset = 0;
    let dowName = null;
    if (parts[0] === 'this' && parts[1] === 'week') { weekOffset = 0; dowName = parts[2]; }
    else if (parts[0] === 'last' && parts[1] === 'week') { weekOffset = -1; dowName = parts[2]; }
    else if (parts[0] === 'two' && parts[1] === 'weeks' && parts[2] === 'ago') { weekOffset = -2; dowName = parts[3]; }
    if (!dowName) return null;
    const dowMap = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
    const dow = dowMap[dowName];
    if (dow === undefined) return null;

    const dayOfWeekToday = today.getUTCDay(); // 0=Sun..6=Sat
    // 本周一: today - ((dayOfWeekToday + 6) % 7)
    const mondayOffset = -((dayOfWeekToday + 6) % 7);
    const targetMonday = new Date(today);
    targetMonday.setUTCDate(today.getUTCDate() + mondayOffset + weekOffset * 7);

    // 目标那一天 = targetMonday + dow-1 (因为 monday=1, offset=0 指周一自己)
    const extraDays = dow === 0 ? 6 : (dow - 1); // dow 0=Sunday -> 6 extra days
    const res = new Date(targetMonday);
    res.setUTCDate(targetMonday.getUTCDate() + extraDays);
    return res;
  }

  // 给定一个 option(来自 buildRelativeDateOptions)，如果它对应 rel，就存 rel；否则存绝对日期
  function habitFromOptionValue(val, options) {
    const opt = options.find(o => o.value === val);
    if (opt && opt.relKey) return opt.relKey; // 优先存 rel
    return val; // 兜底存绝对日期
  }

  function initQuickExportHabit() {
    const startSel = document.getElementById('quick-export-start');
    const endSel = document.getElementById('quick-export-end');
    const btn = document.getElementById('btn-quick-export');
    if (!startSel || !endSel || !btn) return;

    const now = getNow();
    const options = buildRelativeDateOptions(now);

    // 填充选项
    startSel.innerHTML = '';
    endSel.innerHTML = '';
    options.forEach(opt => {
      startSel.innerHTML += `<option value="${opt.value}">${opt.label}</option>`;
      endSel.innerHTML += `<option value="${opt.value}">${opt.label}</option>`;
    });

    // 从 settings 恢复上次选择（习惯）-> 相对键 rel:xxx 优先（同步今天动态计算）
    const savedStart = settings.quickExportStart;
    const savedEnd = settings.quickExportEnd;
    // 默认：上周二 ~ 本周三（或今天，如果本周三还未到）
    const dayOfWeek = now.getUTCDay();
    const mondayThisWeek = new Date(now);
    mondayThisWeek.setUTCDate(now.getUTCDate() - ((dayOfWeek + 6) % 7));
    const lastTue = new Date(mondayThisWeek);
    lastTue.setUTCDate(mondayThisWeek.getUTCDate() - 6); // 上周二
    const thisWed = new Date(mondayThisWeek);
    thisWed.setUTCDate(mondayThisWeek.getUTCDate() + 2); // 本周三
    const todayDate = new Date(now);
    todayDate.setUTCHours(0, 0, 0, 0);

    const defaultStart = getGMTDateString(lastTue);
    const defaultEnd = thisWed <= todayDate ? getGMTDateString(thisWed) : getGMTDateString(now);

    // 解析习惯 -> 当下真实的 option value
    const startVal = resolveHabitToOptionValue(savedStart, options, defaultStart, now);
    const endVal = resolveHabitToOptionValue(savedEnd, options, defaultEnd, now);

    startSel.value = startVal;
    endSel.value = endVal;
    // 如果 start/end 超界（今天以后），end 拉到今天
    if (!options.some(o => o.value === endSel.value)) endSel.value = getGMTDateString(now);
    if (!options.some(o => o.value === startSel.value)) startSel.value = options[0] ? options[0].value : defaultStart;

    // 确保 start <= end
    function validateRange() {
      if (startSel.value > endSel.value) {
        showSnackbar('起始日不能晚于结束日，已自动调整');
        startSel.value = endSel.value;
      }
    }
    startSel.addEventListener('change', validateRange);
    endSel.addEventListener('change', validateRange);

    // 选择改变时立即保存习惯到 localStorage（优先存相对键 rel:xxx，不存死日期）
    function saveQuickExportHabit() {
      settings.quickExportStart = habitFromOptionValue(startSel.value, options);
      settings.quickExportEnd = habitFromOptionValue(endSel.value, options);
      try {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
      } catch (e) {}
    }
    // 初始化时就刷新一次 habit（把之前的死日期替换为 rel；老用户自动升级到相对日期）
    try { saveQuickExportHabit(); } catch (e) {}

    startSel.addEventListener('change', saveQuickExportHabit);
    endSel.addEventListener('change', saveQuickExportHabit);

    // 导出按钮
    btn.addEventListener('click', () => {
      const start = startSel.value;
      const end = endSel.value;
      if (!start || !end) { showSnackbar('请选择日期范围'); return; }
      if (start > end) { showSnackbar('起始日不能晚于结束日'); return; }

      // 保存习惯到 settings（优先 rel，非绝对日期）
      settings.quickExportStart = habitFromOptionValue(start, options);
      settings.quickExportEnd = habitFromOptionValue(end, options);
      try {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
      } catch (e) {}

      const startLabel = startSel.options[startSel.selectedIndex].text;
      const endLabel = endSel.options[endSel.selectedIndex].text;
      showSnackbar(`正在导出: ${startLabel} 至 ${endLabel}`);
      setTimeout(() => exportRange(start, end), 500);
    });
  }

  // ===== Init =====
  // Helper: go back to main page with history.back() if possible (so pageshow fires on main)
  function _goBackToMain() {
    const rf = document.referrer || '';
    const rfFile = rf.split('/').pop().split('#')[0].split('?')[0];
    const canGoBack = (rfFile === 'index.html' || rfFile === 'settings.html' ||
                      rfFile === '' || rf.endsWith('/') || rf.endsWith('/Joy') ||
                      rf.endsWith('/Joy/'));
    if (canGoBack && typeof history.back === 'function') {
      history.back();
      setTimeout(() => {
        try {
          if (document.visibilityState !== 'hidden' && !window.__navingAway) {
            window.__navingAway = true;
            window.location.replace('index.html');
          }
        } catch (e) {}
      }, 350);
    } else {
      window.location.replace('index.html');
    }
  }

  function init() {
    document.getElementById('btn-back').addEventListener('click', () => {
      // 返回前保存一键导出习惯（优先存相对键 rel:xxx，不存死日期）
      const qs = document.getElementById('quick-export-start');
      const qe = document.getElementById('quick-export-end');
      if (qs && qe) {
        const opts = buildRelativeDateOptions(getNow());
        settings.quickExportStart = habitFromOptionValue(qs.value, opts);
        settings.quickExportEnd = habitFromOptionValue(qe.value, opts);
        try { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings)); } catch (e) {}
      }
      _goBackToMain();
    });

    const today = getTodayDate();
    const weekAgo = shiftDate(today, -6);
    document.getElementById('date-start').value = weekAgo;
    document.getElementById('date-end').value = today;

    // ===== sticky 布局：
    // 历史页沿用 page-level scroll（不是 dashboard wrapper 内滚动）：
    //   - --app-header-height  → sticky-top-controls.top 必须等于 app-header 高度（避免两个 sticky 控件重叠盖住 banner）
    //   - --thead-sticky-top   → 页面上如果有多行表头 table，sticky th.top 的 viewport base = top bars 总高（不被顶部控件挡住）
    function refreshTheadStickyOffset() {
      try {
        const header = document.querySelector('.app-header');
        const controls = document.getElementById('sticky-top-controls');
        let headerH = 0;
        let controlsH = 0;
        if (header && header.getBoundingClientRect) headerH = header.getBoundingClientRect().height;
        if (controls && controls.getBoundingClientRect) controlsH = controls.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--app-header-height', headerH + 'px');
        document.documentElement.style.setProperty('--thead-sticky-top', (headerH + controlsH) + 'px');
      } catch (e) {}
    }
    function scheduleSticky() {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        try {
          window.requestAnimationFrame(() => {
            refreshTheadStickyOffset();
            // 字体/控件高度变化兜底（同主页面）
            [50, 250, 1000].forEach(t => setTimeout(refreshTheadStickyOffset, t));
          });
          return;
        } catch (e) {}
      }
      setTimeout(refreshTheadStickyOffset, 0);
    }
    scheduleSticky();

    document.getElementById('btn-search').addEventListener('click', () => {
      const start = document.getElementById('date-start').value;
      const end = document.getElementById('date-end').value;
      if (!start || !end) { showSnackbar('请选择日期范围'); return; }
      if (start > end) { showSnackbar('起始日期不能晚于结束日期'); return; }
      renderHistoryList(start, end);
      scheduleSticky();
    });

    document.getElementById('btn-export-range').addEventListener('click', () => {
      const start = document.getElementById('date-start').value;
      const end = document.getElementById('date-end').value;
      if (!start || !end) { showSnackbar('请选择日期范围'); return; }
      if (start > end) { showSnackbar('起始日期不能晚于结束日期'); return; }
      showDialog('导出PDF', `确定要导出 ${start} 至 ${end} 的记录为 PDF？`, () => {
        exportRange(start, end);
      });
    });

    // ===== 一键导出习惯：相对日期选择（上上周一 ~ 今天）=====
    initQuickExportHabit();

    // Clear History — scope = 当前「查询起止日期」范围（用户在 date-start / date-end 之间选中的日期窗口，仅清除窗口内，窗口外保留）
    document.getElementById('btn-clear-history').addEventListener('click', () => {
      const start = document.getElementById('date-start').value;
      const end = document.getElementById('date-end').value;
      if (!start || !end) { showSnackbar('请先选择起止日期再执行清除'); return; }
      if (start > end) { showSnackbar('起始日期不能晚于结束日期'); return; }
      showDialog(
        `清除 ${start} ~ ${end} 的历史`,
        `确定要清除 ${start} 至 ${end}（含）的所有 SCC Patrol Record 数据吗？仅清除这个日期范围内的记录，其它日期数据完全保留；此操作不可恢复！类别设置将保留。`,
        () => {
          showDialog(
            '再次确认',
            `⚠️ 最后确认：永久删除 ${start} 到 ${end} 的历史记录，范围外的日期保留。确定继续？`,
            () => {
              let removedCount = 0;
              const dates = Object.keys(records || {});
              dates.forEach(d => {
                if (d && d >= start && d <= end) {
                  delete records[d];
                  removedCount += 1;
                }
              });
              saveRecords();
              showSnackbar(`✅ 已清除 ${removedCount} 天的记录（范围: ${start} ~ ${end}）`);
              // 直接重绘当前范围，不 reload 整页（避免查询条件 / 习惯选项 / 一键导出下拉状态丢失）
              try { renderHistoryList(start, end); } catch (e) { window.location.reload(); }
            });
        });
    });

    // Auto-load initial range
    renderHistoryList(weekAgo, today);
    scheduleSticky();
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleSticky); } catch (e) {}
    setInterval(scheduleSticky, 60 * 1000);

    let _resizeRaf = null;
    window.addEventListener('resize', () => {
      if (_resizeRaf) return;
      _resizeRaf = setTimeout(() => { _resizeRaf = null; scheduleSticky(); }, 120);
    }, { passive: true });
    if (typeof window !== 'undefined' && 'orientationchange' in window) {
      window.addEventListener('orientationchange', scheduleSticky, { passive: true });
    }

    // --------------------------------------------------------
    // When returning from settings via history.back:
    // re-read settings and re-render, so any changes are visible.
    // --------------------------------------------------------
    let _pendingReload = false;
    function scheduleReload() {
      if (_pendingReload) return;
      _pendingReload = true;
      setTimeout(() => {
        _pendingReload = false;
        try {
          settings = loadSettings();
          categories = loadCategories();
          records = loadRecords();
          // refresh quick-export dropdowns from settings（相对键 rel:xxx -> 今天对应真实日期）
          const now = getNow();
          const opts = buildRelativeDateOptions(now);
          const s = document.getElementById('quick-export-start');
          const e = document.getElementById('quick-export-end');
          if (s) {
            const dv = opts[0] ? opts[0].value : getGMTDateString(shiftDate(getGMTDateString(now), -6));
            s.value = resolveHabitToOptionValue(settings.quickExportStart, opts, dv, now);
            if (!opts.some(o => o.value === s.value)) s.value = opts[0] ? opts[0].value : dv;
          }
          if (e) {
            const dv = getGMTDateString(now);
            e.value = resolveHabitToOptionValue(settings.quickExportEnd, opts, dv, now);
            if (!opts.some(o => o.value === e.value)) e.value = dv;
          }
          const start = document.getElementById('date-start').value || weekAgo;
          const end = document.getElementById('date-end').value || today;
          renderHistoryList(start, end);
          scheduleSticky();
        } catch (e) { /* ignore */ }
      }, 30);
    }
    window.addEventListener('pageshow', scheduleReload, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleReload();
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
