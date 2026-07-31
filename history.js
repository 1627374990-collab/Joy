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

  // ===== Storage =====
  function loadSettings() {
    try {
      const s = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (s) return JSON.parse(s);
    } catch (e) { /* ignore */ }
    return { highlightColor: '#ffeb3b', timeRangeMinutes: 30, outOfRangeHighlight: true, reminderEnabled: true, pdfTitle: '状态巡检记录' };
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
  function buildPDFHTML(date, hours, title) {
    const title_text = title || (settings.pdfTitle || '状态巡检记录');
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

      let latest = null;
      categories.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
        subs.forEach(sub => {
          const ed = row.entries[cat.id] ? row.entries[cat.id][sub.id] : null;
          if (ed && ed.timestamp && (!latest || ed.timestamp > latest)) latest = ed.timestamp;
        });
      });
      if (row.noteTimestamp && (!latest || row.noteTimestamp > latest)) latest = row.noteTimestamp;
      const timeStr = latest ? getTimestampString(latest) : '';

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
<html><head><meta charset="UTF-8"><title>${title_text} - ${date}</title>
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
  <h1>${title_text}</h1>
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
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); }<\/script>
</body></html>`;
  }

  function exportSingleDay(date) {
    const data = collectDateData(date);
    const html = buildPDFHTML(date, data, settings.pdfTitle || '状态巡检记录');
    const win = window.open('', '_blank');
    if (!win) { showSnackbar('请允许弹窗以导出'); return; }
    win.document.write(html);
    win.document.close();
  }

  function exportRange(startStr, endStr) {
    const dates = getDateRange(startStr, endStr);
    let allRowsHTML = '';
    let totalStatuses = 0;
    let filledStatuses = 0;

    dates.forEach(date => {
      const data = collectDateData(date);
      allRowsHTML += `<tr><td colspan="100%" style="background:#e3f2fd;font-weight:bold;padding:6px;font-size:13px;">📅 ${getFullDateLabel(date)} (GMT)</td></tr>`;

      data.forEach(row => {
        let statusCells = '';
        categories.forEach(cat => {
          const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
          subs.forEach(sub => {
            const key = sub.id;
            const ed = row.entries[cat.id] ? row.entries[cat.id][key] : null;
            const status = ed ? ed.status : '';
            if (status !== STATUS_EMPTY) filledStatuses++;
            totalStatuses++;
            statusCells += `<td style="border:1px solid #333;padding:3px 2px;text-align:center;font-size:11px;color:${status === '✓' ? '#2e7d32' : status === '✗' ? '#c62828' : '#ccc'};">${status || ''}</td>`;
          });
        });

        let latest = null;
        categories.forEach(cat => {
          const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [{ id: '_main' }];
          subs.forEach(sub => {
            const ed = row.entries[cat.id] ? row.entries[cat.id][sub.id] : null;
            if (ed && ed.timestamp && (!latest || ed.timestamp > latest)) latest = ed.timestamp;
          });
        });
        if (row.noteTimestamp && (!latest || row.noteTimestamp > latest)) latest = row.noteTimestamp;
        const timeStr = latest ? getTimestampString(latest) : '';

        allRowsHTML += `<tr>
          <td style="border:1px solid #333;padding:3px 5px;font-size:11px;">${row.hour}:00</td>
          ${statusCells}
          <td style="border:1px solid #333;padding:3px;font-size:10px;max-width:100px;">${row.note || ''}</td>
          <td style="border:1px solid #333;padding:3px;font-size:10px;color:#666;">${timeStr}</td>
        </tr>`;
      });
    });

    const title = settings.pdfTitle || '状态巡检记录';
    const catHeaders = buildCatHeaders();
    const subHeaders = buildSubHeaders();

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title} - ${startStr} 至 ${endStr}</title>
<style>
  body { font-family: -apple-system, "Microsoft YaHei", sans-serif; padding: 20px; color: #333; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 10px; }
  th, td { border: 1px solid #333; }
  .footer { margin-top: 20px; font-size: 11px; color: #888; text-align: right; }
  @media print { body { padding: 10mm; } }
</style></head>
<body>
  <h1>${title} · 历史汇总</h1>
  <div class="subtitle">日期范围: ${startStr} 至 ${endStr} (GMT) · 共 ${dates.length} 天 · 填写率 ${totalStatuses > 0 ? Math.round((filledStatuses/totalStatuses)*100) : 0}%</div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="border:1px solid #333;padding:4px;background:#e8f0fe;">时间</th>
        ${catHeaders}
        <th rowspan="2" style="border:1px solid #333;padding:4px;background:#e8f0fe;">备注</th>
        <th rowspan="2" style="border:1px solid #333;padding:4px;background:#e8f0fe;">填入</th>
      </tr>
      <tr>${subHeaders}</tr>
    </thead>
    <tbody>${allRowsHTML}</tbody>
  </table>
  <div class="footer">状态记录系统</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); }<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { showSnackbar('请允许弹窗以导出'); return; }
    win.document.write(html);
    win.document.close();
  }

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

  // ===== Init =====
  function init() {
    document.getElementById('btn-back').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    const today = getTodayDate();
    const weekAgo = shiftDate(today, -6);
    document.getElementById('date-start').value = weekAgo;
    document.getElementById('date-end').value = today;

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const days = parseInt(btn.dataset.days);
        const end = getTodayDate();
        const start = shiftDate(end, -(days - 1));
        document.getElementById('date-start').value = start;
        document.getElementById('date-end').value = end;
      });
    });

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

    // Auto-load initial range
    renderHistoryList(weekAgo, today);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
