(() => {
  const appEl = document.getElementById('app');
  const state = {
    authenticated: false,
    lists: [],
    colors: [],
    currentList: null,
    deletedLists: [],
    settings: { reminderEmail: '' },
    error: '',
    busy: false,
    completedExpanded: {},
  };

  let listOrderRequest = 0;
  let itemOrderRequest = 0;

  function parseRoute() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const parts = hash.split('/').filter(Boolean);
    if (parts.length === 0) return { name: 'home' };
    if (parts[0] === 'list' && parts[1]) return { name: 'list', id: parts[1] };
    if (parts[0] === 'new') return { name: 'new' };
    if (parts[0] === 'bin') return { name: 'bin' };
    if (parts[0] === 'settings') return { name: 'settings' };
    return { name: 'home' };
  }

  function navigate(path) {
    location.hash = path;
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    let body = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: text };
      }
    }

    if (!res.ok) {
      const err = new Error(body?.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    return body;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function progressPct(list) {
    const total = list.progress?.total || 0;
    const done = list.progress?.done || 0;
    if (!total) return 0;
    return Math.round((done / total) * 100);
  }

  function formatDue(dueDate) {
    if (!dueDate) return '';
    return `Due ${dueDate}`;
  }

  function renderPin() {
    appEl.innerHTML = `
      <section class="screen">
        <div class="glossy pin-card">
          <h1 class="brand">Koodo Todo</h1>
          <p>Enter your PIN to unlock this device</p>
          <p class="error" id="pin-error">${escapeHtml(state.error)}</p>
          <form id="pin-form">
            <input class="pin-input" id="pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="12" placeholder="••••" required />
            <button class="primary-btn" type="submit" style="width:100%">Unlock</button>
          </form>
        </div>
      </section>
    `;

    document.getElementById('pin-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const pin = document.getElementById('pin-input').value;
      state.error = '';
      try {
        await api('/api/auth/unlock', { method: 'POST', body: JSON.stringify({ pin }) });
        state.authenticated = true;
        await route();
      } catch (err) {
        state.error = err.message || 'Invalid PIN';
        renderPin();
      }
    });

    document.getElementById('pin-input').focus();
  }

  function topbar(title, { back = '#/', actions = '' } = {}) {
    return `
      <div class="topbar">
        <button class="icon-btn" type="button" data-nav="${escapeHtml(back)}" aria-label="Back">←</button>
        <h1>${title}</h1>
        ${actions}
      </div>
    `;
  }

  function listCardBody(list) {
    const pct = progressPct(list);
    return `
      <div class="edge" style="background:${escapeHtml(list.color)}; color:${escapeHtml(list.color)}"></div>
      <div class="meta">
        <div class="name">${escapeHtml(list.name)}</div>
        <div class="sub">
          ${list.daily ? '<span class="badge">Daily</span>' : ''}
          ${list.dueDate ? `<span class="badge">${escapeHtml(formatDue(list.dueDate))}</span>` : ''}
          <span>${list.progress.done}/${list.progress.total}</span>
        </div>
      </div>
      <div class="progress-ring" style="--pct:${pct}; --accent:${escapeHtml(list.color)}">${pct}%</div>
    `;
  }

  function renderHome() {
    const canReorder = state.lists.length > 1;
    const cards = state.lists.length
      ? state.lists.map((list) => {
        const body = listCardBody(list);
        if (!canReorder) {
          return `
            <a class="glossy list-card" href="#/list/${escapeHtml(list.id)}" style="--accent:${escapeHtml(list.color)}">
              ${body}
            </a>
          `;
        }
        return `
          <div class="glossy list-card sortable" data-list-id="${escapeHtml(list.id)}" data-reorder-id="${escapeHtml(list.id)}" style="--accent:${escapeHtml(list.color)}">
            <button type="button" class="drag-handle" data-drag-handle aria-label="Drag to reorder ${escapeHtml(list.name)}">
              <span class="grip" aria-hidden="true"></span>
            </button>
            <a class="list-open" href="#/list/${escapeHtml(list.id)}" draggable="false">
              ${body}
            </a>
          </div>
        `;
      }).join('')
      : `<div class="glossy empty">No lists yet. Create your first one.</div>`;

    appEl.innerHTML = `
      <section class="screen">
        <div class="topbar">
          <h1 class="brand">Koodo Todo</h1>
          <button class="icon-btn" type="button" data-nav="#/settings" aria-label="Settings">⚙</button>
        </div>
        <div class="fab-row">
          <button class="primary-btn" type="button" data-nav="#/new">New list</button>
          <button class="ghost-btn" type="button" data-nav="#/bin">Recycle bin</button>
        </div>
        <div class="list-grid">${cards}</div>
      </section>
    `;

    if (canReorder) wireListReorder();
  }

  function wireListReorder() {
    wireSortable(appEl.querySelector('.list-grid'), (ids) => persistListOrder(ids));
  }

  function sortableHandle(itemEl) {
    if (itemEl.classList.contains('item-group')) {
      return itemEl.querySelector(':scope > .item-row > [data-drag-handle]');
    }
    return itemEl.querySelector(':scope > [data-drag-handle]');
  }

  function wireSortable(container, onCommit) {
    if (!container || !onCommit) return;

    container.querySelectorAll(':scope > [data-reorder-id]').forEach((itemEl) => {
      const handle = sortableHandle(itemEl);
      if (!handle) return;

      handle.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        startSortDrag(event, handle, itemEl, container, onCommit);
      });

      handle.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        moveSortable(container, itemEl, event.key === 'ArrowUp' ? -1 : 1, onCommit);
        handle.focus();
      });
    });
  }

  function moveSortable(container, itemEl, direction, onCommit) {
    const items = [...container.querySelectorAll(':scope > [data-reorder-id]')];
    const index = items.indexOf(itemEl);
    const nextIndex = index + direction;
    if (index === -1 || nextIndex < 0 || nextIndex >= items.length) return;
    const sibling = items[nextIndex];
    if (direction < 0) container.insertBefore(itemEl, sibling);
    else container.insertBefore(sibling, itemEl);
    onCommit(sortableIds(container));
  }

  function sortableIds(container) {
    return [...container.querySelectorAll(':scope > [data-reorder-id]')].map((el) => el.dataset.reorderId);
  }

  function startSortDrag(event, handle, itemEl, container, onCommit) {
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Some synthetic pointers cannot be captured; the handle still receives the gesture.
    }
    const originX = event.clientX;
    const originY = event.clientY;
    const originRect = itemEl.getBoundingClientRect();
    let dragging = false;
    let placeholder = null;

    function lift(clientX, clientY) {
      dragging = true;
      placeholder = document.createElement('div');
      placeholder.className = 'reorder-placeholder';
      placeholder.style.height = `${originRect.height}px`;
      container.insertBefore(placeholder, itemEl);
      itemEl.classList.add('dragging');
      itemEl.style.width = `${originRect.width}px`;
      itemEl.style.position = 'fixed';
      itemEl.style.left = `${clientX - (originX - originRect.left)}px`;
      itemEl.style.top = `${clientY - (originY - originRect.top)}px`;
      itemEl.style.margin = '0';
      itemEl.style.zIndex = '30';
      document.body.appendChild(itemEl);
    }

    function placePlaceholder(clientY) {
      const siblings = [...container.querySelectorAll(':scope > [data-reorder-id]')];
      let before = null;
      for (const sibling of siblings) {
        const box = sibling.getBoundingClientRect();
        if (clientY < box.top + box.height / 2) {
          before = sibling;
          break;
        }
      }
      if (before) {
        if (placeholder.nextElementSibling !== before) container.insertBefore(placeholder, before);
      } else if (container.lastElementChild !== placeholder) {
        container.appendChild(placeholder);
      }
    }

    function onMove(moveEvent) {
      if (moveEvent.pointerId !== event.pointerId) return;
      if (!dragging) {
        const dx = moveEvent.clientX - originX;
        const dy = moveEvent.clientY - originY;
        if (dx * dx + dy * dy < 16) return;
        lift(moveEvent.clientX, moveEvent.clientY);
      }
      const offsetX = originX - originRect.left;
      const offsetY = originY - originRect.top;
      itemEl.style.left = `${moveEvent.clientX - offsetX}px`;
      itemEl.style.top = `${moveEvent.clientY - offsetY}px`;
      const edge = 56;
      if (moveEvent.clientY < edge) window.scrollBy(0, -12);
      else if (moveEvent.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
      placePlaceholder(moveEvent.clientY);
    }

    function finish() {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      if (!dragging) return;

      itemEl.classList.remove('dragging');
      itemEl.style.position = '';
      itemEl.style.left = '';
      itemEl.style.top = '';
      itemEl.style.width = '';
      itemEl.style.margin = '';
      itemEl.style.zIndex = '';
      container.insertBefore(itemEl, placeholder);
      placeholder.remove();
      onCommit(sortableIds(container));
    }

    function onUp(upEvent) {
      if (upEvent.pointerId !== event.pointerId) return;
      finish();
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  async function persistListOrder(ids) {
    const previous = state.lists.map((list) => list.id);
    if (ids.length === previous.length && ids.every((id, index) => id === previous[index])) return;

    const byId = new Map(state.lists.map((list) => [list.id, list]));
    state.lists = ids.map((id) => byId.get(id)).filter(Boolean);
    const requestId = ++listOrderRequest;

    try {
      const data = await api('/api/lists/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (requestId !== listOrderRequest) return;
      state.lists = data.lists;
    } catch (err) {
      if (requestId !== listOrderRequest) return;
      try {
        await loadHome();
        renderHome();
      } catch {
        state.error = err.message || 'Could not save list order';
      }
    }
  }

  function colorPicker(selected) {
    return `
      <div class="color-row">
        ${state.colors.map((color) => `
          <button type="button" class="color-swatch ${color === selected ? 'selected' : ''}" data-color="${escapeHtml(color)}" style="background:${escapeHtml(color)}" aria-label="Color ${escapeHtml(color)}"></button>
        `).join('')}
      </div>
    `;
  }

  function renderNewList() {
    const selected = state.colors[0] || '#5B8DEF';
    appEl.innerHTML = `
      <section class="screen">
        ${topbar('New list')}
        <form class="glossy list-settings" id="new-list-form">
          <div class="field-group">
            <label for="list-name">Name</label>
            <input class="field" id="list-name" name="name" required maxlength="80" placeholder="Groceries" />
          </div>
          <div class="field-group">
            <label>Color</label>
            ${colorPicker(selected)}
            <input type="hidden" name="color" id="list-color" value="${escapeHtml(selected)}" />
          </div>
          <div class="field-group">
            <label for="list-due">Due date (optional)</label>
            <input class="field" id="list-due" name="dueDate" type="date" />
          </div>
          <div class="toggle-row">
            <span>Daily list (resets each day)</span>
            <button type="button" class="toggle" id="daily-toggle" aria-pressed="false"></button>
          </div>
          <p class="error" id="form-error"></p>
          <button class="primary-btn" type="submit" style="width:100%; margin-top:12px">Create</button>
        </form>
      </section>
    `;

    wireColorPicker();
    wireToggle(document.getElementById('daily-toggle'));

    document.getElementById('new-list-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      const payload = {
        name: form.name.value,
        color: form.color.value,
        dueDate: form.dueDate.value || null,
        daily: document.getElementById('daily-toggle').classList.contains('on'),
      };
      try {
        const data = await api('/api/lists', { method: 'POST', body: JSON.stringify(payload) });
        navigate(`#/list/${data.list.id}`);
      } catch (err) {
        document.getElementById('form-error').textContent = err.message;
      }
    });
  }

  function wireColorPicker() {
    document.querySelectorAll('.color-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach((el) => el.classList.remove('selected'));
        btn.classList.add('selected');
        const hidden = document.getElementById('list-color');
        if (hidden) hidden.value = btn.dataset.color;
      });
    });
  }

  function wireToggle(el) {
    if (!el) return;
    el.addEventListener('click', () => {
      const on = el.classList.toggle('on');
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      const target = document.getElementById(el.dataset.reveal);
      if (target) target.classList.toggle('hidden', !on);
    });
  }

  function renderList() {
    const list = state.currentList;
    if (!list) {
      appEl.innerHTML = `<section class="screen">${topbar('Missing')}<div class="empty">List not found.</div></section>`;
      return;
    }

    const { openItems, doneItems, detached, checkedCount } = splitItems(list);
    const openHtml = list.items.length
      ? openItems.map((item) => itemGroup(item, { draggable: openItems.length > 1 })).join('')
      : `<div class="glossy empty">No items yet.</div>`;
    const completedOpen = Boolean(state.completedExpanded[list.id]);
    const completedHtml = checkedCount
      ? `
        <details class="glossy completed-section" ${completedOpen ? 'open' : ''}>
          <summary>
            <span class="completed-label"><span class="chevron" aria-hidden="true"></span>Completed</span>
            <span class="badge">${checkedCount}</span>
          </summary>
          <div class="completed-body">
            <div class="items completed-items" data-sortable="done">${doneItems.map((item) => itemGroup(item, { draggable: doneItems.length > 1 })).join('')}</div>
            ${detached.length ? `<div class="detached-items">${detached.map(({ parent, child }) => itemRow(child, { child: true, context: parent.text })).join('')}</div>` : ''}
          </div>
        </details>
      `
      : '';

    appEl.innerHTML = `
      <section class="screen">
        ${topbar(escapeHtml(list.name), {
          actions: `<button class="icon-btn" type="button" id="toggle-settings" aria-label="List settings">⋯</button>`,
        })}
        ${state.showListSettings ? `
        <div class="glossy list-settings" id="list-settings">
          <div class="field-group">
            <label for="edit-name">Name</label>
            <input class="field" id="edit-name" value="${escapeHtml(list.name)}" maxlength="80" />
          </div>
          <div class="field-group">
            <label>Color</label>
            ${colorPicker(list.color)}
            <input type="hidden" id="list-color" value="${escapeHtml(list.color)}" />
          </div>
          <div class="field-group">
            <label for="edit-due">Due date</label>
            <input class="field" id="edit-due" type="date" value="${escapeHtml(list.dueDate || '')}" />
          </div>
          <div class="toggle-row">
            <span>Daily list</span>
            <button type="button" class="toggle ${list.daily ? 'on' : ''}" id="edit-daily" aria-pressed="${list.daily}"></button>
          </div>
          <div class="toggle-row">
            <span>Daily email reminder</span>
            <button type="button" class="toggle ${list.reminder.dailyEnabled ? 'on' : ''}" id="edit-daily-email" data-reveal="daily-time-group" aria-pressed="${list.reminder.dailyEnabled}"></button>
          </div>
          <div class="field-group ${list.reminder.dailyEnabled ? '' : 'hidden'}" id="daily-time-group">
            <label for="edit-daily-time">Reminder time (Chicago)</label>
            <input class="field" id="edit-daily-time" type="time" value="${escapeHtml(list.reminder.dailyTime || '09:00')}" />
          </div>
          <div class="toggle-row">
            <span>Email on due date (8:00 AM Chicago)</span>
            <button type="button" class="toggle ${list.reminder.dueDateEnabled ? 'on' : ''}" id="edit-due-email" aria-pressed="${list.reminder.dueDateEnabled}"></button>
          </div>
          <p class="error" id="settings-error"></p>
          <div class="row-actions" style="margin-top:12px">
            <button class="primary-btn" type="button" id="save-list">Save</button>
            <button class="danger-btn" type="button" id="delete-list">Delete</button>
          </div>
        </div>` : ''}
        <div class="list-body">
          <div class="items" data-sortable="open">${openHtml}</div>
          ${completedHtml}
        </div>
        <form class="glossy composer" id="add-item-form">
          <input class="item-input" id="new-item-text" placeholder="Add an item" maxlength="500" required />
          <button class="primary-btn" type="submit">Add</button>
        </form>
      </section>
    `;

    document.getElementById('toggle-settings').addEventListener('click', () => {
      state.showListSettings = !state.showListSettings;
      renderList();
    });

    if (state.showListSettings) {
      wireColorPicker();
      wireToggle(document.getElementById('edit-daily'));
      wireToggle(document.getElementById('edit-daily-email'));
      wireToggle(document.getElementById('edit-due-email'));

      document.getElementById('save-list').addEventListener('click', async () => {
        try {
          const payload = {
            name: document.getElementById('edit-name').value,
            color: document.getElementById('list-color').value,
            dueDate: document.getElementById('edit-due').value || null,
            daily: document.getElementById('edit-daily').classList.contains('on'),
            reminder: {
              dailyEnabled: document.getElementById('edit-daily-email').classList.contains('on'),
              dailyTime: document.getElementById('edit-daily-time').value || '09:00',
              dueDateEnabled: document.getElementById('edit-due-email').classList.contains('on'),
            },
          };
          const data = await api(`/api/lists/${list.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
          state.currentList = data.list;
          state.showListSettings = false;
          renderList();
        } catch (err) {
          document.getElementById('settings-error').textContent = err.message;
        }
      });

      document.getElementById('delete-list').addEventListener('click', async () => {
        if (!confirm('Move this list to the recycle bin?')) return;
        await api(`/api/lists/${list.id}`, { method: 'DELETE' });
        navigate('#/');
      });
    }

    document.getElementById('add-item-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = document.getElementById('new-item-text').value;
      const data = await api(`/api/lists/${list.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      state.currentList = data.list;
      renderList();
    });

    appEl.querySelectorAll('[data-toggle-item]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemId = btn.dataset.toggleItem;
        const completed = btn.dataset.completed !== 'true';
        const data = await api(`/api/lists/${list.id}/items/${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify({ completed }),
        });
        state.currentList = data.list;
        renderList();
      });
    });

    appEl.querySelectorAll('[data-add-sub]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const text = prompt('Sub-item text');
        if (!text) return;
        const data = await api(`/api/lists/${list.id}/items/${btn.dataset.addSub}/subitems`, {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        state.currentList = data.list;
        renderList();
      });
    });

    appEl.querySelectorAll('[data-delete-item]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const data = await api(`/api/lists/${list.id}/items/${btn.dataset.deleteItem}`, {
          method: 'DELETE',
        });
        state.currentList = data.list;
        renderList();
      });
    });

    const completedSection = appEl.querySelector('.completed-section');
    if (completedSection) {
      completedSection.addEventListener('toggle', () => {
        state.completedExpanded[list.id] = completedSection.open;
      });
    }

    wireItemReorder();
  }

  function splitItems(list) {
    const openItems = [];
    const doneItems = [];
    const detached = [];
    let checkedCount = 0;

    for (const item of list.items) {
      if (item.completed) {
        doneItems.push(item);
        checkedCount += 1;
        for (const child of item.children || []) {
          if (child.completed) checkedCount += 1;
        }
      } else {
        openItems.push(item);
        for (const child of item.children || []) {
          if (!child.completed) continue;
          detached.push({ parent: item, child });
          checkedCount += 1;
        }
      }
    }

    return { openItems, doneItems, detached, checkedCount };
  }

  function itemGroup(item, { draggable }) {
    const children = item.completed
      ? (item.children || [])
      : (item.children || []).filter((child) => !child.completed);
    const childrenDraggable = children.length > 1;
    const childRows = children.map((child) => itemRow(child, {
      child: true,
      draggable: childrenDraggable,
      reorderId: child.id,
    })).join('');

    return `
      <div class="item-group" data-reorder-id="${escapeHtml(item.id)}">
        ${itemRow(item, { draggable })}
        ${childRows ? `<div class="subitems" data-parent-id="${escapeHtml(item.id)}">${childRows}</div>` : ''}
      </div>
    `;
  }

  function itemRow(item, { child = false, draggable = false, reorderId = '', context = '' } = {}) {
    const handle = draggable
      ? `<button type="button" class="drag-handle" data-drag-handle aria-label="Drag to reorder ${escapeHtml(item.text)}"><span class="grip" aria-hidden="true"></span></button>`
      : '';
    return `
      <div class="glossy item-row ${child ? 'child' : ''} ${draggable ? '' : 'no-drag'}" ${reorderId ? `data-reorder-id="${escapeHtml(reorderId)}"` : ''}>
        ${handle}
        <button type="button" class="check ${item.completed ? 'on' : ''}" data-toggle-item="${escapeHtml(item.id)}" data-completed="${item.completed ? 'true' : 'false'}" aria-label="${item.completed ? 'Mark not done' : 'Mark done'}">✓</button>
        <div class="item-copy">
          <div class="item-text ${item.completed ? 'done' : ''}">${escapeHtml(item.text)}</div>
          ${context ? `<div class="item-context">${escapeHtml(context)}</div>` : ''}
        </div>
        <div class="item-actions">
          ${child ? '' : `<button type="button" data-add-sub="${escapeHtml(item.id)}" aria-label="Add sub-item">+</button>`}
          <button type="button" data-delete-item="${escapeHtml(item.id)}" aria-label="Delete">✕</button>
        </div>
      </div>
    `;
  }

  function sameIds(left, right) {
    return left.length === right.length && left.every((id, index) => id === right[index]);
  }

  function wireItemReorder() {
    const list = state.currentList;
    if (!list) return;

    wireSortable(appEl.querySelector('[data-sortable="open"]'), (openIds) => {
      const doneIds = state.currentList.items.filter((item) => item.completed).map((item) => item.id);
      persistItemOrder([...openIds, ...doneIds]);
    });

    wireSortable(appEl.querySelector('[data-sortable="done"]'), (doneIds) => {
      const openIds = state.currentList.items.filter((item) => !item.completed).map((item) => item.id);
      persistItemOrder([...openIds, ...doneIds]);
    });

    appEl.querySelectorAll('.subitems').forEach((container) => {
      wireSortable(container, (childIds) => {
        const parent = state.currentList.items.find((item) => item.id === container.dataset.parentId);
        if (!parent) return;
        const doneChildIds = parent.completed
          ? []
          : (parent.children || []).filter((child) => child.completed).map((child) => child.id);
        persistSubItemOrder(parent.id, [...childIds, ...doneChildIds]);
      });
    });
  }

  async function persistItemOrder(ids) {
    const list = state.currentList;
    if (!list) return;
    const previous = list.items.map((item) => item.id);
    if (sameIds(ids, previous)) return;

    const byId = new Map(list.items.map((item) => [item.id, item]));
    const requestId = ++itemOrderRequest;
    list.items = ids.map((id) => byId.get(id)).filter(Boolean);

    try {
      const data = await api(`/api/lists/${list.id}/items/reorder`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (requestId !== itemOrderRequest) return;
      state.currentList = data.list;
    } catch (err) {
      if (requestId !== itemOrderRequest) return;
      try {
        await loadList(list.id);
        renderList();
      } catch {
        state.error = err.message || 'Could not save item order';
      }
    }
  }

  async function persistSubItemOrder(parentId, ids) {
    const list = state.currentList;
    if (!list) return;
    const parent = list.items.find((item) => item.id === parentId);
    if (!parent) return;
    const previous = (parent.children || []).map((child) => child.id);
    if (sameIds(ids, previous)) return;

    const byId = new Map((parent.children || []).map((child) => [child.id, child]));
    const requestId = ++itemOrderRequest;
    parent.children = ids.map((id) => byId.get(id)).filter(Boolean);

    try {
      const data = await api(`/api/lists/${list.id}/items/${parentId}/subitems/reorder`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      if (requestId !== itemOrderRequest) return;
      state.currentList = data.list;
    } catch (err) {
      if (requestId !== itemOrderRequest) return;
      try {
        await loadList(list.id);
        renderList();
      } catch {
        state.error = err.message || 'Could not save item order';
      }
    }
  }

  function renderBin() {
    const cards = state.deletedLists.length
      ? state.deletedLists.map((list) => `
          <div class="glossy list-card" style="--accent:${escapeHtml(list.color)}">
            <div class="edge" style="background:${escapeHtml(list.color)}; color:${escapeHtml(list.color)}"></div>
            <div class="meta">
              <div class="name">${escapeHtml(list.name)}</div>
              <div class="sub muted">Deleted ${escapeHtml((list.deletedAt || '').slice(0, 10))}</div>
            </div>
            <div class="item-actions" style="flex-direction:column">
              <button type="button" class="text-btn" data-restore="${escapeHtml(list.id)}">Restore</button>
              <button type="button" class="text-btn" data-purge="${escapeHtml(list.id)}" style="color:var(--danger)">Delete</button>
            </div>
          </div>
        `).join('')
      : `<div class="glossy empty">Recycle bin is empty.</div>`;

    appEl.innerHTML = `
      <section class="screen">
        ${topbar('Recycle bin')}
        <div class="list-grid">${cards}</div>
      </section>
    `;

    appEl.querySelectorAll('[data-restore]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api(`/api/lists/${btn.dataset.restore}/restore`, { method: 'POST' });
        await loadBin();
        renderBin();
      });
    });

    appEl.querySelectorAll('[data-purge]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Permanently delete this list?')) return;
        await api(`/api/lists/${btn.dataset.purge}/permanent`, { method: 'DELETE' });
        await loadBin();
        renderBin();
      });
    });
  }

  function renderSettings() {
    appEl.innerHTML = `
      <section class="screen">
        ${topbar('Settings')}
        <form class="glossy settings-panel" id="settings-form">
          <div class="field-group">
            <label for="reminder-email">Reminder email</label>
            <input class="field" id="reminder-email" type="email" value="${escapeHtml(state.settings.reminderEmail || '')}" placeholder="you@example.com" />
            <p class="muted">Daily and due-date reminders for all lists go to this address.</p>
          </div>
          <p class="error" id="settings-error"></p>
          <button class="primary-btn" type="submit" style="width:100%">Save</button>
        </form>
        <button class="ghost-btn" type="button" id="lock-device" style="width:100%">Lock this device</button>
      </section>
    `;

    document.getElementById('settings-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = await api('/api/settings', {
          method: 'PATCH',
          body: JSON.stringify({ reminderEmail: document.getElementById('reminder-email').value }),
        });
        state.settings = data.settings;
        document.getElementById('settings-error').textContent = 'Saved.';
        document.getElementById('settings-error').style.color = 'var(--ok)';
      } catch (err) {
        document.getElementById('settings-error').textContent = err.message;
        document.getElementById('settings-error').style.color = 'var(--danger)';
      }
    });

    document.getElementById('lock-device').addEventListener('click', async () => {
      await api('/api/auth/lock', { method: 'POST' });
      state.authenticated = false;
      state.error = '';
      renderPin();
    });
  }

  async function loadHome() {
    const data = await api('/api/lists');
    state.lists = data.lists;
    state.colors = data.colors;
  }

  async function loadList(id) {
    const data = await api(`/api/lists/${id}`);
    state.currentList = data.list;
    state.colors = data.colors;
  }

  async function loadBin() {
    const data = await api('/api/lists/deleted');
    state.deletedLists = data.lists;
  }

  async function loadSettings() {
    const data = await api('/api/settings');
    state.settings = data.settings;
  }

  async function route() {
    if (!state.authenticated) {
      renderPin();
      return;
    }

    const routeInfo = parseRoute();
    try {
      if (routeInfo.name === 'home') {
        await loadHome();
        renderHome();
      } else if (routeInfo.name === 'new') {
        if (!state.colors.length) await loadHome();
        renderNewList();
      } else if (routeInfo.name === 'list') {
        state.showListSettings = false;
        await loadList(routeInfo.id);
        renderList();
      } else if (routeInfo.name === 'bin') {
        await loadBin();
        renderBin();
      } else if (routeInfo.name === 'settings') {
        await loadSettings();
        renderSettings();
      }
    } catch (err) {
      if (err.status === 401) {
        state.authenticated = false;
        renderPin();
        return;
      }
      appEl.innerHTML = `<section class="screen"><div class="glossy empty">${escapeHtml(err.message)}</div></section>`;
    }
  }

  appEl.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (!nav) return;
    event.preventDefault();
    navigate(nav.dataset.nav);
  });

  window.addEventListener('hashchange', () => {
    route();
  });

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service worker registration failed', err);
      });
    });
  }

  async function boot() {
    registerServiceWorker();
    try {
      await api('/api/auth/session');
      state.authenticated = true;
    } catch {
      state.authenticated = false;
    }
    await route();
  }

  boot();
})();

