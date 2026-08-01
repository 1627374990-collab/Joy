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

  function showDayDetail(date) {
    const data = collectDateData(date);
    const existing = document.getElementById('detail-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'detail-overlay';
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog detail-dialog">
        <h3>${getFullDateLabel(date)} 详情</h3>
        <div class="detail-table-wrapper">
          <table class="status-table detail-table">
            <thead><tr id="detail-head"></tr></thead>
            <tbody id="detail-body"></tbody>
          </table>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" id="detail-close">关闭</button>
          <button class="btn btn-primary" id="detail-pdf">导出PDF</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Build table
    const head = overlay.querySelector('#detail-head');
    const body = overlay.querySelector('#detail-body');

    const thH = document.createElement('th');
    thH.className = 'hour-cell';
    thH.textContent = '时间';
    head.appendChild(thH);

    categories.forEach(cat => {
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main', name: cat.name }];
      subs.forEach(sub => {
        const th = document.createElement('th');
        th.textContent = sub.name;
        th.style.fontSize = '10px';
        head.appendChild(th);
      });
    });

    const thN = document.createElement('th');
    thN.textContent = '备注';
    thN.className = 'note-cell';
    head.appendChild(thN);

    const thT = document.createElement('th');
    thT.textContent = '填入';
    thT.className = 'time-cell';
    head.appendChild(thT);

    data.forEach(row => {
      const tr = document.createElement('tr');

      const tdH = document.createElement('td');
      tdH.className = 'hour-cell';
      tdH.textContent = `${row.hour}:00`;
      tr.appendChild(tdH);

      categories.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
        subs.forEach(sub => {
          const td = document.createElement('td');
          const ed = row.entries[cat.id] ? row.entries[cat.id][sub.id] : null;
          td.textContent = ed ? ed.status : '';
          if (ed && ed.status === STATUS_CHECKED) td.style.color = '#2e7d32';
          if (ed && ed.status === STATUS_CROSSED) td.style.color = '#c62828';
          td.style.textAlign = 'center';
          td.style.fontSize = '14px';
          td.style.fontWeight = 'bold';
          tr.appendChild(td);
        });
      });

      const tdN = document.createElement('td');
      tdN.className = 'note-cell';
      tdN.textContent = row.note || '';
      tdN.style.fontSize = '11px';
      tr.appendChild(tdN);

      const tdT = document.createElement('td');
      tdT.className = 'time-cell';
      let latest = null;
      categories.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
        subs.forEach(sub => {
          const ed = row.entries[cat.id] ? row.entries[cat.id][sub.id] : null;
          if (ed && ed.timestamp && (!latest || ed.timestamp > latest)) latest = ed.timestamp;
        });
      });
      if (row.noteTimestamp && (!latest || row.noteTimestamp > latest)) latest = row.noteTimestamp;
      tdT.textContent = latest ? getTimestampString(latest) : '';
      tdT.style.fontSize = '10px';
      tr.appendChild(tdT);

      body.appendChild(tr);
    });

    overlay.style.display = 'flex';

    overlay.querySelector('#detail-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#detail-pdf').addEventListener('click', () => {
      overlay.remove();
      exportSingleDay(date);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
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

      let latest = null;
      orderedCats.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
        subs.forEach(sub => {
          const ed = row.entries[cat.id] ? row.entries[cat.id][sub.id] : null;
          if (ed && ed.timestamp && (!latest || ed.timestamp > latest)) latest = ed.timestamp;
        });
      });
      if (row.noteTimestamp && (!latest || row.noteTimestamp > latest)) latest = row.noteTimestamp;
      const timeStr = latest ? getTimestampString(latest) : '';

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
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 500); }<\/script>
</body></html>`;
  }

  // ================================================================
  // Image-based PDF export (html2canvas + jsPDF)
  // This is the ONLY approach that reliably avoids content truncation
  // on iOS Safari — the PDF contains plain bitmap images, so the
  // browser never has to perform pagination / column layout math.
  // ================================================================

  function getDayPageStyles(totalWidth) {
    return `<style>
* { box-sizing: border-box; }
body, html { margin: 0; padding: 0; background: #fff; font-family: -apple-system, "Microsoft YaHei", BlinkMacSystemFont, "Segoe UI", sans-serif; color: #333; }
h1 { font-size: 22px; margin: 14px 0 4px; text-align: center; }
.subtitle { color: #666; font-size: 13px; margin: 0 0 14px; text-align: center; }
.day-page-header { font-size: 15px; font-weight: bold; margin: 0 auto 10px auto; padding: 5px 12px; background: #e3f2fd; border-radius: 4px; display: table; }
.day-page-date { color: #1565c0; }
.pdf-holder { width: ${totalWidth}px; margin: 0 auto; padding: 8px 10px; }
table.pdf-table { border-collapse: separate; border-spacing: 0; width: ${totalWidth}px; table-layout: fixed; font-size: 13px; }
table.pdf-table th, table.pdf-table td {
  border: 1px solid #333;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  word-break: normal; overflow-wrap: normal;
}
.note-cell { white-space: normal !important; word-break: break-word !important; }
.day-root { width: ${totalWidth + 40}px; margin: 0 auto; background: #fff; padding: 10px 10px 18px; }
</style>`;
  }

  function _getLatestTimeFromRow(row) {
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

  async function renderDayPageToCanvas(date, data, pdfTitle, headerInfo) {
    const { thead, colgroup, totalWidth, orderedCats, hasParents, effPid, noWrapBase } = buildPDFTableHeader(1020);
    const dateObj = new Date(date + 'T00:00:00Z');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dateLabel = `${date} ${weekdays[dateObj.getUTCDay()]}`;

    let rowsHTML = '';
    data.forEach(row => {
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
      const timeStr = _getLatestTimeFromRow(row);
      const note = (row.note || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const rowBg = parseInt(row.hour) % 2 === 0 ? 'background:#fafbfc;' : '';
      rowsHTML += `<tr style="${rowBg}">
        <td style="border:1px solid #333;padding:6px 8px;font-size:13px;font-weight:bold;color:#1976d2;${noWrapBase}">${row.hour}:00</td>
        ${statusCells}
        <td class="note-cell" style="border:1px solid #333;padding:6px;font-size:12px;word-break:break-word;white-space:normal;">${note}</td>
        <td style="border:1px solid #333;padding:6px;font-size:12px;color:#666;text-align:right;${noWrapBase}">${timeStr}</td>
      </tr>`;
    });

    const styles = getDayPageStyles(totalWidth);
    const headerHTML = pdfTitle && headerInfo ? `<h1>${pdfTitle}</h1><div class="subtitle">${headerInfo}</div>` : '';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body><div class="day-root">
${headerHTML}
<div class="day-page-header"><span class="day-page-date">📅 ${dateLabel} (GMT)</span></div>
<div class="pdf-holder">
  <table class="pdf-table">
    ${colgroup}
    ${thead}
    <tbody>${rowsHTML}</tbody>
  </table>
</div>
</div></body></html>`;

    return await renderHTMLStringToCanvas(html);
  }

  async function renderHTMLStringToCanvas(htmlStr) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-99999px';
    iframe.style.top = '0';
    iframe.style.width = '3200px';
    iframe.style.height = '3200px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
    try {
      const idoc = iframe.contentDocument;
      idoc.open();
      idoc.write(htmlStr);
      idoc.close();
      await new Promise(r => setTimeout(r, 350));
      const target = idoc.body.querySelector('.day-root') || idoc.body;
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        ignoreElements: el => false,
      });
      return canvas;
    } finally {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
  }

  async function exportRangeViaImagePDF(dates) {
    const { jsPDF } = jspdf;
    const PAGE_W_MM = 297;
    const PAGE_H_MM = 210;
    const MARGIN_MM = 8;
    const CONTENT_W_MM = PAGE_W_MM - 2 * MARGIN_MM;
    const CONTENT_H_MM = PAGE_H_MM - 2 * MARGIN_MM;

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let total = 0, filled = 0;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const data = collectDateData(date);
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

      let pdfTitle = null, headerInfo = null;
      if (i === 0) {
        pdfTitle = dates.length > 1 ? 'SCC Patrol Record·历史汇总' : 'SCC Patrol Record';
        if (dates.length > 1) {
          const rate = total > 0 ? Math.round((filled / total) * 100) : 0;
          headerInfo = `日期范围: ${dates[0]} 至 ${dates[dates.length - 1]} (GMT) · 共 ${dates.length} 天 · 填写率 ${rate}%`;
        } else {
          const dateObj = new Date(date + 'T00:00:00Z');
          const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
          headerInfo = `日期: ${date} ${weekdays[dateObj.getUTCDay()]} (GMT) · 生成时间: ${getGMTTimeString(getNow())} GMT`;
        }
      }

      const canvas = await renderDayPageToCanvas(date, data, pdfTitle, headerInfo);

      if (i > 0) pdf.addPage();

      const imgWpx = canvas.width, imgHpx = canvas.height;
      const ratio = imgWpx / imgHpx;
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
    const filename = `SCC-Patrol-Record_${fileDate}.pdf`;
    pdf.save(filename);
    showSnackbar('PDF 已生成下载');
  }

  function exportSingleDay(date) {
    showSnackbar('正在生成 PDF...');
    const data = collectDateData(date);
    if (typeof html2canvas === 'function' && window.jspdf && jspdf.jsPDF) {
      exportRangeViaImagePDF([date]).catch(err => {
        console.error(err);
        showSnackbar('导出失败: ' + (err && err.message ? err.message : err));
      });
      return;
    }
    // Legacy fallback
    const html = buildPDFHTML(date, data);
    const win = window.open('', '_blank');
    if (!win) { showSnackbar('请允许弹窗以导出'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function exportRange(startStr, endStr) {
    const dates = getDateRange(startStr, endStr);
    if (typeof html2canvas === 'function' && window.jspdf && jspdf.jsPDF) {
      showSnackbar(`正在生成 PDF (${dates.length} 天)...`);
      exportRangeViaImagePDF(dates).catch(err => {
        console.error(err);
        showSnackbar('导出失败: ' + (err && err.message ? err.message : err));
      });
      return;
    }
    // Legacy fallback
    const { thead: pdfThead, colgroup, totalWidth, orderedCats, hasParents, headerRows, effPid, noWrapBase } = buildPDFTableHeader(1020);
    const css = buildPrintCSSBase(totalWidth);

    let dayBlocks = '';
    let totalStatuses = 0;
    let filledStatuses = 0;

    dates.forEach((date, dayIdx) => {
      const data = collectDateData(date);
      const dateObj = new Date(date + 'T00:00:00Z');
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const dateLabel = `${date} ${weekdays[dateObj.getUTCDay()]}`;

      let rowsHTML = '';
      data.forEach(row => {
        let statusCells = '';
        orderedCats.forEach((cat, ci) => {
          const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
          const prevCat = ci > 0 ? orderedCats[ci - 1] : null;
          const isNewGroup = hasParents && ci > 0 && effPid(cat) !== effPid(prevCat);
          subs.forEach((sub, subi) => {
            const key = sub.id;
            const ed = row.entries[cat.id] ? row.entries[cat.id][key] : null;
            const status = ed ? ed.status : '';
            if (status !== STATUS_EMPTY) filledStatuses++;
            totalStatuses++;
            const div = (subi === 0 && isNewGroup) ? 'border-left:3px solid #1976d2;' : '';
            const color = status === '✓' ? '#2e7d32' : status === '✗' ? '#c62828' : '#ccc';
            statusCells += `<td style="border:1px solid #333;padding:6px 3px;text-align:center;font-size:14px;color:${color};${div}${noWrapBase}">${status || ''}</td>`;
          });
        });
        let latest = null;
        orderedCats.forEach(cat => {
          const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
          subs.forEach(sub => {
            const ed = row.entries[cat.id] ? row.entries[cat.id][sub.id] : null;
            if (ed && ed.timestamp && (!latest || ed.timestamp > latest)) latest = ed.timestamp;
          });
        });
        if (row.noteTimestamp && (!latest || row.noteTimestamp > latest)) latest = row.noteTimestamp;
        const timeStr = latest ? getTimestampString(latest) : '';
        const note = (row.note || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const rowBg = parseInt(row.hour) % 2 === 0 ? 'background:#fafbfc;' : '';
        rowsHTML += `<tr style="${rowBg}">
          <td style="border:1px solid #333;padding:6px 8px;font-size:13px;font-weight:bold;color:#1976d2;${noWrapBase}">${row.hour}:00</td>
          ${statusCells}
          <td class="note-cell" style="border:1px solid #333;padding:6px;font-size:12px;word-break:break-word;white-space:normal;">${note}</td>
          <td style="border:1px solid #333;padding:6px;font-size:12px;color:#666;text-align:right;${noWrapBase}">${timeStr}</td>
        </tr>`;
      });

      const pageBreak = dayIdx < dates.length - 1 ? 'page-break-after: always;' : '';
      dayBlocks += `
      <div class="day-page" style="${pageBreak}">
        <div class="day-page-header">
          <span class="day-page-date">📅 ${dateLabel} (GMT)</span>
        </div>
        <div class="pdf-holder"><div class="pdf-wrap">
          <table class="pdf-table">
            ${colgroup}
            ${pdfThead}
            <tbody>${rowsHTML}</tbody>
          </table>
        </div></div>
      </div>`;
    });

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>SCC Patrol Record - ${startStr} 至 ${endStr}</title>
${css.headExtra}
${css.styleTag}
</head><body>
<h1>SCC Patrol Record·历史汇总</h1>
<div class="subtitle">日期范围: ${startStr} 至 ${endStr} (GMT) · 共 ${dates.length} 天 · 填写率 ${totalStatuses > 0 ? Math.round((filledStatuses/totalStatuses)*100) : 0}%</div>
${dayBlocks}
<div class="footer">SCC Patrol Record · 共 ${dates.length} 天 · 生成于 ${getGMTTimeString(getNow())} GMT</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 500); }<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { showSnackbar('请允许弹窗以导出'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
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
  function buildRelativeDateOptions() {
    const now = getNow();
    // 本周一 (GMT)
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
    const mondayThisWeek = new Date(now);
    mondayThisWeek.setUTCDate(now.getUTCDate() - ((dayOfWeek + 6) % 7));
    mondayThisWeek.setUTCHours(0, 0, 0, 0);

    // 上上周一 = 本周一 - 14天
    const earliest = new Date(mondayThisWeek);
    earliest.setUTCDate(mondayThisWeek.getUTCDate() - 14);

    const weekdayNames = ['一', '二', '三', '四', '五', '六', '日'];
    const options = [];
    const todayStr = getGMTDateString(now);

    let d = new Date(earliest);
    while (d <= now) {
      const dateStr = getGMTDateString(d);
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const dow = d.getUTCDay(); // 0=Sun
      const dayName = weekdayNames[(dow + 6) % 7]; // 0=Mon

      // 计算是第几周
      const diffDays = Math.round((d - mondayThisWeek) / (24 * 60 * 60 * 1000));
      let prefix;
      if (dateStr === todayStr) {
        prefix = '今天';
      } else if (diffDays >= 0) {
        prefix = '本周';
      } else if (diffDays >= -7) {
        prefix = '上周';
      } else {
        prefix = '上上周';
      }

      const label = `${prefix}${dayName} (${mm}-${dd})`;
      options.push({ value: dateStr, label });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return options;
  }

  function initQuickExportHabit() {
    const startSel = document.getElementById('quick-export-start');
    const endSel = document.getElementById('quick-export-end');
    const btn = document.getElementById('btn-quick-export');
    if (!startSel || !endSel || !btn) return;

    const options = buildRelativeDateOptions();

    // 填充选项
    startSel.innerHTML = '';
    endSel.innerHTML = '';
    options.forEach(opt => {
      startSel.innerHTML += `<option value="${opt.value}">${opt.label}</option>`;
      endSel.innerHTML += `<option value="${opt.value}">${opt.label}</option>`;
    });

    // 从 settings 恢复上次选择（习惯）
    const savedStart = settings.quickExportStart;
    const savedEnd = settings.quickExportEnd;
    // 默认：上周二 ~ 本周三（或今天，如果本周三还未到）
    const now = getNow();
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

    const startVal = (savedStart && options.some(o => o.value === savedStart)) ? savedStart : defaultStart;
    const endVal = (savedEnd && options.some(o => o.value === savedEnd)) ? savedEnd : defaultEnd;

    startSel.value = startVal;
    endSel.value = endVal;

    // 确保 start <= end
    function validateRange() {
      if (startSel.value > endSel.value) {
        showSnackbar('起始日不能晚于结束日，已自动调整');
        startSel.value = endSel.value;
      }
    }
    startSel.addEventListener('change', validateRange);
    endSel.addEventListener('change', validateRange);

    // 选择改变时立即保存习惯到 localStorage（不需要点导出也能保存）
    function saveQuickExportHabit() {
      settings.quickExportStart = startSel.value;
      settings.quickExportEnd = endSel.value;
      try {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
      } catch (e) {}
    }
    startSel.addEventListener('change', saveQuickExportHabit);
    endSel.addEventListener('change', saveQuickExportHabit);

    // 导出按钮
    btn.addEventListener('click', () => {
      const start = startSel.value;
      const end = endSel.value;
      if (!start || !end) { showSnackbar('请选择日期范围'); return; }
      if (start > end) { showSnackbar('起始日不能晚于结束日'); return; }

      // 保存习惯到 settings
      settings.quickExportStart = start;
      settings.quickExportEnd = end;
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
      // 返回前保存一键导出习惯
      const qs = document.getElementById('quick-export-start');
      const qe = document.getElementById('quick-export-end');
      if (qs && qe) {
        settings.quickExportStart = qs.value;
        settings.quickExportEnd = qe.value;
        try { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings)); } catch (e) {}
      }
      _goBackToMain();
    });

    const today = getTodayDate();
    const weekAgo = shiftDate(today, -6);
    document.getElementById('date-start').value = weekAgo;
    document.getElementById('date-end').value = today;

    document.getElementById('btn-search').addEventListener('click', () => {
      const start = document.getElementById('date-start').value;
      const end = document.getElementById('date-end').value;
      if (!start || !end) { showSnackbar('请选择日期范围'); return; }
      if (start > end) { showSnackbar('起始日期不能晚于结束日期'); return; }
      renderHistoryList(start, end);
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

    // Clear All History
    document.getElementById('btn-clear-history').addEventListener('click', () => {
      showDialog('清除全部历史', '确定要清除所有日期的SCC Patrol Record 数据吗？此操作不可恢复！类别设置将保留。', () => {
        showDialog('再次确认', '⚠️ 最后确认：将永久删除所有历史记录数据，确定继续？', () => {
          records = {};
          saveRecords();
          showSnackbar('✅ 所有历史记录已清除');
          setTimeout(() => window.location.reload(), 800);
        });
      });
    });

    // Auto-load initial range
    renderHistoryList(weekAgo, today);

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
          // refresh quick-export dropdowns from settings
          const s = document.getElementById('quick-export-start');
          const e = document.getElementById('quick-export-end');
          if (s && settings.quickExportStart) s.value = settings.quickExportStart;
          if (e && settings.quickExportEnd) e.value = settings.quickExportEnd;
          const start = document.getElementById('date-start').value || weekAgo;
          const end = document.getElementById('date-end').value || today;
          renderHistoryList(start, end);
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
