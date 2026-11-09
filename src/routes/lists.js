const express = require('express');
const { countProgress, isItemCompleted } = require('../completion');
const config = require('../config');

function decorateList(list, now = new Date()) {
  const progress = countProgress(list, now);
  return {
    ...list,
    progress,
    items: (list.items || []).map((item) => ({
      ...item,
      completed: isItemCompleted(item, list, now),
      children: (item.children || []).map((child) => ({
        ...child,
        completed: isItemCompleted(child, list, now),
      })),
    })),
  };
}

function createListsRouter(todoStore) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const lists = todoStore.getActiveLists().map((list) => decorateList(list));
    res.json({ lists, colors: config.LIST_COLORS });
  });

  router.post('/reorder', (req, res) => {
    const lists = todoStore.reorderLists(req.body?.ids);
    if (!lists) {
      return res.status(400).json({ error: 'Invalid list order' });
    }
    res.json({ lists: lists.map((list) => decorateList(list)) });
  });

  router.get('/deleted', (req, res) => {
    const lists = todoStore.getDeletedLists().map((list) => decorateList(list));
    res.json({ lists });
  });

  router.get('/:id', (req, res) => {
    const list = todoStore.getList(req.params.id);
    if (!list || list.deletedAt) {
      return res.status(404).json({ error: 'List not found' });
    }
    res.json({ list: decorateList(list), colors: config.LIST_COLORS });
  });

  router.post('/', (req, res) => {
    const list = todoStore.createList(req.body || {});
    if (!list) {
      return res.status(400).json({ error: 'Invalid list' });
    }
    res.status(201).json({ list: decorateList(list) });
  });

  router.patch('/:id', (req, res) => {
    const list = todoStore.updateList(req.params.id, req.body || {});
    if (!list) {
      return res.status(400).json({ error: 'Could not update list' });
    }
    res.json({ list: decorateList(list) });
  });

  router.delete('/:id', (req, res) => {
    const list = todoStore.deleteList(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    res.json({ list: decorateList(list) });
  });

  router.post('/:id/restore', (req, res) => {
    const list = todoStore.restoreList(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    res.json({ list: decorateList(list) });
  });

  router.delete('/:id/permanent', (req, res) => {
    const ok = todoStore.permanentlyDeleteList(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'List not found in recycle bin' });
    }
    res.json({ ok: true });
  });

  router.post('/:id/items/reorder', (req, res) => {
    const list = todoStore.reorderItems(req.params.id, req.body?.ids);
    if (!list) {
      return res.status(400).json({ error: 'Invalid item order' });
    }
    res.json({ list: decorateList(list) });
  });

  router.post('/:id/items/:itemId/subitems/reorder', (req, res) => {
    const list = todoStore.reorderSubItems(req.params.id, req.params.itemId, req.body?.ids);
    if (!list) {
      return res.status(400).json({ error: 'Invalid item order' });
    }
    res.json({ list: decorateList(list) });
  });

  router.post('/:id/items', (req, res) => {
    const item = todoStore.addItem(req.params.id, req.body || {});
    if (!item) {
      return res.status(400).json({ error: 'Could not add item' });
    }
    const list = decorateList(todoStore.getList(req.params.id));
    res.status(201).json({ item, list });
  });

  router.post('/:id/items/:itemId/subitems', (req, res) => {
    const item = todoStore.addSubItem(req.params.id, req.params.itemId, req.body || {});
    if (!item) {
      return res.status(400).json({ error: 'Could not add sub-item' });
    }
    const list = decorateList(todoStore.getList(req.params.id));
    res.status(201).json({ item, list });
  });

  router.patch('/:id/items/:itemId', (req, res) => {
    const { text, completed } = req.body || {};
    let item = null;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'text')) {
      item = todoStore.updateItemText(req.params.id, req.params.itemId, text);
      if (!item) {
        return res.status(400).json({ error: 'Could not update item text' });
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'completed')) {
      item = todoStore.setItemCompleted(req.params.id, req.params.itemId, Boolean(completed));
      if (!item) {
        return res.status(400).json({ error: 'Could not update item completion' });
      }
    }

    if (!item) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const list = decorateList(todoStore.getList(req.params.id));
    res.json({ item, list });
  });

  router.delete('/:id/items/:itemId', (req, res) => {
    const ok = todoStore.deleteItem(req.params.id, req.params.itemId);
    if (!ok) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const list = decorateList(todoStore.getList(req.params.id));
    res.json({ ok: true, list });
  });

  return router;
}

module.exports = { createListsRouter, decorateList };
