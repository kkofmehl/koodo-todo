const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const config = require('../config');
const { formatChicagoDateKey, parseTimeHHMM } = require('../time/chicago');

const STORE_FILE = 'todos.json';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function emptyState() {
  return {
    settings: { reminderEmail: '' },
    lists: [],
    devices: [],
    reminderSends: {},
  };
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

function sanitizeName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, config.MAX_LIST_NAME_LENGTH);
  return trimmed || null;
}

function sanitizeItemText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, config.MAX_ITEM_TEXT_LENGTH);
  return trimmed || null;
}

function sanitizeColor(value) {
  if (typeof value !== 'string') return null;
  const color = value.trim().toUpperCase();
  const allowed = config.LIST_COLORS.map((c) => c.toUpperCase());
  const index = allowed.indexOf(color);
  if (index === -1) return null;
  return config.LIST_COLORS[index];
}

function sanitizeDueDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !DATE_RE.test(value)) return undefined;
  return value;
}

function defaultReminder() {
  return {
    dailyEnabled: false,
    dailyTime: '09:00',
    dueDateEnabled: false,
  };
}

function sanitizeReminder(input, current = defaultReminder()) {
  const next = { ...current };
  if (!input || typeof input !== 'object') return next;

  if (Object.prototype.hasOwnProperty.call(input, 'dailyEnabled')) {
    next.dailyEnabled = Boolean(input.dailyEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'dueDateEnabled')) {
    next.dueDateEnabled = Boolean(input.dueDateEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'dailyTime')) {
    const parsed = parseTimeHHMM(input.dailyTime);
    if (!parsed) return null;
    next.dailyTime = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
  }
  return next;
}

function createItem(text) {
  return {
    id: randomUUID(),
    text,
    completedOn: null,
    children: [],
  };
}

class TodoStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.storePath = path.join(dataDir, STORE_FILE);
    this.state = emptyState();
    this.writeQueue = Promise.resolve();
  }

  init() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.storePath)) {
      this._writeSync(emptyState());
    }
    const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
    this.state = {
      settings: {
        reminderEmail: typeof raw?.settings?.reminderEmail === 'string'
          ? raw.settings.reminderEmail
          : '',
      },
      lists: Array.isArray(raw?.lists) ? raw.lists : [],
      devices: Array.isArray(raw?.devices) ? raw.devices : [],
      reminderSends: raw?.reminderSends && typeof raw.reminderSends === 'object'
        ? raw.reminderSends
        : {},
    };
  }

  _persist() {
    this.writeQueue = this.writeQueue.then(() => this._write(this.state));
    return this.writeQueue;
  }

  _writeSync(data) {
    const tmp = `${this.storePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.storePath);
  }

  async _write(data) {
    const tmp = `${this.storePath}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.promises.rename(tmp, this.storePath);
  }

  getSettings() {
    return { ...this.state.settings };
  }

  updateSettings(updates = {}) {
    if (Object.prototype.hasOwnProperty.call(updates, 'reminderEmail')) {
      const normalized = normalizeEmail(updates.reminderEmail);
      if (normalized === null) return null;
      this.state.settings.reminderEmail = normalized;
    }
    this._persist();
    return this.getSettings();
  }

  getActiveLists() {
    return this.state.lists.filter((list) => !list.deletedAt).map((list) => this._cloneList(list));
  }

  getDeletedLists() {
    return this.state.lists
      .filter((list) => list.deletedAt)
      .map((list) => this._cloneList(list))
      .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  }

  getList(id) {
    const list = this.state.lists.find((entry) => entry.id === id);
    return list ? this._cloneList(list) : null;
  }

  _findList(id) {
    return this.state.lists.find((entry) => entry.id === id) || null;
  }

  _cloneList(list) {
    return JSON.parse(JSON.stringify(list));
  }

  createList({ name, color, dueDate = null, daily = false, reminder } = {}) {
    const sanitizedName = sanitizeName(name);
    const sanitizedColor = sanitizeColor(color);
    if (!sanitizedName || !sanitizedColor) return null;

    const due = sanitizeDueDate(dueDate);
    if (due === undefined) return null;

    const reminderConfig = sanitizeReminder(reminder);
    if (!reminderConfig) return null;

    const list = {
      id: randomUUID(),
      name: sanitizedName,
      color: sanitizedColor,
      dueDate: due,
      daily: Boolean(daily),
      reminder: reminderConfig,
      items: [],
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.state.lists.unshift(list);
    this._persist();
    return this._cloneList(list);
  }

  updateList(id, updates = {}) {
    const list = this._findList(id);
    if (!list || list.deletedAt) return null;

    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      const sanitizedName = sanitizeName(updates.name);
      if (!sanitizedName) return null;
      list.name = sanitizedName;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'color')) {
      const sanitizedColor = sanitizeColor(updates.color);
      if (!sanitizedColor) return null;
      list.color = sanitizedColor;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'dueDate')) {
      const due = sanitizeDueDate(updates.dueDate);
      if (due === undefined) return null;
      list.dueDate = due;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'daily')) {
      list.daily = Boolean(updates.daily);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'reminder')) {
      const reminderConfig = sanitizeReminder(updates.reminder, list.reminder);
      if (!reminderConfig) return null;
      list.reminder = reminderConfig;
    }

    list.updatedAt = new Date().toISOString();
    this._persist();
    return this._cloneList(list);
  }

  deleteList(id) {
    const list = this._findList(id);
    if (!list || list.deletedAt) return null;
    list.deletedAt = new Date().toISOString();
    list.updatedAt = list.deletedAt;
    this._persist();
    return this._cloneList(list);
  }

  restoreList(id) {
    const list = this._findList(id);
    if (!list || !list.deletedAt) return null;
    list.deletedAt = null;
    list.updatedAt = new Date().toISOString();
    this._persist();
    return this._cloneList(list);
  }

  permanentlyDeleteList(id) {
    const index = this.state.lists.findIndex((entry) => entry.id === id);
    if (index === -1) return false;
    if (!this.state.lists[index].deletedAt) return false;
    this.state.lists.splice(index, 1);
    this._persist();
    return true;
  }

  addItem(listId, { text } = {}) {
    const list = this._findList(listId);
    if (!list || list.deletedAt) return null;
    const sanitized = sanitizeItemText(text);
    if (!sanitized) return null;

    const item = createItem(sanitized);
    list.items.push(item);
    list.updatedAt = new Date().toISOString();
    this._persist();
    return { ...item, children: [] };
  }

  addSubItem(listId, parentItemId, { text } = {}) {
    const list = this._findList(listId);
    if (!list || list.deletedAt) return null;

    const parent = list.items.find((item) => item.id === parentItemId);
    if (!parent) return null;

    const sanitized = sanitizeItemText(text);
    if (!sanitized) return null;

    const child = {
      id: randomUUID(),
      text: sanitized,
      completedOn: null,
    };
    parent.children.push(child);
    list.updatedAt = new Date().toISOString();
    this._persist();
    return { ...child };
  }

  updateItemText(listId, itemId, text) {
    const located = this._locateItem(listId, itemId);
    if (!located) return null;
    const sanitized = sanitizeItemText(text);
    if (!sanitized) return null;
    located.item.text = sanitized;
    located.list.updatedAt = new Date().toISOString();
    this._persist();
    return JSON.parse(JSON.stringify(located.item));
  }

  setItemCompleted(listId, itemId, completed, now = new Date()) {
    const located = this._locateItem(listId, itemId);
    if (!located) return null;

    if (completed) {
      located.item.completedOn = formatChicagoDateKey(now);
    } else {
      located.item.completedOn = null;
    }

    located.list.updatedAt = new Date().toISOString();
    this._persist();
    return JSON.parse(JSON.stringify(located.item));
  }

  deleteItem(listId, itemId) {
    const list = this._findList(listId);
    if (!list || list.deletedAt) return false;

    const itemIndex = list.items.findIndex((item) => item.id === itemId);
    if (itemIndex !== -1) {
      list.items.splice(itemIndex, 1);
      list.updatedAt = new Date().toISOString();
      this._persist();
      return true;
    }

    for (const item of list.items) {
      const childIndex = item.children.findIndex((child) => child.id === itemId);
      if (childIndex !== -1) {
        item.children.splice(childIndex, 1);
        list.updatedAt = new Date().toISOString();
        this._persist();
        return true;
      }
    }

    return false;
  }

  _locateItem(listId, itemId) {
    const list = this._findList(listId);
    if (!list || list.deletedAt) return null;

    for (const item of list.items) {
      if (item.id === itemId) return { list, item };
      for (const child of item.children || []) {
        if (child.id === itemId) return { list, item: child };
      }
    }
    return null;
  }

  registerDevice(token, now = new Date()) {
    if (!token || typeof token !== 'string') return null;
    const existing = this.state.devices.find((device) => device.token === token);
    if (existing) {
      existing.lastSeenAt = now.toISOString();
      this._persist();
      return { ...existing };
    }

    const device = {
      token,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    };
    this.state.devices.push(device);
    this._persist();
    return { ...device };
  }

  findDevice(token) {
    if (!token) return null;
    const device = this.state.devices.find((entry) => entry.token === token);
    return device ? { ...device } : null;
  }

  touchDevice(token, now = new Date()) {
    const device = this.state.devices.find((entry) => entry.token === token);
    if (!device) return null;
    device.lastSeenAt = now.toISOString();
    this._persist();
    return { ...device };
  }

  removeDevice(token) {
    const index = this.state.devices.findIndex((entry) => entry.token === token);
    if (index === -1) return false;
    this.state.devices.splice(index, 1);
    this._persist();
    return true;
  }

  hasReminderSend(key) {
    return Boolean(this.state.reminderSends[key]);
  }

  markReminderSend(key, now = new Date()) {
    this.state.reminderSends[key] = now.toISOString();
    this._persist();
  }

  getReminderSends() {
    return { ...this.state.reminderSends };
  }
}

module.exports = {
  TodoStore,
  normalizeEmail,
  sanitizeName,
  sanitizeColor,
  sanitizeDueDate,
};
