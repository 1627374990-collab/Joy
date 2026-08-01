/* ===== Settings Page ===== */
(function () {
  'use strict';

  const STORAGE_KEY_SETTINGS = 'status_settings_v1';
  const STORAGE_KEY_CATEGORIES = 'status_categories_v1';
  const STORAGE_KEY_RECORDS = 'status_records_v1';

  // ===== Storage Helpers =====
  // ⚠️ DEFAULT_SETTINGS 必须在 loadSettings() 调用之前定义，
  //    否则 const 的暂时性死区（TDZ）会导致 ReferenceError，整个设置页功能瘫痪。
  const DEFAULT_SETTINGS = {
    highlightColor: '#ffeb3b',
    timeRangeMinutes: 30,
    outOfRangeHighlight: true,
    reminderEnabled: true,
    reminderQuietStart: 0,
    reminderQuietEnd: 6,
    browserNotify: false,
    pdfTitle: '状态巡检记录',
    parents: [],
    oneClickName: '一键打卡',
    oneClickPreset: {
      status: '✓',
      targets: null,
    },
    columnWidths: {}, // key: 'catId_subId' or 'hour'/'note'/'time'/'del', value: px number
    defaultColWidth: 80,
  };

  let settings = loadSettings();
  let categories = loadCategories();
  let workingCategories = JSON.parse(JSON.stringify(categories)); // editable copy

  function loadSettings() {
    try {
      const s = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (s) {
        // Merge with defaults to ensure new fields exist for legacy data
        return { ...DEFAULT_SETTINGS, ...JSON.parse(s) };
      }
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
    return [
      { id: 'health', name: '身体', subStatuses: [{ id: 'sleep', name: '睡眠' }, { id: 'mood', name: '情绪' }] },
      { id: 'work', name: '工作', subStatuses: [] },
      { id: 'study', name: '学习', subStatuses: [] },
    ];
  }

  function saveCategories() {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
  }

  function genId() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
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

    const confirmHandler = () => {
      close();
      if (onConfirm) onConfirm();
    };
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

  // ===== Render Parents (Check Content) =====
  function renderParents() {
    const list = document.getElementById('parent-list');
    list.innerHTML = '';
    document.getElementById('parent-count').textContent = settings.parents.length;

    settings.parents.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'parent-item';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'parent-name-input';
      input.value = p.name;
      input.placeholder = '检查内容名称';
      input.addEventListener('input', (e) => {
        p.name = e.target.value;
        persistHighlightSettings();
      });
      row.appendChild(input);

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'item-color-picker';
      colorInput.value = p.color || '#e8f0fe';
      colorInput.title = '表格背景色';
      colorInput.addEventListener('input', (e) => {
        p.color = e.target.value;
        persistHighlightSettings();
      });
      row.appendChild(colorInput);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-sm danger';
      delBtn.textContent = '✕';
      delBtn.title = '删除';
      delBtn.addEventListener('click', () => {
        const removedId = p.id;
        settings.parents.splice(idx, 1);
        // Reassign categories under this parent to first remaining parent
        const fallbackId = settings.parents.length > 0 ? settings.parents[0].id : null;
        workingCategories.forEach(c => {
          if (c.parentId === removedId) c.parentId = fallbackId;
        });
        persistHighlightSettings();
        renderParents();
        renderCategories();
      });
      row.appendChild(delBtn);

      list.appendChild(row);
    });
  }

  // ===== Render Category List =====
  function renderCategories() {
    const list = document.getElementById('category-list');
    list.innerHTML = '';
    document.getElementById('cat-count').textContent = workingCategories.length;

    workingCategories.forEach((cat, catIdx) => {
      const li = document.createElement('li');
      li.className = 'category-item' + (cat.subStatuses && cat.subStatuses.length > 0 ? ' has-subs' : '');

      // Header row
      const header = document.createElement('div');
      header.className = 'category-header';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'toggle-subs';
      toggleBtn.innerHTML = '<span class="toggle-icon">▶</span>';
      toggleBtn.addEventListener('click', () => {
        li.classList.toggle('has-subs');
      });
      header.appendChild(toggleBtn);

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'category-name-input';
      nameInput.value = cat.name;
      nameInput.placeholder = '类别名称';
      nameInput.addEventListener('input', (e) => {
        cat.name = e.target.value;
      });
      header.appendChild(nameInput);

      const catColor = document.createElement('input');
      catColor.type = 'color';
      catColor.className = 'item-color-picker';
      catColor.value = cat.color || '#f0f4f8';
      catColor.title = '表格背景色';
      catColor.addEventListener('input', (e) => {
        cat.color = e.target.value;
      });
      header.appendChild(catColor);

      // Parent selector
      const parentSel = document.createElement('select');
      parentSel.className = 'parent-select';
      if (settings.parents.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '请先添加检查内容';
        parentSel.appendChild(opt);
        parentSel.disabled = true;
      } else {
        const validPid = settings.parents.some(p => p.id === cat.parentId);
        if (!validPid) cat.parentId = settings.parents[0].id;
        settings.parents.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          parentSel.appendChild(opt);
        });
        parentSel.value = cat.parentId;
        parentSel.addEventListener('change', (e) => {
          cat.parentId = e.target.value;
        });
      }
      header.appendChild(parentSel);

      const addSubBtn = document.createElement('button');
      addSubBtn.className = 'btn-sm';
      addSubBtn.textContent = '+ 子项';
      addSubBtn.title = '添加子状态';
      addSubBtn.addEventListener('click', () => {
        if (!cat.subStatuses) cat.subStatuses = [];
        cat.subStatuses.push({ id: genId(), name: '新子项' });
        li.classList.add('has-subs');
        renderCategories();
      });
      header.appendChild(addSubBtn);

      const upBtn = document.createElement('button');
      upBtn.className = 'btn-sm';
      upBtn.textContent = '↑';
      upBtn.title = '上移';
      upBtn.addEventListener('click', () => {
        if (catIdx === 0) return;
        const tmp = workingCategories[catIdx - 1];
        workingCategories[catIdx - 1] = workingCategories[catIdx];
        workingCategories[catIdx] = tmp;
        renderCategories();
      });
      header.appendChild(upBtn);

      const downBtn = document.createElement('button');
      downBtn.className = 'btn-sm';
      downBtn.textContent = '↓';
      downBtn.title = '下移';
      downBtn.addEventListener('click', () => {
        if (catIdx === workingCategories.length - 1) return;
        const tmp = workingCategories[catIdx + 1];
        workingCategories[catIdx + 1] = workingCategories[catIdx];
        workingCategories[catIdx] = tmp;
        renderCategories();
      });
      header.appendChild(downBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-sm danger';
      delBtn.textContent = '🗑';
      delBtn.title = '删除此类别';
      delBtn.addEventListener('click', () => {
        showDialog('删除类别', `确定删除"${cat.name}"及其所有记录？`, () => {
          workingCategories.splice(catIdx, 1);
          renderCategories();
        });
      });
      header.appendChild(delBtn);

      li.appendChild(header);

      // Sub-status list
      if (cat.subStatuses && cat.subStatuses.length > 0) {
        const subList = document.createElement('div');
        subList.className = 'sub-status-list';

        cat.subStatuses.forEach((sub, subIdx) => {
          const subRow = document.createElement('div');
          subRow.className = 'sub-status-item';

          const subInput = document.createElement('input');
          subInput.type = 'text';
          subInput.value = sub.name;
          subInput.placeholder = '子状态名称';
          subInput.addEventListener('input', (e) => {
            sub.name = e.target.value;
          });
          subRow.appendChild(subInput);

          const subDel = document.createElement('button');
          subDel.className = 'btn-sm danger';
          subDel.textContent = '✕';
          subDel.title = '删除子项';
          subDel.addEventListener('click', () => {
            showDialog('删除子项', `确定删除子项"${sub.name}"？`, () => {
              cat.subStatuses.splice(subIdx, 1);
              renderCategories();
            });
          });
          subRow.appendChild(subDel);

          subList.appendChild(subRow);
        });

        li.appendChild(subList);
      }

      list.appendChild(li);
    });
  }

  // ===== Save Changes =====
  function saveCategoryChanges() {
    // Validate
    for (const cat of workingCategories) {
      if (!cat.name || cat.name.trim() === '') {
        showSnackbar('类别名称不能为空');
        return;
      }
      if (cat.subStatuses) {
        for (const sub of cat.subStatuses) {
          if (!sub.name || sub.name.trim() === '') {
            showSnackbar('子状态名称不能为空');
            return;
          }
        }
      }
    }

    showDialog('保存更改', '保存后将应用新的类别设置。注意：旧数据中的已删除类别记录将被保留但不再显示。', () => {
      categories = JSON.parse(JSON.stringify(workingCategories));
      saveCategories();
      renderPresetTargets();
      showSnackbar('设置已保存');
    });
  }

  // ===== One-Click Preset =====
  function ensurePreset() {
    if (!settings.oneClickPreset) {
      settings.oneClickPreset = { status: '✓', targets: null, parentTargets: null };
    }
    if (!settings.oneClickPreset.parentTargets) settings.oneClickPreset.parentTargets = {};
    return settings.oneClickPreset;
  }

  function buildDefaultParentTargets() {
    const pt = {};
    settings.parents.forEach(p => { pt[p.id] = true; });
    return pt;
  }

  function buildDefaultTargets() {
    const targets = {};
    workingCategories.forEach(cat => {
      targets[cat.id] = {};
      const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [];
      if (subs.length > 0) {
        subs.forEach(sub => { targets[cat.id][sub.id] = true; });
      } else {
        targets[cat.id]['_main'] = true;
      }
    });
    return targets;
  }

  // Resolve a category's effective parent id (orphans fall back to first parent)
  function effParentId(cat) {
    if (cat.parentId && settings.parents.some(p => p.id === cat.parentId)) return cat.parentId;
    return settings.parents.length > 0 ? settings.parents[0].id : null;
  }

  function renderPresetTargets() {
    const list = document.getElementById('preset-target-list');
    if (!list) return;
    list.innerHTML = '';

    const preset = ensurePreset();
    if (!preset.targets) preset.targets = buildDefaultTargets();
    if (!preset.parentTargets) preset.parentTargets = buildDefaultParentTargets();
    const targets = preset.targets;
    const parentTargets = preset.parentTargets;

    const hasParents = settings.parents.length > 0;

    if (!hasParents) {
      // No parents: render flat list of categories
      workingCategories.forEach(cat => renderCatRow(list, cat, targets));
      return;
    }

    // Render grouped by parent
    settings.parents.forEach(p => {
      const groupCats = workingCategories.filter(c => effParentId(c) === p.id);
      if (groupCats.length === 0) return;

      const group = document.createElement('div');
      group.className = 'preset-parent-group';

      // Parent header row (group toggle)
      const pHead = document.createElement('label');
      pHead.className = 'preset-parent-head';
      const pCb = document.createElement('input');
      pCb.type = 'checkbox';
      pCb.checked = parentTargets[p.id] !== false;
      pCb.addEventListener('change', () => {
        parentTargets[p.id] = pCb.checked;
        // Enable/disable child rows visually
        group.querySelectorAll('.preset-target-item input').forEach(cb => { cb.disabled = !pCb.checked; });
        persistHighlightSettings();
      });
      const pLabel = document.createElement('span');
      pLabel.className = 'preset-parent-name';
      pLabel.textContent = p.name;
      pHead.appendChild(pCb);
      pHead.appendChild(pLabel);
      group.appendChild(pHead);

      // Child category rows
      groupCats.forEach(cat => {
        const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [];
        const items = subs.length > 0 ? subs.map(s => ({ id: s.id, name: s.name })) : [{ id: '_main', name: cat.name }];

        items.forEach(item => {
          const row = document.createElement('label');
          row.className = 'preset-target-item';
          if (parentTargets[p.id] === false) row.classList.add('disabled');

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = targets[cat.id] ? targets[cat.id][item.id] !== false : true;
          cb.disabled = parentTargets[p.id] === false;
          cb.addEventListener('change', () => {
            if (!targets[cat.id]) targets[cat.id] = {};
            targets[cat.id][item.id] = cb.checked;
            persistHighlightSettings();
          });

          const label = document.createElement('span');
          label.className = 'preset-target-name';
          label.textContent = subs.length > 0 ? `${cat.name} › ${item.name}` : cat.name;

          row.appendChild(cb);
          row.appendChild(label);
          group.appendChild(row);
        });
      });

      list.appendChild(group);
    });
  }

  function renderCatRow(container, cat, targets) {
    const subs = cat.subStatuses && cat.subStatuses.length > 0 ? cat.subStatuses : [];
    const items = subs.length > 0 ? subs.map(s => ({ id: s.id, name: s.name })) : [{ id: '_main', name: cat.name }];

    items.forEach(item => {
      const row = document.createElement('label');
      row.className = 'preset-target-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = targets[cat.id] ? targets[cat.id][item.id] !== false : true;
      cb.addEventListener('change', () => {
        if (!targets[cat.id]) targets[cat.id] = {};
        targets[cat.id][item.id] = cb.checked;
        persistHighlightSettings();
      });

      const label = document.createElement('span');
      label.className = 'preset-target-name';
      label.textContent = subs.length > 0 ? `${cat.name} › ${item.name}` : cat.name;

      row.appendChild(cb);
      row.appendChild(label);
      container.appendChild(row);
    });
  }

  function initOneClickPreset() {
    const preset = ensurePreset();

    // Status buttons
    const statusBtns = document.querySelectorAll('.preset-status-btn');
    statusBtns.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.status === preset.status);
      btn.addEventListener('click', () => {
        statusBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        preset.status = btn.dataset.status;
        persistHighlightSettings();
      });
    });

    // Select all / none
    document.getElementById('preset-select-all').addEventListener('click', () => {
      const targets = preset.targets || (preset.targets = buildDefaultTargets());
      const parentTargets = preset.parentTargets || (preset.parentTargets = buildDefaultParentTargets());
      Object.keys(targets).forEach(catId => {
        Object.keys(targets[catId]).forEach(key => { targets[catId][key] = true; });
      });
      Object.keys(parentTargets).forEach(pid => { parentTargets[pid] = true; });
      renderPresetTargets();
      persistHighlightSettings();
    });

    document.getElementById('preset-select-none').addEventListener('click', () => {
      const targets = preset.targets || (preset.targets = buildDefaultTargets());
      const parentTargets = preset.parentTargets || (preset.parentTargets = buildDefaultParentTargets());
      Object.keys(targets).forEach(catId => {
        Object.keys(targets[catId]).forEach(key => { targets[catId][key] = false; });
      });
      Object.keys(parentTargets).forEach(pid => { parentTargets[pid] = false; });
      renderPresetTargets();
      persistHighlightSettings();
    });

    renderPresetTargets();
  }

  // ===== Init =====
  function init() {
    // Migrate legacy parentName/parentNames -> parents (array of {id,name})
    if (!Array.isArray(settings.parents)) {
      settings.parents = [];
      if (Array.isArray(settings.parentNames)) {
        settings.parentNames.forEach(n => {
          if (n && n.trim()) settings.parents.push({ id: genId(), name: n.trim() });
        });
      } else if (typeof settings.parentName === 'string' && settings.parentName.trim()) {
        settings.parents.push({ id: genId(), name: settings.parentName.trim() });
      }
      delete settings.parentNames;
      delete settings.parentName;
    }
    if (!settings.oneClickName) settings.oneClickName = '一键打卡';

    // Populate form
    document.getElementById('highlight-color').value = settings.highlightColor;
    document.getElementById('time-range').value = settings.timeRangeMinutes;
    document.getElementById('enable-highlight').checked = settings.outOfRangeHighlight;
    document.getElementById('enable-reminder').checked = settings.reminderEnabled !== false;
    document.getElementById('enable-browser-notify').checked = settings.browserNotify === true;
    document.getElementById('pdf-title').value = settings.pdfTitle || '状态巡检记录';
    document.getElementById('one-click-name').value = settings.oneClickName || '一键打卡';

    // Fill quiet hour options (0-24, whole hours)
    const qStart = document.getElementById('quiet-start');
    const qEnd = document.getElementById('quiet-end');
    qStart.innerHTML = '';
    qEnd.innerHTML = '';
    for (let h = 0; h <= 24; h++) {
      const label = String(h).padStart(2, '0') + ':00';
      qStart.innerHTML += `<option value="${h}">${label}</option>`;
      qEnd.innerHTML += `<option value="${h}">${label}</option>`;
    }
    qStart.value = settings.reminderQuietStart != null ? settings.reminderQuietStart : 0;
    qEnd.value = settings.reminderQuietEnd != null ? settings.reminderQuietEnd : 6;

    // ===== 【关键】把 workingCategories 立即持久化到 categories + localStorage（避免"点添加后退回去就丢了"）=====
    function syncWorkingCategoriesImmediately() {
      try {
        categories = JSON.parse(JSON.stringify(workingCategories));
        saveCategories();
      } catch (e) { /* ignore */ }
    }

    // Event listeners
    document.getElementById('btn-back').addEventListener('click', () => {
      // 1) 立即保存所有输入框的实时状态到 settings / workingCategories
      persistHighlightSettings();
      // 2) workingCategories（未按"保存类别更改"的那些）也直接写盘——用户改完要能看到效果
      syncWorkingCategoriesImmediately();
      // 3) 跳回主页面
      try { window.location.href = 'index.html'; } catch (e) { history.back(); }
    });

    document.getElementById('highlight-color').addEventListener('input', (e) => {
      settings.highlightColor = e.target.value;
      persistHighlightSettings();
    });

    document.getElementById('time-range').addEventListener('input', (e) => {
      settings.timeRangeMinutes = parseInt(e.target.value) || 30;
      persistHighlightSettings();
    });

    document.getElementById('enable-highlight').addEventListener('change', (e) => {
      settings.outOfRangeHighlight = e.target.checked;
      persistHighlightSettings();
      showSnackbar('异常标注已' + (e.target.checked ? '开启' : '关闭'));
    });

    document.getElementById('enable-reminder').addEventListener('change', (e) => {
      settings.reminderEnabled = e.target.checked;
      persistHighlightSettings();
      showSnackbar('整点提醒已' + (e.target.checked ? '开启' : '关闭'));
    });

    document.getElementById('quiet-start').addEventListener('change', (e) => {
      settings.reminderQuietStart = parseInt(e.target.value, 10) || 0;
      persistHighlightSettings();
      const padH = n => String(n).padStart(2, '0') + ':00';
      showSnackbar(`安静时段: ${padH(settings.reminderQuietStart)} 至 ${padH(settings.reminderQuietEnd)}`);
    });

    document.getElementById('quiet-end').addEventListener('change', (e) => {
      settings.reminderQuietEnd = parseInt(e.target.value, 10) || 0;
      persistHighlightSettings();
      const padH = n => String(n).padStart(2, '0') + ':00';
      showSnackbar(`安静时段: ${padH(settings.reminderQuietStart)} 至 ${padH(settings.reminderQuietEnd)}`);
    });

    document.getElementById('enable-browser-notify').addEventListener('change', (e) => {
      settings.browserNotify = e.target.checked;
      persistHighlightSettings();
      if (e.target.checked && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(() => {
          showSnackbar('已请求系统通知权限');
        }).catch(() => {});
      } else {
        showSnackbar('浏览器通知已' + (e.target.checked ? '开启' : '关闭'));
      }
    });

    document.getElementById('pdf-title').addEventListener('input', (e) => {
      settings.pdfTitle = e.target.value;
      persistHighlightSettings();
    });

    document.getElementById('one-click-name').addEventListener('input', (e) => {
      settings.oneClickName = e.target.value;
      persistHighlightSettings();
    });

    // ===== Clock (live time + manual edit) =====
    initClock();

    // ===== One-Click Preset =====
    initOneClickPreset();

    document.getElementById('btn-add-parent').addEventListener('click', () => {
      settings.parents.push({ id: genId(), name: '新检查内容', color: '#e8f0fe' });
      persistHighlightSettings();
      renderParents();
      renderCategories();
      renderPresetTargets();
      showSnackbar(`已添加「检查内容」，共 ${settings.parents.length} 项`);
    });

    document.getElementById('btn-add-category').addEventListener('click', () => {
      const parentId = settings.parents.length > 0 ? settings.parents[0].id : null;
      workingCategories.push({ id: genId(), name: '新类别', parentId, color: '#f0f4f8', subStatuses: [] });
      // 【关键】点击添加后立即写盘，用户退回去也能在表格里看到新列
      syncWorkingCategoriesImmediately();
      renderCategories();
      renderPresetTargets();
      showSnackbar(`已添加「新类别」，共 ${workingCategories.length} 项（可修改名称后再返回）`);
    });

    // Save category changes when user leaves or taps save
    // Add global save button (更突出 + 底部 safe-area 适配)
    const saveBar = document.createElement('div');
    saveBar.style.cssText = [
      'position:sticky',
      'bottom:calc(10px + env(safe-area-inset-bottom))',
      'display:flex',
      'gap:10px',
      'margin-top:18px',
      'z-index:25',
      'padding:8px 2px 4px',
      'background:linear-gradient(to top, #ffffff 70%, rgba(255,255,255,0.94))'
    ].join(';');
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary btn-block';
    saveBtn.textContent = '💾 保存所有更改并返回';
    saveBtn.style.minHeight = '52px';
    saveBtn.style.fontSize = '16px';
    saveBtn.style.fontWeight = '700';
    saveBtn.addEventListener('click', () => {
      // 先不弹确认直接存（已保存到 workingCategories，用户返回时再统一写盘）
      saveCategoryChanges();
    });
    saveBar.appendChild(saveBtn);
    document.querySelector('.settings-container').appendChild(saveBar);

    // Export
    document.getElementById('btn-export').addEventListener('click', () => {
      const data = {
        settings: loadSettings(),
        categories: loadCategories(),
        records: loadRecords(),
        exportDate: new Date().toISOString(),
      };
      document.getElementById('export-output').value = JSON.stringify(data, null, 2);
      showSnackbar('数据已导出');
    });

    // Import
    document.getElementById('btn-import').addEventListener('click', () => {
      const text = document.getElementById('import-input').value.trim();
      if (!text) {
        showSnackbar('请先粘贴 JSON 数据');
        return;
      }
      try {
        const data = JSON.parse(text);
        showDialog('导入数据', '导入将覆盖当前所有数据，确定继续？', () => {
          if (data.settings) localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(data.settings));
          if (data.categories) localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(data.categories));
          if (data.records) localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(data.records));
          showSnackbar('数据已导入');
          setTimeout(() => window.location.reload(), 800);
        });
      } catch (e) {
        showSnackbar('JSON 格式错误');
      }
    });

    // Clear all
    document.getElementById('btn-clear-all').addEventListener('click', () => {
      showDialog('清除全部数据', '确定要清除所有日期的记录吗？此操作不可恢复！', () => {
        showDialog('再次确认', '再次确认：将删除所有状态记录（不包括类别设置），确定继续？', () => {
          localStorage.removeItem(STORAGE_KEY_RECORDS);
          showSnackbar('所有记录已清除');
        });
      });
    });

    // Render
    renderCategories();
    renderParents();
  }

  function persistHighlightSettings() {
    saveSettings();
  }

  function loadRecords() {
    try {
      const r = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (r) return JSON.parse(r);
    } catch (e) { /* ignore */ }
    return {};
  }

  // ===== Simulated Time (Shared with app.js via localStorage) =====
  const STORAGE_KEY_TIME_OFFSET = 'status_time_offset_ms_v1';

  function getTimeOffsetMs() {
    const v = localStorage.getItem(STORAGE_KEY_TIME_OFFSET);
    return v ? parseInt(v, 10) || 0 : 0;
  }

  function setTimeOffsetMs(ms) {
    if (ms === 0) localStorage.removeItem(STORAGE_KEY_TIME_OFFSET);
    else localStorage.setItem(STORAGE_KEY_TIME_OFFSET, String(ms));
  }

  function getEffectiveNow() {
    return new Date(Date.now() + getTimeOffsetMs());
  }

  // GMT time formatting helpers
  function pad2(n) { return String(n).padStart(2, '0'); }
  function formatGMT(d) {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  }
  // GMT date string (YYYY-MM-DD) from a Date
  function gmtDateString(d) {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
  }
  // GMT time string (HH:MM:SS) from a Date
  function gmtTimeString(d) {
    return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  }
  // Parse GMT date+time strings into a Date (interpreted as GMT)
  function parseGMT(dateStr, timeStr) {
    if (!dateStr) return null;
    const t = timeStr || '00:00:00';
    const parts = t.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return new Date(`${dateStr}T${pad2(h)}:${pad2(m)}:${pad2(s)}Z`);
  }

  let clockTickTimer = null;

  function initClock() {
    const display = document.getElementById('clock-display');
    const hint = document.getElementById('clock-mode-hint');
    const editRow = document.getElementById('clock-edit-row');
    const editDate = document.getElementById('clock-edit-date');
    const editTime = document.getElementById('clock-edit-time');
    const btnEdit = document.getElementById('btn-clock-edit');
    const btnApply = document.getElementById('btn-clock-apply');
    const btnCancel = document.getElementById('btn-clock-cancel');
    const btnRefresh = document.getElementById('btn-clock-refresh');

    function render() {
      const now = getEffectiveNow();
      display.textContent = formatGMT(now);
      const offset = getTimeOffsetMs();
      if (offset === 0) {
        hint.textContent = '实时时间模式';
        hint.style.color = '#2e7d32';
      } else {
        const sign = offset > 0 ? '+' : '';
        const min = Math.round(offset / 60000);
        hint.textContent = `手动设置模式 (偏移 ${sign}${min} 分钟)`;
        hint.style.color = '#e65100';
      }
    }

    function tick() {
      render();
    }

    function stopTick() {
      if (clockTickTimer) { clearInterval(clockTickTimer); clockTickTimer = null; }
    }
    function startTick() {
      stopTick();
      render();
      clockTickTimer = setInterval(tick, 1000);
    }

    // Edit button: show edit row pre-filled with current GMT time
    btnEdit.addEventListener('click', () => {
      const now = getEffectiveNow();
      editDate.value = gmtDateString(now);
      editTime.value = gmtTimeString(now);
      editRow.classList.remove('hidden');
    });

    btnCancel.addEventListener('click', () => {
      editRow.classList.add('hidden');
    });

    btnApply.addEventListener('click', () => {
      const dateStr = editDate.value;
      const timeStr = editTime.value;
      if (!dateStr) { showSnackbar('请先选择日期'); return; }
      const target = parseGMT(dateStr, timeStr);
      if (!target || isNaN(target.getTime())) { showSnackbar('时间格式错误'); return; }
      const offset = target.getTime() - Date.now();
      setTimeOffsetMs(offset);
      editRow.classList.add('hidden');
      showSnackbar('已应用手动时间');
      render();
    });

    btnRefresh.addEventListener('click', () => {
      setTimeOffsetMs(0);
      editRow.classList.add('hidden');
      showSnackbar('已恢复实时时间');
      render();
    });

    startTick();
  }

  // DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
