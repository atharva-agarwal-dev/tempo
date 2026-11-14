'use strict';

const $ = id => document.getElementById(id);
const editor = $('editor');
const form = $('editor-form');
const tagEditor = $('tag-editor');
const tagForm = $('tag-form');
const dayFormat = new Intl.DateTimeFormat('en', { weekday: 'short' });
const rangeFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });
const dueFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const quadrants = [
  ['do', 'Urgent & important'],
  ['plan', 'Important, less urgent'],
  ['delegate', 'Urgent, less important'],
  ['later', 'Less urgent & less important'],
];
const palette = {
  Sage: ['#304637', '#80bf8b', '#d9f4df'],
  Teal: ['#284443', '#7ac3b8', '#d7f4ee'],
  Blue: ['#2d4154', '#82b4eb', '#deedff'],
  Violet: ['#42354f', '#ba9cdd', '#f0e4ff'],
  Rose: ['#503943', '#d69aac', '#ffe4ed'],
  Amber: ['#4b402d', '#d7af69', '#ffebc7'],
  Slate: ['#354044', '#9eafb6', '#e3edf1'],
};

let records = [];
let store;
let week = monday(new Date());
let matrix = false;
let editing;
let editingTag;
let noticeTimer;
let positioned = false;

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function offsetDay(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function monday(date) {
  return offsetDay(date, -((date.getDay() + 6) % 7));
}

function minutes(time) {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

function hourLabel(hour) {
  return (hour % 12 || 12) + (hour < 12 ? ' AM' : ' PM');
}

function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, className, handler) {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

function notify(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 5000);
}

function setRecords(next) {
  records = next;
  if (store) render();
}

function currentView() {
  return location.hash === '#timepad' ? 'timepad' : 'weekly';
}

function render() {
  const view = currentView();
  for (const name of ['weekly', 'timepad']) {
    $(name).hidden = !store || view !== name;
    if (store && view === name) $(name + '-tab').setAttribute('aria-current', 'page');
    else $(name + '-tab').removeAttribute('aria-current');
  }
  if (!store) return;
  if (view === 'weekly') renderWeek();
  else renderTasks();
  if (tagEditor.open) renderTags();
}

function occursOn(event, date) {
  const key = dateKey(date);
  if (key === event.date) return true;
  return Boolean(event.repeatUntil && key > event.date && key <= event.repeatUntil &&
    date.getDay() === dateFromKey(event.date).getDay());
}

function weekEntries(date) {
  const key = dateKey(date);
  return records.filter(item => item.type === 'event'
    ? occursOn(item, date)
    : item.type === 'task' && item.showWeekly && item.slot?.date === key);
}

function placeEntries(entries) {
  const ordered = entries.map(item => {
    const time = item.type === 'event' ? item : item.slot;
    return { item, start: minutes(time.start), end: minutes(time.end) };
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  let group = [];
  let lanes = [];
  let groupEnd = -1;
  for (const block of ordered) {
    if (block.start >= groupEnd) {
      group = [];
      lanes = [];
      groupEnd = -1;
    }
    const available = lanes.findIndex(end => end <= block.start);
    block.lane = available === -1 ? lanes.length : available;
    lanes[block.lane] = block.end;
    groupEnd = Math.max(groupEnd, block.end);
    group.push(block);
    block.lanes = lanes;
  }
  return ordered;
}

function setEventColour(node, item) {
  const tag = records.find(record => record.type === 'tag' && record.id === item.tagId);
  const [bg, edge, text] = palette[tag?.color] ?? (item.type === 'task' ? palette.Violet : palette.Teal);
  node.style.setProperty('--event-bg', bg);
  node.style.setProperty('--event-edge', edge);
  node.style.setProperty('--event-text', text);
}

function renderWeek() {
  const dates = Array.from({ length: 7 }, (_, i) => offsetDay(week, i));
  const today = dateKey(new Date());
  $('week-title').textContent = rangeFormat.formatRange(dates[0], dates[6]);
  $('days').replaceChildren(element('div'));
  $('deadlines').replaceChildren(element('div', 'deadline-label', 'Due'));
  const labels = element('div', 'hour-labels');
  for (let h = 0; h < 24; h++) labels.append(element('div', 'hour-label', hourLabel(h)));
  $('calendar-grid').replaceChildren(labels);

  let hasDeadlines = false;
  for (const date of dates) {
    const key = dateKey(date);
    const isToday = key === today;
    const heading = element('div', 'day-heading' + (isToday ? ' is-today' : ''));
    heading.append(element('span', '', dayFormat.format(date)), element('span', 'day-number', date.getDate()));
    if (isToday) heading.setAttribute('aria-current', 'date');
    $('days').append(heading);

    const cell = element('div', 'deadline-cell');
    const deadlines = records.filter(item => item.type === 'task' && item.showWeekly && !item.slot && item.due === key);
    for (const task of deadlines) {
      const pill = button(task.title, task.done ? 'completed-block' : '', () => openEditor('task', task));
      pill.title = task.title;
      cell.append(pill);
      hasDeadlines = true;
    }
    $('deadlines').append(cell);

    const column = element('div', 'day-column' + (isToday ? ' is-today' : ''));
    for (let h = 0; h < 24; h++) {
      const slot = button('', 'slot', () => openEditor('event', null, {
        date: key, start: String(h).padStart(2, '0') + ':00',
        end: h === 23 ? '23:59' : String(h + 1).padStart(2, '0') + ':00',
      }));
      slot.tabIndex = -1;
      slot.setAttribute('aria-label', 'New event ' + dueFormat.format(date) + ', ' + hourLabel(h));
      column.append(slot);
    }

    for (const { item, start, end, lane, lanes } of placeEntries(weekEntries(date))) {
      const block = button(item.title, 'event' + (item.done ? ' completed-block' : ''), () => openEditor(item.type, item));
      block.title = item.title;
      block.style.setProperty('--top', (start / 14.4) + '%');
      block.style.setProperty('--height', 'calc(' + ((end - start) / 14.4) + '% - 2px)');
      block.style.setProperty('--left', 'calc(' + (100 * lane / lanes.length) + '% + 3px)');
      block.style.setProperty('--width', 'calc(' + (100 / lanes.length) + '% - 6px)');
      setEventColour(block, item);
      column.append(block);
    }
    if (isToday) column.append(element('div', 'now-line'));
    $('calendar-grid').append(column);
  }
  $('deadlines').hidden = !hasDeadlines;
  updateNowLine();
  if (!positioned) {
    $('calendar-scroll').scrollTop = 7 * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour'));
    positioned = true;
  }
}

function updateNowLine() {
  const line = document.querySelector('.now-line');
  if (!line) return;
  const now = new Date();
  line.style.setProperty('--top', ((now.getHours() * 60 + now.getMinutes()) / 14.4) + '%');
}

function taskGroup(title, tasks, options = {}) {
  const group = element('section', 'task-group' + (options.wide ? ' wide' : ''));
  group.append(element('h3', options.overdue ? 'overdue' : '', title));
  if (!tasks.length) {
    group.append(element('p', 'empty', 'No tasks here.'));
    return group;
  }
  const items = element('div', 'task-items');
  for (const task of tasks) {
    const row = element('div', 'task-row' + (task.done ? ' done' : ''));
    const check = element('input');
    check.type = 'checkbox';
    check.checked = task.done;
    check.setAttribute('aria-label', (task.done ? 'Reopen ' : 'Complete ') + task.title);
    check.addEventListener('change', async () => {
      check.disabled = true;
      try { await store.save({ ...task, done: check.checked }); }
      catch { check.checked = task.done; notify('Could not update that task.'); }
      finally { check.disabled = false; }
    });
    const titleButton = button(task.title, 'task-title', () => openEditor('task', task));
    titleButton.title = task.title;
    const date = task.due ? 'Due ' + dueFormat.format(dateFromKey(task.due)) : '';
    const scheduled = task.showWeekly && task.slot ? 'Scheduled ' + dueFormat.format(dateFromKey(task.slot.date)) : '';
    row.append(check, titleButton, element('span', 'task-date', [date, scheduled].filter(Boolean).join(' · ')));
    items.append(row);
  }
  group.append(items);
  return group;
}

function renderTasks() {
  const list = $('task-list');
  const tasks = records.filter(item => item.type === 'task').sort((a, b) =>
    (a.due || '9999').localeCompare(b.due || '9999') || b.createdAt - a.createdAt);
  const active = tasks.filter(task => !task.done);
  const completed = tasks.filter(task => task.done);
  const today = dateKey(new Date());
  $('list-view').setAttribute('aria-pressed', String(!matrix));
  $('matrix-view').setAttribute('aria-pressed', String(matrix));
  list.classList.toggle('matrix', matrix);
  list.replaceChildren();
  if (matrix) {
    for (const [value, title] of quadrants) list.append(taskGroup(title, active.filter(task => task.quadrant === value)));
    const unclassified = active.filter(task => !task.quadrant);
    if (unclassified.length) list.append(taskGroup('Unclassified', unclassified, { wide: true }));
  } else if (active.length) {
    const sections = [
      ['Overdue', active.filter(task => task.due && task.due < today), { overdue: true }],
      ['Upcoming', active.filter(task => task.due >= today)],
      ['No due date', active.filter(task => !task.due)],
    ];
    for (const [title, group, options] of sections) if (group.length) list.append(taskGroup(title, group, options));
  } else {
    list.append(element('p', 'empty', 'Nothing on your list. Type a task above and press Enter to add it.'));
  }
  if (completed.length) list.append(taskGroup('Completed', completed, { wide: true }));
}

function addOptions(select, options) {
  for (const [value, label] of options) select.add(new Option(label, value));
}

function updateEditorFields() {
  if (editing.type === 'event') {
    const repeating = form.elements.repeat.checked;
    $('repeat-fields').hidden = !repeating;
    form.elements.repeatUntil.disabled = !repeating;
    form.elements.repeatUntil.required = repeating;
    form.elements.repeatUntil.min = form.elements.date.value;
  } else {
    const showing = form.elements.showWeekly.checked;
    const timed = showing && form.elements.timed.checked;
    $('weekly-options').hidden = !showing;
    $('slot-fields').hidden = !timed;
    form.elements.timed.disabled = !showing;
    for (const name of ['slotDate', 'start', 'end']) {
      form.elements[name].disabled = !timed;
      form.elements[name].required = timed;
    }
  }
}

function openEditor(type, item, defaults = {}) {
  if (!store) return;
  editing = { type, item };
  $('editor-title').textContent = item
    ? (type === 'task' ? 'Edit task' : item.repeatUntil ? 'Edit weekly series' : 'Edit event')
    : (type === 'task' ? 'New task' : 'New event');
  $('delete-item').hidden = !item;
  $('editor-error').hidden = true;
  const shared = '<label>Name<input name="title" maxlength="160" required autofocus></label>';
  if (type === 'event') {
    $('editor-fields').innerHTML = shared + `
      <label>Date<input type="date" name="date" required></label>
      <div class="field-row">
        <label>Start time<input type="time" name="start" required></label>
        <label>End time<input type="time" name="end" required></label>
      </div>
      <label>Colour tag<select name="tagId"></select></label>
      <label class="check"><input type="checkbox" name="repeat"> Repeat weekly</label>
      <div id="repeat-fields"><label>Repeat through<input type="date" name="repeatUntil"></label></div>`;
    form.elements.date.value = item?.date ?? defaults.date ?? dateKey(new Date());
    form.elements.start.value = item?.start ?? defaults.start ?? '09:00';
    form.elements.end.value = item?.end ?? defaults.end ?? '10:00';
    form.elements.repeat.checked = Boolean(item?.repeatUntil);
    form.elements.repeatUntil.value = item?.repeatUntil ?? '';
    addOptions(form.elements.tagId, [['', 'No tag'], ...records.filter(record => record.type === 'tag')
      .sort((a, b) => a.title.localeCompare(b.title)).map(tag => [tag.id, tag.title])]);
    form.elements.tagId.value = item?.tagId ?? '';
    if (form.elements.tagId.selectedIndex < 0) form.elements.tagId.value = '';
  } else {
    $('editor-fields').innerHTML = shared + `
      <label>Due date <input type="date" name="due"></label>
      <label class="check"><input type="checkbox" name="showWeekly"> Show in Weekly</label>
      <div class="field-group" id="weekly-options">
        <label class="check"><input type="checkbox" name="timed"> Pick a time block</label>
        <div class="field-group" id="slot-fields">
          <label>Calendar date<input type="date" name="slotDate"></label>
          <div class="field-row">
            <label>Start time<input type="time" name="start"></label>
            <label>End time<input type="time" name="end"></label>
          </div>
        </div>
      </div>
      <label>Eisenhower quadrant<select name="quadrant"></select></label>`;
    form.elements.due.value = item?.due ?? '';
    form.elements.showWeekly.checked = Boolean(item?.showWeekly);
    form.elements.timed.checked = Boolean(item?.slot);
    form.elements.slotDate.value = item?.slot?.date ?? item?.due ?? dateKey(new Date());
    form.elements.start.value = item?.slot?.start ?? '09:00';
    form.elements.end.value = item?.slot?.end ?? '10:00';
    addOptions(form.elements.quadrant, [['', 'Unclassified'], ...quadrants]);
    form.elements.quadrant.value = item?.quadrant ?? '';
  }
  form.elements.title.value = item?.title ?? defaults.title ?? '';
  updateEditorFields();
  editor.showModal();
  form.elements.title.focus();
}

function showError(id, message) {
  $(id).textContent = message;
  $(id).hidden = false;
}

function taskRecord(title) {
  return {
    id: newId(), type: 'task', title, createdAt: Date.now(),
    due: '', showWeekly: false, slot: null, quadrant: '', done: false,
  };
}

form.addEventListener('change', event => {
  if (event.target.name === 'due' && !form.elements.timed.checked) {
    form.elements.slotDate.value = form.elements.due.value || dateKey(new Date());
  }
  updateEditorFields();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const { type, item } = editing;
  const fields = form.elements;
  const title = fields.title.value.trim();
  if (!title) return showError('editor-error', 'Enter a name.');
  if (fields.start && !fields.start.disabled && fields.end.value <= fields.start.value) {
    return showError('editor-error', 'End time must be after start time.');
  }
  let record;
  if (type === 'event') {
    record = {
      id: item?.id ?? newId(), type, title, date: fields.date.value,
      start: fields.start.value, end: fields.end.value, tagId: fields.tagId.value,
      repeatUntil: fields.repeat.checked ? fields.repeatUntil.value : '',
    };
  } else {
    record = {
      ...(item ?? taskRecord(title)), title, due: fields.due.value,
      showWeekly: fields.showWeekly.checked,
      slot: fields.showWeekly.checked && fields.timed.checked
        ? { date: fields.slotDate.value, start: fields.start.value, end: fields.end.value } : null,
      quadrant: fields.quadrant.value,
    };
  }
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  $('delete-item').disabled = true;
  $('editor-error').hidden = true;
  try {
    await store.save(record);
    if (editor.open && editing.item === item && editing.type === type) editor.close();
    if (type === 'task' && !item && $('quick-title').value.trim() === title) $('quick-title').value = '';
  } catch {
    showError('editor-error', 'Could not save. Try again.');
  } finally {
    submit.disabled = false;
    $('delete-item').disabled = false;
  }
});

$('delete-item').addEventListener('click', async () => {
  const { item } = editing;
  if (!item || !window.confirm(item.repeatUntil ? 'Delete the entire weekly series?' : 'Delete this item?')) return;
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  $('delete-item').disabled = true;
  try {
    await store.remove(item.id);
    editor.close();
  } catch {
    showError('editor-error', 'Could not delete. Try again.');
  } finally {
    submit.disabled = false;
    $('delete-item').disabled = false;
  }
});

$('quick-add').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('quick-title');
  const title = input.value.trim();
  if (!title) return input.focus();
  const submit = event.currentTarget.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    await store.save(taskRecord(title));
    if (input.value.trim() === title) input.value = '';
  } catch {
    notify('Could not add that task. Try again.');
  } finally {
    submit.disabled = false;
    input.focus();
  }
});

function resetTagForm(tag) {
  editingTag = tag;
  tagForm.elements.name.value = tag?.title ?? '';
  tagForm.elements.color.value = tag?.color ?? 'Sage';
  tagForm.querySelector('[type=submit]').textContent = tag ? 'Save tag' : 'Add tag';
  $('cancel-tag-edit').hidden = !tag;
  $('tag-error').hidden = true;
}

function renderTags() {
  const list = $('tag-list');
  const tags = records.filter(record => record.type === 'tag').sort((a, b) => a.title.localeCompare(b.title));
  list.replaceChildren();
  if (!tags.length) list.append(element('p', 'empty', 'Create a tag to colour-code your events.'));
  for (const tag of tags) {
    const row = element('div', 'tag-row');
    const swatch = element('span', 'swatch');
    swatch.style.backgroundColor = (palette[tag.color] ?? palette.Slate)[1];
    row.append(swatch, element('span', '', tag.title), button('Edit', '', () => {
      resetTagForm(tag);
      tagForm.elements.name.focus();
    }), button('Delete', 'danger', async () => {
      if (!window.confirm('Delete the tag “' + tag.title + '”? Its events will use the default colour.')) return;
      try {
        await store.remove(tag.id);
        if (editingTag?.id === tag.id) resetTagForm();
      } catch {
        showError('tag-error', 'Could not delete the tag.');
      }
    }));
    list.append(row);
  }
}

tagForm.addEventListener('submit', async event => {
  event.preventDefault();
  const title = tagForm.elements.name.value.trim();
  if (!title) return showError('tag-error', 'Enter a tag name.');
  if (records.some(item => item.type === 'tag' && item.id !== editingTag?.id && item.title.toLowerCase() === title.toLowerCase())) {
    return showError('tag-error', 'That tag already exists.');
  }
  const submit = tagForm.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    await store.save({ id: editingTag?.id ?? newId(), type: 'tag', title, color: tagForm.elements.color.value });
    resetTagForm();
  } catch {
    showError('tag-error', 'Could not save the tag.');
  } finally {
    submit.disabled = false;
  }
});

addOptions(tagForm.elements.color, Object.keys(palette).map(color => [color, color]));
$('cancel-tag-edit').addEventListener('click', () => resetTagForm());
$('tags').addEventListener('click', () => {
  resetTagForm();
  renderTags();
  tagEditor.showModal();
});
$('add-event').addEventListener('click', () => openEditor('event', null, {
  date: dateKey(dateKey(monday(new Date())) === dateKey(week) ? new Date() : week),
}));
$('task-details').addEventListener('click', () => openEditor('task', null, { title: $('quick-title').value }));
$('prev-week').addEventListener('click', () => { week = offsetDay(week, -7); renderWeek(); });
$('next-week').addEventListener('click', () => { week = offsetDay(week, 7); renderWeek(); });
$('today').addEventListener('click', () => { week = monday(new Date()); renderWeek(); });
$('list-view').addEventListener('click', () => { matrix = false; renderTasks(); });
$('matrix-view').addEventListener('click', () => { matrix = true; renderTasks(); });
for (const control of document.querySelectorAll('[data-close]')) {
  control.addEventListener('click', () => control.closest('dialog').close());
}
window.addEventListener('hashchange', render);
setInterval(updateNowLine, 60000);

function lock(message, canSignIn = false, canSignOut = false) {
  store = undefined;
  records = [];
  editor.close();
  tagEditor.close();
  $('welcome').hidden = false;
  $('welcome-text').textContent = message;
  $('sign-in').hidden = !canSignIn;
  $('sign-out').hidden = !canSignOut;
  $('storage-status').textContent = 'Private planner';
  render();
}

async function start() {
  const config = window.tempoFirebaseConfig;
  if (config) {
    lock('Connecting to Firebase…');
    try {
      const auth = await connectFirebase(config, {
        lock,
        ready: (remoteStore, next) => {
          store = remoteStore;
          $('welcome').hidden = true;
          $('sign-in').hidden = true;
          $('sign-out').hidden = false;
          $('storage-status').textContent = 'Firebase sync';
          setRecords(next);
        },
      });
      $('sign-in').addEventListener('click', async () => {
        try { await auth.signIn(); } catch { notify('Google sign-in did not complete. Try again.'); }
      });
      $('sign-out').addEventListener('click', async () => {
        try { await auth.signOut(); } catch { notify('Could not sign out.'); }
      });
    } catch {
      lock('Could not connect to Firebase. Check your connection and project configuration.');
    }
    return;
  }
  try {
    store = localStore(setRecords);
    render();
  } catch {
    lock('This browser could not open local storage. Try a regular browser window or serve the project on localhost.');
  }
}

start();
