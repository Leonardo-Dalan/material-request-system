const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

const SCRIPT_ORDER = [
  'js/vendor/xlsx.full.min.js',
  'js/config.js',
  'js/utils.js',
  'js/crypto.js',
  'js/storage.js',
  'js/sync.js',
  'js/auth.js',
  'js/catalog.js',
  'js/requests.js',
  'js/movements.js',
  'js/reports.js',
  'js/exporter.js',
  'js/views/app.js',
  'js/views/catalogView.js',
  'js/views/adminView.js',
  'js/views/requestsView.js',
  'js/views/queueView.js',
  'js/views/dashboardView.js',
  'js/views/stockView.js',
  'js/views/reportsView.js',
  'js/main.js'
];

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, extra) {
  if (condition) {
    pass++;
    console.log('  PASS  ' + name);
  } else {
    fail++;
    failures.push(name + (extra ? ' -> ' + extra : ''));
    console.log('  FAIL  ' + name + (extra ? '  [' + extra + ']' : ''));
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected, 'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
}

function section(title) {
  console.log('\n=== ' + title + ' ===');
}

const consoleErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  consoleErrors.push('jsdomError: ' + (error.detail ? error.detail.stack || error.detail : error.message));
});
virtualConsole.on('error', (...args) => consoleErrors.push('console.error: ' + args.join(' ')));
virtualConsole.on('warn', (...args) => consoleErrors.push('console.warn: ' + args.join(' ')));

const dom = new JSDOM(fs.readFileSync(INDEX, 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://material.test/index.html',
  virtualConsole
});

const w = dom.window;
const d = w.document;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function login(username, password) {
  d.getElementById('loginUser').value = username;
  d.getElementById('loginPass').value = password;
  return w.MRS.auth.doLogin();
}

(async function run() {
  for (const relative of SCRIPT_ORDER) {
    const code = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    try {
      w.eval(code);
    } catch (error) {
      console.log('\nSCRIPT FAILED: ' + relative);
      console.log(error && error.stack ? error.stack : error);
      process.exit(3);
    }
  }

  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(80);

  const MRS = w.MRS;
  const u = MRS.utils;

  section('BOOT');
  check('MRS namespace exists', !!MRS);
  check('boot completed', MRS.ready === true);
  check('config loaded', !!MRS.config && MRS.config.APP_VERSION === '1.0.0');
  check('database initialised', !!MRS.db);
  eq('catalog seeded with 22 items', MRS.catalog.activeItems().length, 22);
  eq('three demo users seeded', MRS.db.users.length, 3);
  check('requests collection present', Array.isArray(MRS.db.requests));
  check('movements collection present', Array.isArray(MRS.db.movements));
  check('requests module ready', MRS.requests.isReady === true && MRS.requests.STATUSES.length === 4);
  check('phase 3 modules initialized', MRS.movements.isReady === true && MRS.reports.isReady === true &&
    typeof MRS.views.dashboard.render === 'function' && typeof MRS.views.stock.render === 'function' &&
    typeof MRS.views.reports.render === 'function');
  check('local Excel library and exporter initialized', !!w.XLSX && typeof w.XLSX.write === 'function' &&
    typeof MRS.exporter.buildWorkbook === 'function');
  check('request form defaults configured', MRS.db.settings.requestingAreas.length >= 4 && MRS.db.settings.dropOffLocations.length >= 4);
  check('catalog has all core subcategories', ['Tapes', 'Insulation', 'Wire & Cable', 'Terminals', 'Fasteners', 'Protection', 'Adhesives', 'Labels'].every((name) =>
    MRS.catalog.subcategoryList().some((entry) => entry.name === name)
  ));
  check('every seed item has a photo', MRS.catalog.activeItems().every((item) => /^data:image\/svg\+xml/i.test(item.photo)));
  check('every seed item has PN, name, location and unit', MRS.catalog.activeItems().every((item) =>
    item.pn && item.name && item.stockLocation && item.unit
  ));
  check('login view visible before auth', !d.getElementById('viewLogin').classList.contains('hidden'));
  check('app shell hidden before auth', d.getElementById('appShell').classList.contains('hidden'));

  section('CRYPTO');
  eq('SHA-256 known vector "abc"', MRS.crypto.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  eq('SHA-256 empty string', MRS.crypto.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const requesterSeed = MRS.storage.findUserByUsername('requester');
  check('seed requester verifies with its password', MRS.crypto.verifyPassword(requesterSeed, 'requester123'));
  check('wrong password rejected by crypto', !MRS.crypto.verifyPassword(requesterSeed, 'wrong'));
  check('users store salt and hash, no plaintext', MRS.db.users.every((user) => user.salt && user.hash && user.pass === undefined));
  const firstHash = MRS.crypto.hashPassword('x', 'secret');
  const secondHash = MRS.crypto.hashPassword('x', 'secret');
  check('two hashes of the same password use different salts', firstHash.salt !== secondHash.salt);
  check('salt is 32 hex characters', /^[0-9a-f]{32}$/.test(firstHash.salt));

  section('STORAGE + UTF-8');
  const storedRaw = w.localStorage.getItem(MRS.config.STORAGE_KEY);
  check('database persisted to localStorage', !!storedRaw);
  check('no plaintext requester123 in localStorage', storedRaw.indexOf('requester123') === -1);
  check('no plaintext logistics123 in localStorage', storedRaw.indexOf('logistics123') === -1);
  check('no plaintext admin123 in localStorage', storedRaw.indexOf('admin123') === -1);
  check('stored users only expose hashes', JSON.parse(storedRaw).users.every((user) => user.salt && user.hash));
  const corrupt = MRS.storage.migrateDB({ updatedAt: 1, users: 'bad', items: 'bad' });
  eq('corrupt storage recovers with seeded users', corrupt.users.length, 3);
  eq('corrupt storage recovers with seeded items', corrupt.items.length, 22);
  const emptyCatalog = MRS.storage.migrateDB({ users: MRS.db.users, items: [], requests: [], movements: [], updatedAt: Date.now() });
  eq('an intentionally empty catalog is not re-seeded', emptyCatalog.items.length, 0);
  ['index.html', 'css/styles.css', 'js/config.js', 'js/catalog.js'].forEach((file) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    check(file + ' is valid UTF-8 text', text.indexOf('\uFFFD') === -1);
  });

  section('AUTH - wrong password');
  const wrong = login('requester', 'wrong');
  check('wrong password rejected', wrong.ok === false && MRS.currentUser === null);
  check('login error shown inline', d.getElementById('loginError').textContent.length > 0);

  section('AUTH - requester');
  const requesterLogin = login('requester', 'requester123');
  check('requester signs in', requesterLogin.ok === true);
  eq('role is REQUESTER', MRS.currentUser.role, 'REQUESTER');
  check('login view hidden after login', d.getElementById('viewLogin').classList.contains('hidden'));
  check('app shell visible after login', !d.getElementById('appShell').classList.contains('hidden'));
  check('requester lands on catalog', !d.getElementById('viewCatalog').classList.contains('hidden'));
  eq('topbar shows requester', d.getElementById('topUserName').textContent, 'Demo Requester');
  check('queue tab hidden for requester', d.querySelector('[data-nav="queue"]').classList.contains('hidden'));
  check('dashboard tab hidden for requester', d.querySelector('[data-nav="dashboard"]').classList.contains('hidden'));
  check('stock tab hidden for requester', d.querySelector('[data-nav="stock"]').classList.contains('hidden'));
  check('reports tab hidden for requester', d.querySelector('[data-nav="reports"]').classList.contains('hidden'));
  check('admin tab hidden for requester', d.querySelector('[data-nav="admin"]').classList.contains('hidden'));
  check('catalog admin controls hidden for requester', d.getElementById('catalogAdminActions').classList.contains('hidden'));
  check('catalog cards rendered', d.querySelectorAll('#catalogGrid .item-card').length === 22,
    d.querySelectorAll('#catalogGrid .item-card').length + ' cards');
  check('no edit buttons for requester', d.querySelectorAll('#catalogGrid [data-action="item-edit"]').length === 0);
  eq('request shortcuts rendered for requester', d.querySelectorAll('#catalogGrid [data-action="catalog-request"]').length, 22);

  const countBeforeBlocked = MRS.catalog.activeItems().length;
  const blockedAdd = MRS.catalog.saveItem({
    pn: 'HACK-1', name: 'Blocked item', subcategory: 'Tapes', stockLocation: 'X', unit: 'pc', photo: ''
  });
  const blockedDelete = MRS.catalog.deleteItem(MRS.catalog.activeItems()[0].id);
  const blockedImport = MRS.catalog.importCSV('PN;Name;Subcategory;Unit;Stock Location\nHACK-2;Blocked;import;pc;X');
  const blockedUser = MRS.auth.createUser({ name: 'Blocked', username: 'blockeduser', password: 'blocked123', role: 'ADMIN' });
  check('requester cannot add catalog items', blockedAdd.ok === false);
  check('requester cannot remove catalog items', blockedDelete.ok === false);
  check('requester cannot import CSV', blockedImport.ok === false);
  check('requester cannot create users', blockedUser.ok === false);
  eq('catalog unchanged after blocked writes', MRS.catalog.activeItems().length, countBeforeBlocked);
  eq('user count unchanged after blocked write', MRS.db.users.length, 3);

  section('REQUESTS - requester submission');
  const tapeItem = MRS.catalog.getByPn('TAPE-3M-33');
  const wireItem = MRS.catalog.getByPn('WIRE-CU-14');
  MRS.views.app.switchView('request');
  check('new request view opens', !d.getElementById('viewRequest').classList.contains('hidden'));
  MRS.views.request.resetForm();
  const requestCountBefore = MRS.requests.all().length;
  MRS.views.request.submitRequest();
  check('empty request is rejected', MRS.requests.all().length === requestCountBefore);
  check('empty request shows inline errors', d.getElementById('requestFormError').textContent.length > 0);

  MRS.views.request.preselectItem(tapeItem.id);
  check('catalog shortcut preselects the item', d.getElementById('requestSelected').textContent.indexOf('TAPE-3M-33') !== -1);
  eq('selected item sets the unit label', d.getElementById('requestQtyUnit').textContent, 'roll');
  d.getElementById('requestQty').value = '2';
  d.getElementById('requestArea').value = 'Production';
  d.getElementById('requestDropOff').value = 'Production Line 2';
  d.getElementById('requestJob').value = 'JOB-1001';
  d.getElementById('requestUrgencyUrgent').checked = true;
  MRS.views.request.submitRequest();
  eq('request submitted through the form', MRS.requests.all().length, requestCountBefore + 1);
  check('submitted request opens My requests', !d.getElementById('viewRequests').classList.contains('hidden'));
  const requestOne = MRS.requests.listForUser(MRS.currentUser.id)[0];
  check('request number uses prefix and date', /^MR-\d{8}-001$/.test(requestOne.requestNumber), requestOne.requestNumber);
  eq('request starts in NEW status', requestOne.status, 'NEW');
  eq('request stores the requester', requestOne.requesterName, 'Demo Requester');
  eq('request snapshots the item PN', requestOne.itemPn, 'TAPE-3M-33');
  eq('request snapshots the stock location', requestOne.stockLocation, tapeItem.stockLocation);
  eq('request stores urgency', requestOne.urgency, 'URGENT');
  eq('request stores quantity as a number', requestOne.quantity, 2);
  check('request history begins with NEW', requestOne.history.length === 1 && requestOne.history[0].status === 'NEW');

  const requestTwo = MRS.requests.create({
    itemId: wireItem.id,
    quantity: '12.5',
    requestingArea: '<img src=x onerror="window.__pwned=11"> Production',
    dropOff: 'Maintenance Workshop',
    jobNumber: 'JOB-1002',
    urgency: 'NORMAL'
  });
  check('second request created', requestTwo.ok === true);
  eq('request sequence increments', requestTwo.request.requestNumber, requestOne.requestNumber.replace(/001$/, '002'));
  eq('decimal quantity preserved', requestTwo.request.quantity, 12.5);
  eq('requester owns two requests', MRS.requests.listForUser(MRS.currentUser.id).length, 2);

  const missingFields = MRS.requests.create({ itemId: '', quantity: '0', requestingArea: '', dropOff: '', jobNumber: '', urgency: 'URGENT' });
  check('request validation covers item, quantity and context', missingFields.ok === false &&
    !!missingFields.errors.itemId && !!missingFields.errors.quantity && !!missingFields.errors.requestingArea &&
    !!missingFields.errors.dropOff && !!missingFields.errors.jobNumber);
  const missingJob = MRS.requests.create({
    itemId: tapeItem.id, quantity: '1', requestingArea: 'Production', dropOff: 'Line 1', jobNumber: '', urgency: 'NORMAL'
  });
  check('job number is required', missingJob.ok === false && !!missingJob.errors.jobNumber);
  const missingItem = MRS.requests.create({
    itemId: 'missing-item', quantity: '1', requestingArea: 'Production', dropOff: 'Line 1', jobNumber: 'N/A', urgency: 'NORMAL'
  });
  check('inactive or unknown items are rejected', missingItem.ok === false && !!missingItem.errors.itemId);
  const tooLarge = MRS.requests.create({
    itemId: tapeItem.id, quantity: String(MRS.config.TECH.maxRequestQuantity + 1), requestingArea: 'Production', dropOff: 'Line 1', jobNumber: 'N/A', urgency: 'NORMAL'
  });
  check('quantity upper bound enforced', tooLarge.ok === false && !!tooLarge.errors.quantity);
  const blockedStart = MRS.requests.startWorking(requestOne.id);
  check('requester cannot move requests in the queue', blockedStart.ok === false);
  const blockedReceipt = MRS.movements.recordInbound({
    itemId: tapeItem.id, quantity: 5, reference: 'BLOCKED'
  });
  check('requester cannot record stock receipts', blockedReceipt.ok === false);
  MRS.views.app.switchView('queue');
  check('requester cannot open the logistics queue', d.getElementById('viewQueue').classList.contains('hidden'));
  MRS.views.app.switchView('stock');
  check('requester cannot open stock', d.getElementById('viewStock').classList.contains('hidden'));

  MRS.views.app.switchView('requests');
  eq('My requests renders both requests', d.querySelectorAll('#requestList .request-card').length, 2);
  eq('status filters rendered', d.querySelectorAll('#requestFilters .filter-chip').length, 5);
  MRS.views.requests.filterRequests('DONE');
  eq('status filter hides non-matching requests', d.querySelectorAll('#requestList .request-card').length, 0);
  check('filtered empty state is visible', !d.getElementById('requestsEmpty').classList.contains('hidden') &&
    d.getElementById('requestsEmptyTitle').textContent === 'No matching requests');
  MRS.views.requests.filterRequests('ALL');
  eq('status filter can be cleared', d.querySelectorAll('#requestList .request-card').length, 2);
  MRS.views.requests.requestAgain(requestTwo.request.id);
  check('request again opens the request form', !d.getElementById('viewRequest').classList.contains('hidden'));
  eq('request again restores quantity', d.getElementById('requestQty').value, '12.5');
  check('request again preselects the material', d.getElementById('requestSelected').textContent.indexOf('WIRE-CU-14') !== -1);
  MRS.views.app.switchView('requests');

  MRS.auth.logout();
  check('logout returns to login view', !d.getElementById('viewLogin').classList.contains('hidden'));

  section('AUTH - logistics');
  const logisticsLogin = login('logistics', 'logistics123');
  check('logistics signs in', logisticsLogin.ok === true);
  eq('role is LOGISTICS', MRS.currentUser.role, 'LOGISTICS');
  check('queue tab visible for logistics', !d.querySelector('[data-nav="queue"]').classList.contains('hidden'));
  check('dashboard tab visible for logistics', !d.querySelector('[data-nav="dashboard"]').classList.contains('hidden'));
  check('stock tab visible for logistics', !d.querySelector('[data-nav="stock"]').classList.contains('hidden'));
  check('reports tab visible for logistics', !d.querySelector('[data-nav="reports"]').classList.contains('hidden'));
  check('admin tab hidden for logistics', d.querySelector('[data-nav="admin"]').classList.contains('hidden'));
  check('catalog admin controls visible for logistics', !d.getElementById('catalogAdminActions').classList.contains('hidden'));
  check('edit buttons rendered for logistics', d.querySelectorAll('#catalogGrid [data-action="item-edit"]').length === 22);

  const logisticsAdd = MRS.catalog.saveItem({
    pn: 'TEST-LOG-01',
    name: 'Logistics Test Material',
    subcategory: 'Tapes',
    stockLocation: 'Z-99-01',
    unit: 'roll',
    photo: ''
  });
  check('logistics can add a catalog item', logisticsAdd.ok === true);
  eq('catalog grew by one', MRS.catalog.activeItems().length, 23);
  eq('new item persisted with uppercase PN', MRS.catalog.getByPn('test-log-01').pn, 'TEST-LOG-01');
  check('new item has an accent colour', /^#[0-9a-f]{6}$/i.test(MRS.catalog.getByPn('TEST-LOG-01').accent));
  const removeLogistics = MRS.catalog.deleteItem(logisticsAdd.item.id);
  check('logistics can soft-delete an item', removeLogistics.ok === true);
  check('deleted item is invisible', MRS.catalog.getById(logisticsAdd.item.id) === null);
  eq('active catalog back to 22', MRS.catalog.activeItems().length, 22);

  section('LOGISTICS QUEUE');
  const openQueue = MRS.requests.listQueue('OPEN');
  eq('queue contains both open requests', openQueue.length, 2);
  eq('urgent request is pinned first', openQueue[0].id, requestOne.id);
  MRS.views.app.switchView('queue');
  check('logistics queue view opens', !d.getElementById('viewQueue').classList.contains('hidden'));
  eq('queue renders open requests', d.querySelectorAll('#queueList .queue-card').length, 2);
  eq('new request stat', d.getElementById('queueStatNew').textContent, '2');
  eq('urgent open stat', d.getElementById('queueStatUrgent').textContent, '1');
  check('queue card shows delivery context', d.getElementById('queueList').textContent.indexOf('Production Line 2') !== -1 &&
    d.getElementById('queueList').textContent.indexOf('JOB-1001') !== -1 &&
    d.getElementById('queueList').textContent.indexOf('Demo Requester') !== -1);
  check('start working action rendered', !!d.querySelector('[data-action="queue-start"][data-id="' + requestOne.id + '"]'));

  const invalidDone = MRS.requests.markDone(requestOne.id);
  check('cannot skip directly from NEW to DONE', invalidDone.ok === false);
  MRS.views.queue.startRequest(requestOne.id);
  eq('start working moves request to WORKING', MRS.requests.getById(requestOne.id).status, 'WORKING');
  check('working actor and timestamp recorded', !!MRS.requests.getById(requestOne.id).startedAt &&
    MRS.requests.getById(requestOne.id).startedByName === 'Demo Logistics');
  eq('working stat updates', d.getElementById('queueStatWorking').textContent, '1');
  check('mark done action rendered while working', !!d.querySelector('[data-action="queue-done"][data-id="' + requestOne.id + '"]'));

  const finished = MRS.requests.markDone(requestOne.id);
  check('working request can be marked done', finished.ok === true);
  check('completion actor and timestamp recorded', !!finished.request.completedAt && finished.request.handledByName === 'Demo Logistics');
  check('done request is terminal', MRS.requests.startWorking(requestOne.id).ok === false);
  const autoIssue = MRS.movements.getBySourceRequestId(requestOne.id);
  check('fulfilled request creates an outbound movement', !!autoIssue && autoIssue.type === 'OUT' && autoIssue.quantity === 2);
  check('automatic outbound movement is linked to the request', autoIssue.sourceRequestNumber === requestOne.requestNumber);
  const duplicateIssue = MRS.movements.recordOutboundForRequest(finished.request);
  check('fulfilled request movement is idempotent', duplicateIssue.duplicate === true && MRS.movements.all().length === 1);
  MRS.views.queue.render();

  MRS.views.queue.openReject(requestTwo.request.id);
  check('reject modal opens', d.getElementById('modalReject').classList.contains('open'));
  check('reject modal shows request summary', d.getElementById('rejectRequestSummary').textContent.indexOf(requestTwo.request.requestNumber) !== -1);
  const rejectReasonField = d.getElementById('rejectReason');
  const rejectNoteField = d.getElementById('rejectNote');
  eq('rejection reason dropdown has the preset reasons',
    Array.from(rejectReasonField.options).map((option) => option.value).filter(Boolean).join('|'),
    'Out of stock|Aisle blocked|Forklift down|Item not found at location|Damaged material|Duplicate request|Other');
  check('rejection note starts optional',
    rejectNoteField.required === false && d.getElementById('rejectNoteLabel').textContent === 'Additional note (optional)');
  const rejectWithoutReason = MRS.requests.reject(requestTwo.request.id, '');
  check('rejection requires a reason', rejectWithoutReason.ok === false);
  const rejectWithUnknownReason = MRS.requests.reject(requestTwo.request.id, '<script>window.__pwned=12</script>');
  check('rejection only accepts preset reasons', rejectWithUnknownReason.ok === false);
  const rejectOtherWithoutNote = MRS.requests.reject(requestTwo.request.id, 'Other', '');
  check('Other rejection requires a note', rejectOtherWithoutNote.ok === false);
  const rejectWithLongNote = MRS.requests.reject(requestTwo.request.id, 'Out of stock', 'x'.repeat(281));
  check('rejection note length is capped', rejectWithLongNote.ok === false);
  rejectReasonField.value = 'Other';
  rejectReasonField.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('Other reason makes the note required',
    rejectNoteField.required === true && d.getElementById('rejectNoteLabel').textContent === 'Additional note (required)');
  rejectReasonField.value = 'Out of stock';
  rejectReasonField.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('preset reason keeps the note optional',
    rejectNoteField.required === false && d.getElementById('rejectNoteLabel').textContent === 'Additional note (optional)');
  rejectReasonField.value = 'Other';
  rejectReasonField.dispatchEvent(new w.Event('change', { bubbles: true }));
  rejectNoteField.value = '<script>window.__pwned=12</script>';
  MRS.views.queue.submitReject();
  const rejectedRequest = MRS.requests.getById(requestTwo.request.id);
  eq('rejection moves request to REJECTED', rejectedRequest.status, 'REJECTED');
  eq('preset rejection reason stored', rejectedRequest.rejectionReason, 'Other');
  eq('rejection note stored separately', rejectedRequest.rejectionNote, '<script>window.__pwned=12</script>');
  check('rejection actor and timestamp recorded', !!rejectedRequest.rejectedAt && rejectedRequest.handledByName === 'Demo Logistics');
  check('reject modal closes after submission', !d.getElementById('modalReject').classList.contains('open'));
  const legacyDb = u.deepClone(MRS.db);
  const legacyRequest = legacyDb.requests.find((request) => request.id === requestTwo.request.id);
  legacyRequest.rejectionReason = 'Vendor closed for maintenance';
  delete legacyRequest.rejectionNote;
  const migratedLegacy = MRS.storage.migrateDB(legacyDb).requests.find((request) => request.id === requestTwo.request.id);
  eq('existing rejections keep their old text', migratedLegacy.rejectionReason, 'Vendor closed for maintenance');
  eq('existing rejections load with an empty note', migratedLegacy.rejectionNote, '');
  const groupedPareto = MRS.reports.rejectionPareto([
    Object.assign({}, rejectedRequest, { id: 'rq-group-a', rejectionReason: 'Damaged material', rejectionNote: 'Sleeve crushed' }),
    Object.assign({}, rejectedRequest, { id: 'rq-group-b', rejectionReason: 'Damaged material', rejectionNote: 'Box torn' })
  ]);
  check('rejection pareto groups by preset reason, not note',
    groupedPareto.length === 1 && groupedPareto[0].reason === 'Damaged material' && groupedPareto[0].count === 2);

  MRS.views.queue.render();
  eq('open queue is empty after all actions', d.querySelectorAll('#queueList .queue-card').length, 0);
  check('queue empty state is visible', !d.getElementById('queueEmpty').classList.contains('hidden'));
  MRS.views.queue.filterQueue('ALL');
  eq('all filter shows closed requests', d.querySelectorAll('#queueList .queue-card').length, 2);
  check('queue renders rejection note', d.querySelector('#queueList .rejection-note') &&
    d.querySelector('#queueList .rejection-note').textContent.indexOf('window.__pwned') !== -1);
  MRS.views.queue.filterQueue('DONE');
  eq('done filter shows fulfilled request', d.querySelectorAll('#queueList .queue-card').length, 1);
  MRS.views.queue.filterQueue('REJECTED');
  eq('rejected filter shows rejected request', d.querySelectorAll('#queueList .queue-card').length, 1);
  MRS.views.queue.filterQueue('WORKING');
  check('filtered queue empty state has a matching title',
    !d.getElementById('queueEmpty').classList.contains('hidden') &&
    d.getElementById('queueEmptyTitle').textContent === 'No matching requests');
  MRS.views.queue.filterQueue('ALL');
  check('queue escapes requester-controlled fields', d.querySelectorAll('#queueList img[src="x"]').length === 0 &&
    d.querySelectorAll('#queueList script').length === 0 && w.__pwned === undefined);
  check('My requests escapes rejection reason and note', d.querySelectorAll('#requestList script').length === 0 && w.__pwned === undefined);
  const queueStats = MRS.requests.stats();
  check('queue stats reflect outcomes', queueStats.new === 0 && queueStats.working === 0 &&
    queueStats.done === 1 && queueStats.rejected === 1 && queueStats.doneToday === 1 && queueStats.rejectedToday === 1);
  eq('done stat rendered', d.getElementById('queueStatDone').textContent, '1');
  const requesterHistory = MRS.requests.listForUser(MRS.storage.findUserByUsername('requester').id);
  check('requester sees final statuses', requesterHistory.map((request) => request.status).sort().join(',') === 'DONE,REJECTED');
  check('status history captures every transition', MRS.requests.getById(requestOne.id).history.length === 3 &&
    MRS.requests.getById(requestTwo.request.id).history.length === 2);

  section('STOCK MOVEMENTS');
  const receiptOne = MRS.movements.recordInbound({
    itemId: tapeItem.id,
    quantity: '50',
    reference: 'PO-9001',
    note: 'Receiving dock'
  });
  check('logistics can record an inbound receipt', receiptOne.ok === true && receiptOne.movement.type === 'IN');
  eq('receipt stores numeric quantity', receiptOne.movement.quantity, 50);
  check('receipt records actor and reference', receiptOne.movement.reference === 'PO-9001' &&
    receiptOne.movement.actorName === 'Demo Logistics');
  const invalidReceipt = MRS.movements.validateInbound({ itemId: '', quantity: '0' });
  check('receipt validation rejects missing item and quantity', invalidReceipt.ok === false &&
    !!invalidReceipt.errors.itemId && !!invalidReceipt.errors.quantity);
  const tapeBalance = MRS.movements.balances('TAPE-3M-33')[0];
  check('balance combines receipts and issues', tapeBalance.received === 50 && tapeBalance.issued === 2 && tapeBalance.balance === 48,
    JSON.stringify(tapeBalance));
  const movementStats = MRS.movements.stats();
  check('movement stats count receipts and issues', movementStats.inbound === 1 && movementStats.outbound === 1 && movementStats.total === 2);
  check('stock ledger lists newest movement first', MRS.movements.list('ALL')[0].type === 'IN');
  check('stock ledger has no separate CSV exporter', typeof MRS.movements.csvData === 'undefined' &&
    typeof MRS.movements.exportLedger === 'undefined');

  MRS.views.app.switchView('stock');
  check('stock view opens for logistics', !d.getElementById('viewStock').classList.contains('hidden'));
  eq('stock stat shows tracked items', d.getElementById('stockStatItems').textContent, '1');
  eq('stock stat shows receipts', d.getElementById('stockStatReceipts').textContent, '1');
  eq('stock stat shows issues', d.getElementById('stockStatIssues').textContent, '1');
  eq('stock balance table renders all active items', d.querySelectorAll('#stockBalanceList tr').length, 22);
  eq('stock ledger renders movements', d.querySelectorAll('#stockLedgerList tr').length, 2);
  check('stock balance shows computed values', d.getElementById('stockBalanceList').textContent.indexOf('48') !== -1);

  MRS.views.stock.openReceipt();
  check('receipt modal opens', d.getElementById('modalReceipt').classList.contains('open'));
  d.getElementById('receiptItem').value = tapeItem.id;
  d.getElementById('receiptQty').value = '10';
  d.getElementById('receiptRef').value = 'PO-9002';
  d.getElementById('receiptNote').value = 'Second delivery';
  d.getElementById('receiptForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  check('receipt form records a movement', MRS.movements.all().length === 3 && !d.getElementById('modalReceipt').classList.contains('open'));
  eq('receipt form updates the balance', MRS.movements.balances('TAPE-3M-33')[0].balance, 58);

  MRS.views.stock.filter('IN');
  eq('receipt filter shows inbound movements', d.querySelectorAll('#stockLedgerList tr').length, 2);
  MRS.views.stock.filter('OUT');
  eq('issue filter shows outbound movements', d.querySelectorAll('#stockLedgerList tr').length, 1);
  MRS.views.stock.filter('ALL');
  const stockSearch = d.getElementById('stockSearch');
  stockSearch.value = 'KAPTON';
  MRS.views.stock.onSearchInput();
  eq('stock search filters balances', d.querySelectorAll('#stockBalanceList tr').length, 1);
  check('stock search filters ledger', d.querySelectorAll('#stockLedgerList tr').length === 0);
  stockSearch.value = '';
  MRS.views.stock.onSearchInput();
  check('stock ledger escapes movement text', d.querySelectorAll('#stockLedgerList script').length === 0);

  section('DASHBOARD');
  MRS.views.app.switchView('dashboard');
  check('dashboard opens for logistics', !d.getElementById('viewDashboard').classList.contains('hidden'));
  eq('dashboard requests today', d.getElementById('dashRequestsToday').textContent, '2');
  eq('dashboard done today', d.getElementById('dashDoneToday').textContent, '1');
  eq('dashboard rejected today', d.getElementById('dashRejectedToday').textContent, '1');
  eq('dashboard urgent open', d.getElementById('dashUrgentOpen').textContent, '0');
  check('dashboard average fulfillment is populated', d.getElementById('dashAvgFulfillment').textContent !== '--');
  eq('dashboard renders 14 day columns', d.querySelectorAll('#dashChart .chart-column').length, 14);
  check('dashboard chart includes today count', d.getElementById('dashChart').textContent.indexOf('2') !== -1);
  eq('dashboard renders top requested items', d.querySelectorAll('#dashTopItems .top-item-row').length, 2);
  eq('dashboard renders rejection pareto', d.querySelectorAll('#dashPareto .pareto-row').length, 1);
  check('dashboard escapes rejection reason', d.querySelectorAll('#dashPareto script').length === 0 && w.__pwned === undefined);

  section('REPORTS');
  MRS.views.app.switchView('reports');
  check('reports view opens for logistics', !d.getElementById('viewReports').classList.contains('hidden'));
  eq('reports period buttons rendered', d.querySelectorAll('#reportPeriods .filter-chip').length, 5);
  eq('reports requested count', d.getElementById('reportStatRequested').textContent, '2');
  eq('reports fulfilled count', d.getElementById('reportStatDone').textContent, '1');
  eq('reports rejected count', d.getElementById('reportStatRejected').textContent, '1');
  eq('reports table shows requests in period', d.querySelectorAll('#reportRequestRows tr').length, 2);
  eq('reports top items rendered', d.querySelectorAll('#reportTopItems .top-item-row').length, 2);
  eq('reports pareto rendered', d.querySelectorAll('#reportPareto .pareto-row').length, 1);
  MRS.views.reports.setPeriod('day');
  eq('day period keeps today requests', d.querySelectorAll('#reportRequestRows tr').length, 2);
  MRS.views.reports.shift(-1);
  eq('previous period has no requests', d.querySelectorAll('#reportRequestRows tr').length, 0);
  check('report empty state appears', !d.getElementById('reportTableEmpty').classList.contains('hidden'));
  MRS.views.reports.current();
  eq('current period restores requests', d.querySelectorAll('#reportRequestRows tr').length, 2);
  MRS.views.reports.setPeriod('month');
  eq('month period includes today requests', d.querySelectorAll('#reportRequestRows tr').length, 2);
  check('reports has no separate CSV exporter', typeof MRS.reports.csvData === 'undefined');
  check('reports table escapes reason and note', d.querySelectorAll('#reportRequestRows script').length === 0 && w.__pwned === undefined);
  check('reports table shows the rejection note', d.querySelector('#reportRequestRows .report-reason-note') &&
    d.querySelector('#reportRequestRows .report-reason-note').textContent.indexOf('window.__pwned') !== -1);

  section('EXCEL EXPORT');
  const XLSX = w.XLSX;
  const workbook = MRS.exporter.buildWorkbook();
  eq('Excel workbook has exactly three sheets', workbook.SheetNames.join('|'), 'Catalog|Requests|Stock Movements');
  const sheetRows = function (name) {
    return XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: '' });
  };
  const catalogSheet = sheetRows('Catalog');
  eq('Catalog sheet keeps all five usable columns', catalogSheet[0].join('|'), 'PN|Name|Subcategory|Unit|Stock Location');
  check('Catalog sheet omits the Photo column', catalogSheet[0].indexOf('Photo') === -1);
  eq('Catalog sheet exports every active material', catalogSheet.length - 1, MRS.catalog.activeItems().length);

  const requestsSheet = sheetRows('Requests');
  eq('Requests sheet has every required column', requestsSheet[0].join('|'),
    'Request ID|Created date/time|Requester|Requesting area|Item PN|Item name|Quantity|Unit|Drop-off|Job number|Urgency|Status|Started by|Started at|Fulfilled by|Fulfilled at|Rejected by|Rejection reason|Rejection note|Lead time');
  eq('Requests sheet exports all requests', requestsSheet.length - 1, 2);
  const doneRow = requestsSheet.find((row, index) => index > 0 && row[0] === requestOne.requestNumber);
  const rejectedRow = requestsSheet.find((row, index) => index > 0 && row[0] === requestTwo.request.requestNumber);
  check('Requests sheet includes fulfilled context', !!doneRow && doneRow[11] === 'Done' &&
    doneRow[12] === 'Demo Logistics' && doneRow[14] === 'Demo Logistics' && !!doneRow[15] &&
    doneRow[18] === '' && doneRow[19] !== '');
  check('Requests sheet includes rejection context', !!rejectedRow && rejectedRow[11] === 'Rejected' &&
    rejectedRow[16] === 'Demo Logistics' && rejectedRow[17] === 'Other' &&
    rejectedRow[18] === rejectedRequest.rejectionNote);
  check('Requests sheet keeps the preset reason separate from the note',
    !!rejectedRow && rejectedRow[17] !== rejectedRow[18] && rejectedRow[18].indexOf('script') !== -1);

  const stockSheet = sheetRows('Stock Movements');
  eq('Stock sheet has every required column', stockSheet[0].join('|'),
    'Date/time|Item PN|Item name|Type|Quantity|Unit|Balance after|Performed by|Reference|Note');
  eq('Stock sheet exports all movements', stockSheet.length - 1, 3);
  check('Stock sheet labels receipts and issues', stockSheet.some((row) => row[3] === 'Receipt') &&
    stockSheet.some((row) => row[3] === 'Issue'));
  check('Stock sheet calculates balance after each movement', stockSheet.some((row) => row[3] === 'Issue' && row[6] === -2) &&
    stockSheet.some((row) => row[3] === 'Receipt' && row[6] === 48) &&
    stockSheet.some((row) => row[3] === 'Receipt' && row[6] === 58));
  check('Stock sheet records who performed each movement', stockSheet.slice(1).every((row) => !!row[7]));

  const workbookData = new Uint8Array(MRS.exporter.buildArrayBuffer());
  check('Excel writer returns a non-empty XLSX payload', workbookData.length > 1000 &&
    workbookData[0] === 0x50 && workbookData[1] === 0x4B);
  const reopened = XLSX.read(workbookData, { type: 'array', cellDates: true });
  eq('Written XLSX reopens with all sheets', reopened.SheetNames.join('|'), 'Catalog|Requests|Stock Movements');
  const reopenedRequests = XLSX.utils.sheet_to_json(reopened.Sheets.Requests, { header: 1, defval: '' });
  eq('Reopened XLSX keeps all requests', reopenedRequests.length - 1, 2);

  check('Reports exposes one export-all action', !!d.querySelector('[data-action="report-export-all"]') &&
    d.querySelector('[data-action="report-export-all"]').textContent.trim() === 'Export all data');
  eq('Stock export button removed', d.querySelectorAll('[data-action="stock-export"]').length, 0);
  eq('Report CSV export button removed', d.querySelectorAll('[data-action="report-export"]').length, 0);
  check('Catalog backup export remains', !!d.querySelector('[data-action="catalog-export"]'));
  check('Page controllers no longer expose CSV export entry points', typeof MRS.views.stock.exportLedger === 'undefined' &&
    typeof MRS.views.reports.exportCSV === 'undefined');

  const originalDownloadBlob = MRS.utils.downloadBlob;
  let capturedDownload = null;
  MRS.utils.downloadBlob = function (filename, blob) {
    capturedDownload = { filename: filename, type: blob.type, size: blob.size };
    return true;
  };
  MRS.views.reports.exportAll();
  MRS.utils.downloadBlob = originalDownloadBlob;
  check('Export all data downloads one .xlsx workbook', !!capturedDownload &&
    /^material-request-data-\d{4}-\d{2}-\d{2}\.xlsx$/.test(capturedDownload.filename));
  eq('Workbook uses the XLSX MIME type', capturedDownload.type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  check('Downloaded workbook is non-empty', capturedDownload.size > 1000);

  MRS.auth.logout();

  section('AUTH - admin');
  const adminLogin = login('admin', 'admin123');
  check('admin signs in', adminLogin.ok === true);
  eq('role is ADMIN', MRS.currentUser.role, 'ADMIN');
  check('admin lands on admin view', !d.getElementById('viewAdmin').classList.contains('hidden'));
  check('admin tab visible', !d.querySelector('[data-nav="admin"]').classList.contains('hidden'));
  check('queue tab visible', !d.querySelector('[data-nav="queue"]').classList.contains('hidden'));
  eq('user table rendered', d.querySelectorAll('#usersTable tr').length, 3);
  eq('user count chip', d.getElementById('userCount').textContent, '3');
  eq('admin dataset shows requests', d.getElementById('systemRequests').textContent, '2');

  section('CATALOG SEARCH + BROWSE');
  MRS.views.app.switchView('catalog');
  check('TAPE search finds all tapes', MRS.catalog.filterItems('TAPE').length === 4,
    MRS.catalog.filterItems('TAPE').length + ' found');
  const exact = MRS.catalog.filterItems('WIRE-CU-14');
  check('exact PN is ranked first', exact.length > 0 && exact[0].pn === 'WIRE-CU-14');
  eq('name search finds both heat shrink sizes', MRS.catalog.filterItems('heat shrink').length, 2);
  eq('search is case-insensitive', MRS.catalog.filterItems('kapton')[0].pn, 'TAPE-KAP-25');
  eq('search normalizes accents', u.normalizeSearch('Isolação'), 'isolacao');
  const tapesOnly = MRS.catalog.filterItems('', 'Tapes');
  check('subcategory browse filters the catalog', tapesOnly.length === 4 && tapesOnly.every((item) => item.subcategory === 'Tapes'));
  check('subcategory chips rendered', d.querySelectorAll('#catalogSubcats .subcat-chip').length >= 9);
  const searchInput = d.getElementById('catalogSearch');
  searchInput.value = 'kapton';
  MRS.views.catalog.onSearchInput();
  eq('live search updates the grid', d.querySelectorAll('#catalogGrid .item-card').length, 1);
  MRS.views.catalog.clearSearch();
  eq('clear search restores the full grid', d.querySelectorAll('#catalogGrid .item-card').length, 22);
  MRS.views.catalog.filterSubcategory('Tapes');
  eq('subcategory chip filters the grid', d.querySelectorAll('#catalogGrid .item-card').length, 4);
  MRS.views.catalog.filterSubcategory('Tapes');
  eq('clicking the active chip clears the filter', d.querySelectorAll('#catalogGrid .item-card').length, 22);

  section('CATALOG CRUD + VALIDATION');
  const invalidPhoto = MRS.catalog.saveItem({
    pn: 'BAD-PHOTO', name: 'Bad photo', subcategory: 'Tapes', stockLocation: 'X', unit: 'pc', photo: 'javascript:alert(1)'
  });
  check('javascript: photo URL rejected', invalidPhoto.ok === false && !!invalidPhoto.errors.photo);
  const duplicate = MRS.catalog.saveItem({
    pn: 'tape-3m-33', name: 'Duplicate', subcategory: 'Tapes', stockLocation: 'X', unit: 'pc', photo: ''
  });
  check('duplicate PN rejected case-insensitively', duplicate.ok === false && !!duplicate.errors.pn);
  const missing = MRS.catalog.saveItem({ pn: '', name: '', subcategory: '', stockLocation: '', unit: 'pc', photo: '' });
  check('required fields validated', missing.ok === false && missing.errors.pn && missing.errors.name);

  const editable = MRS.catalog.getByPn('TAPE-3M-33');
  const beforeName = editable.name;
  const update = MRS.catalog.saveItem({
    id: editable.id,
    pn: editable.pn,
    name: 'PVC Electrical Tape 19 mm x 20 m Premium',
    subcategory: editable.subcategory,
    stockLocation: editable.stockLocation,
    unit: editable.unit,
    photo: editable.photo
  });
  check('existing item can be updated', update.ok === true && update.created === false);
  check('updated name persisted', MRS.catalog.getByPn('TAPE-3M-33').name.indexOf('Premium') !== -1);
  check('update changed the display name', MRS.catalog.getByPn('TAPE-3M-33').name !== beforeName);
  check('existing request keeps its item snapshot', MRS.requests.getById(requestOne.id).itemName !== MRS.catalog.getByPn('TAPE-3M-33').name);

  section('CATALOG CSV PREVIEW');
  const tapeNameBeforePreview = MRS.catalog.getByPn('TAPE-3M-33').name;
  const previewCsv =
    'PN;Name;Subcategory;Unit;Stock Location\r\n' +
    'TAPE-3M-33;"PVC Electrical Tape 19 mm x 20 m";Tapes;roll;A-01-02\r\n' +
    'PREVIEW-01;Preview New;Testing;pc;Q-01\r\n' +
    'BROKEN-PREVIEW;;Testing;pc;Q-02\r\n' +
    'PREVIEW-DUP;First Version;Testing;pc;Q-03\r\n' +
    'PREVIEW-DUP;Last Version;Testing;pc;Q-03\r\n';
  const preview = MRS.catalog.previewImport(previewCsv);
  eq('preview counts valid unique rows', preview.validCount, 3);
  eq('preview counts rows with errors', preview.invalidCount, 1);
  eq('preview counts duplicate PNs', preview.duplicateCount, 1);
  eq('preview predicts new materials', preview.added, 2);
  eq('preview predicts updated materials', preview.updated, 1);
  check('preview reports the broken row reason', preview.errors.some((entry) => /Missing item name/i.test(entry.message)));
  check('preview reports duplicate PN rows', preview.duplicates.some((entry) => entry.pn === 'PREVIEW-DUP'));
  check('preview writes nothing to the catalog', MRS.catalog.getByPn('PREVIEW-01') === null &&
    MRS.catalog.getByPn('PREVIEW-DUP') === null && MRS.catalog.getByPn('TAPE-3M-33').name === tapeNameBeforePreview);

  MRS.views.app.switchView('catalog');
  MRS.views.catalog.openImport();
  const previewUiCsv =
    'PN;Name;Subcategory;Unit;Stock Location\n' +
    'UI-PREVIEW-01;UI Preview One;Testing;pc;Q-11\n' +
    'UI-PREVIEW-02;First UI Duplicate;Testing;pc;Q-12\n' +
    'UI-PREVIEW-02;Last UI Duplicate;Testing;pc;Q-12\n' +
    'BROKEN-UI;;Testing;pc;Q-13\n';
  d.getElementById('importText').value = previewUiCsv;
  MRS.views.catalog.submitImport();
  await wait(40);
  check('import preview requires confirmation before writing', MRS.catalog.getByPn('UI-PREVIEW-01') === null);
  eq('import button becomes confirm', d.getElementById('importSubmit').textContent, 'Confirm import');
  check('import preview shows counts', d.getElementById('importResult').textContent.indexOf('Valid rows') !== -1 &&
    d.getElementById('importResult').textContent.indexOf('Duplicate PNs') !== -1);
  check('import preview explains no writes yet', d.getElementById('importResult').textContent.indexOf('No catalog changes have been written yet') !== -1);
  MRS.views.catalog.submitImport();
  await wait(40);
  check('confirming import writes the valid rows', !!MRS.catalog.getByPn('UI-PREVIEW-01') && !!MRS.catalog.getByPn('UI-PREVIEW-02'));
  eq('last duplicate row wins on confirm', MRS.catalog.getByPn('UI-PREVIEW-02').name, 'Last UI Duplicate');
  eq('import button resets after apply', d.getElementById('importSubmit').textContent, 'Preview again');
  MRS.utils.closeModal('modalImport');

  section('CATALOG CSV IMPORT');
  const csv =
    'PN;Name;Subcategory;Unit;Stock Location;Photo\r\n' +
    'TAPE-3M-33;"PVC Electrical Tape 19 mm x 20 m";Tapes;roll;A-01-02;\r\n' +
    'TEST-CSV-01;"CSV Test, Material";Testing;pc;Z-99-02;\r\n' +
    'BROKEN-ROW;;Testing;pc;Z-99-03;\r\n';
  const countBeforeImport = MRS.catalog.activeItems().length;
  const imported = MRS.catalog.importCSV(csv);
  check('CSV import succeeds', imported.ok === true, JSON.stringify(imported));
  eq('CSV import adds one new item', imported.added, 1);
  eq('CSV import updates one existing item', imported.updated, 1);
  eq('CSV import skips the broken row', imported.skipped, 1);
  check('CSV import reports broken row', imported.errors.some((entry) => /Missing item name/i.test(entry.message)));
  eq('catalog count reflects import', MRS.catalog.activeItems().length, countBeforeImport + 1);
  eq('quoted comma in CSV name preserved', MRS.catalog.getByPn('TEST-CSV-01').name, 'CSV Test, Material');
  const dryRun = MRS.catalog.importCSV('PN;Name;Subcategory;Unit;Stock Location\nDRY-01;Dry Run;Testing;pc;A-1', { dryRun: true });
  check('dry-run reports additions without writing', dryRun.added === 1 && MRS.catalog.getByPn('DRY-01') === null);
  const parsed = MRS.catalog.parseImportText('PN;Name;Subcategory;Unit;Stock Location\nX-1;Test;Test;pc;A');
  eq('import parser accepts semicolon CSVs', parsed.rows.length, 1);
  const noHeader = MRS.catalog.parseImportText('POS-1;Positional Item;Testing;pc;A-1;');
  eq('import parser supports positional columns', noHeader.rows.length, 1);
  check('positional import is flagged', noHeader.positional === true);
  eq('CSV formula injection neutralised', u.csvCell('=SUM(1,1)'), '"\'=SUM(1,1)"');
  eq('CSV quotes doubled', u.csvCell('say "hi"'), '"say ""hi"""');
  check('catalog CSV export contains headers', MRS.catalog.csvData().indexOf('"PN";"Name";"Subcategory"') === 0);

  section('SECURITY - XSS ESCAPING');
  const xss = MRS.catalog.saveItem({
    pn: 'XSS-01',
    name: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>',
    subcategory: 'Tapes"><b>bold</b>',
    stockLocation: '<svg onload=window.__pwned=3>',
    unit: 'pc',
    photo: ''
  });
  check('XSS item created for render test', xss.ok === true);
  MRS.views.catalog.render();
  check('no script element injected', d.querySelectorAll('#catalogGrid script').length === 0);
  check('no img with src=x injected', d.querySelectorAll('#catalogGrid img[src="x"]').length === 0);
  check('no SVG onload injected', d.querySelectorAll('#catalogGrid svg[onload]').length === 0);
  check('no payload executed', w.__pwned === undefined);
  check('payload shown as literal text', d.getElementById('catalogGrid').textContent.indexOf('<script>') !== -1);
  check('escapeHtml escapes quotes and tags', u.escapeHtml('a\'b"c<d>') === 'a&#39;b&quot;c&lt;d&gt;');
  check('safeImageUrl blocks javascript URLs', u.safeImageUrl('javascript:alert(1)') === '');
  check('safeImageUrl allows data images', u.safeImageUrl('data:image/png;base64,abc').indexOf('data:image/png') === 0);
  MRS.catalog.deleteItem(xss.item.id);
  const csvItemId = MRS.catalog.getByPn('TEST-CSV-01').id;
  MRS.catalog.deleteItem(csvItemId);
  check('soft-deleted item disappears from search', MRS.catalog.getByPn('TEST-CSV-01') === null);
  const resurrected = MRS.catalog.saveItem({
    pn: 'TEST-CSV-01',
    name: 'Restored CSV Material',
    subcategory: 'Testing',
    stockLocation: 'Z-99-02',
    unit: 'pc',
    photo: ''
  });
  check('a removed PN can be restored by adding it again', resurrected.ok === true && resurrected.restored === true);
  MRS.views.catalog.render();

  section('ADMIN USER MANAGEMENT');
  const newUser = MRS.auth.createUser({
    name: 'Test Logistics',
    username: 'testlog',
    password: 'testlog123',
    role: 'LOGISTICS'
  });
  check('admin creates a user', newUser.ok === true);
  eq('user count grew', MRS.db.users.length, 4);
  check('new user password hashed', !!(newUser.user.salt && newUser.user.hash) && newUser.user.pass === undefined);
  check('new user can authenticate', !!MRS.auth.authenticate('testlog', 'testlog123'));
  const dupUser = MRS.auth.createUser({ name: 'Duplicate', username: 'TestLog', password: 'testlog123', role: 'REQUESTER' });
  check('duplicate username rejected case-insensitively', dupUser.ok === false);
  const shortPassword = MRS.auth.createUser({ name: 'Short', username: 'shortpass', password: '123', role: 'REQUESTER' });
  check('short password rejected', shortPassword.ok === false);
  const badUsername = MRS.auth.createUser({ name: 'Bad', username: 'a', password: 'abcdef', role: 'REQUESTER' });
  check('invalid username rejected', badUsername.ok === false);
  const promoted = MRS.auth.updateUser(newUser.user.id, { role: 'ADMIN', name: 'Test Admin' });
  check('admin updates a user role', promoted.ok === true && MRS.storage.findUserById(newUser.user.id).role === 'ADMIN');
  eq('active admin count includes both admins', MRS.auth.activeAdminCount(), 2);
  const deactivated = MRS.auth.updateUser(newUser.user.id, { active: false });
  check('admin deactivates a user', deactivated.ok === true);
  check('inactive user cannot authenticate', MRS.auth.authenticate('testlog', 'testlog123') === null);
  const selfDeactivate = MRS.auth.deleteUser(MRS.currentUser.id);
  check('admin cannot deactivate own account', selfDeactivate.ok === false);
  const selfDeactivateForm = MRS.auth.updateUser(MRS.currentUser.id, { active: false });
  check('admin cannot deactivate self through the edit form', selfDeactivateForm.ok === false);
  MRS.views.admin.render();
  eq('user table reflects all users', d.querySelectorAll('#usersTable tr').length, 4);
  check('session id stored after login', JSON.parse(w.sessionStorage.getItem(MRS.config.SESSION_KEY)).userId === MRS.currentUser.id);
  MRS.auth.logout();
  w.sessionStorage.setItem(MRS.config.SESSION_KEY, JSON.stringify({ userId: MRS.storage.findUserByUsername('admin').id }));
  check('saved session restores a valid login', MRS.auth.restoreSession() === true && MRS.currentUser.role === 'ADMIN');
  MRS.views.app.onLogin();
  MRS.views.app.switchView('admin');
  check('admin view returns after session restore', !d.getElementById('viewAdmin').classList.contains('hidden'));

  section('SYNC');
  eq('Firebase URL storage key configured', MRS.config.FIREBASE_URL_KEY, 'MRS_FIREBASE_URL_V1');
  check('Firebase URL is not hardcoded in config or sync', !/firebaseio\.com|https?:\/\/[^'"\s]*firebase/i.test(
    fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8') +
    fs.readFileSync(path.join(ROOT, 'js/sync.js'), 'utf8')
  ));

  const localSnapshot = u.deepClone(MRS.db);
  const remoteSnapshot = u.deepClone(MRS.db);
  remoteSnapshot.updatedAt = localSnapshot.updatedAt + 5000;
  remoteSnapshot.items.push({
    id: 'it-remote-1',
    pn: 'REMOTE-01',
    name: 'Remote Material',
    subcategory: 'Tapes',
    stockLocation: 'R-01',
    unit: 'pc',
    photo: '',
    accent: '#06b6d4',
    active: true,
    deleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  remoteSnapshot.requests.push({
    id: 'rq-remote-1',
    requestNumber: 'MR-REMOTE-01',
    itemId: 'it-remote-1',
    itemPn: 'REMOTE-01',
    itemName: 'Remote Material',
    itemSubcategory: 'Tapes',
    itemPhoto: '',
    stockLocation: 'R-01',
    unit: 'pc',
    quantity: 3,
    requesterId: 'u-requester',
    requesterName: 'Remote Requester',
    requestingArea: 'Production',
    dropOff: 'Line 1',
    jobNumber: 'JOB-R1',
    urgency: 'NORMAL',
    status: 'NEW',
    rejectionReason: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: 0,
    completedAt: 0,
    rejectedAt: 0,
    history: []
  });
  remoteSnapshot.movements.push({
    id: 'mv-remote-1',
    type: 'IN',
    itemId: 'it-remote-1',
    itemPn: 'REMOTE-01',
    itemName: 'Remote Material',
    unit: 'pc',
    quantity: 7,
    reference: 'REMOTE-PO',
    note: '',
    actorId: 'u-admin',
    actorName: 'Remote Admin',
    sourceRequestId: '',
    sourceRequestNumber: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  const merged = MRS.sync.mergeRemote(localSnapshot, remoteSnapshot);
  check('remote merge reports a change', merged.changed === true);
  check('remote item merged into local state', merged.db.items.some((item) => item.id === 'it-remote-1'));
  check('remote request merged into local state', merged.db.requests.some((request) => request.id === 'rq-remote-1'));
  check('remote movement merged into local state', merged.db.movements.some((movement) => movement.id === 'mv-remote-1'));
  eq('remote merge keeps local requests', merged.db.requests.filter((request) => request.id !== 'rq-remote-1').length, localSnapshot.requests.length);
  eq('remote merge keeps local movements', merged.db.movements.filter((movement) => movement.id !== 'mv-remote-1').length, localSnapshot.movements.length);

  const tombLocal = u.deepClone(MRS.db);
  const tombRemote = u.deepClone(MRS.db);
  const localTombstone = tombLocal.items.find((item) => item.id === xss.item.id);
  const remoteTombstone = tombRemote.items.find((item) => item.id === xss.item.id);
  remoteTombstone.deleted = false;
  remoteTombstone.updatedAt = localTombstone.updatedAt - 1000;
  const tombstoneMerged = MRS.sync.mergeRemote(tombLocal, tombRemote);
  const tombstoneResult = tombstoneMerged.db.items.find((item) => item.id === xss.item.id);
  check('soft delete survives a remote merge', !!tombstoneResult && tombstoneResult.deleted === true);
  check('merge never drops records', tombstoneMerged.db.items.length === tombLocal.items.length);

  const realFetch = w.fetch;
  w.fetch = function () {
    return Promise.resolve({
      ok: true,
      json: function () { return Promise.resolve(null); }
    });
  };
  const setUrl = MRS.sync.setFirebaseUrl('https://example.test/db/');
  await wait(30);
  check('admin can set a Firebase URL', setUrl.ok === true);
  eq('Firebase URL stored without trailing slash', MRS.sync.getFirebaseUrl(), 'https://example.test/db');
  eq('Firebase URL persisted under the config key', w.localStorage.getItem(MRS.config.FIREBASE_URL_KEY), 'https://example.test/db');
  MRS.sync.stopPolling();
  MRS.sync.setFirebaseUrl('');
  eq('Firebase URL can be cleared', w.localStorage.getItem(MRS.config.FIREBASE_URL_KEY), null);
  w.fetch = realFetch;

  section('HTML + UI CONTRACT');
  eq('no inline onclick handlers', d.querySelectorAll('[onclick]').length, 0);
  eq('no inline onchange handlers', d.querySelectorAll('[onchange]').length, 0);
  check('data-action wiring present', d.querySelectorAll('[data-action]').length > 20,
    d.querySelectorAll('[data-action]').length + ' actions');
  check('login form exists', !!d.getElementById('loginForm'));
  check('item modal exists', !!d.getElementById('modalItem'));
  check('import modal exists', !!d.getElementById('modalImport'));
  check('user modal exists', !!d.getElementById('modalUser'));
  check('confirm modal exists', !!d.getElementById('modalConfirm'));
  check('reject modal exists', !!d.getElementById('modalReject'));
  check('reject modal uses a preset dropdown and note field',
    d.getElementById('rejectReason').tagName === 'SELECT' && d.getElementById('rejectNote').tagName === 'TEXTAREA');
  check('toast host exists', !!d.getElementById('toastContainer'));
  check('request form and queue are implemented', !!d.getElementById('requestForm') &&
    !!d.getElementById('queueList') && !!d.getElementById('requestFilters'));
  check('stock receipt modal exists', !!d.getElementById('modalReceipt') && !!d.getElementById('receiptForm'));
  check('dashboard view is implemented', !!d.getElementById('viewDashboard') &&
    !!d.getElementById('dashChart') && !!d.getElementById('dashPareto') && !!d.getElementById('dashTopItems'));
  check('stock view is implemented', !!d.getElementById('viewStock') &&
    !!d.getElementById('stockBalanceList') && !!d.getElementById('stockLedgerList'));
  check('reports view is implemented', !!d.getElementById('viewReports') &&
    !!d.getElementById('reportRequestRows') && !!d.getElementById('reportPeriods'));
  check('csv import preview controls exist', !!d.getElementById('importSubmit') && !!d.getElementById('importResult') &&
    !!d.getElementById('importError'));
  check('requests module ready', MRS.requests.isReady === true &&
    Array.isArray(MRS.requests.STATUSES) && MRS.requests.STATUSES.length === 4);
  check('movements module ready', MRS.movements.isReady === true && MRS.movements.TYPES.length === 2);
  check('reports module ready', Array.isArray(MRS.reports.PERIODS) && MRS.reports.PERIODS.length === 5 &&
    typeof MRS.reports.dashboard === 'function' && typeof MRS.reports.periodData === 'function');
  check('phase 3 views registered', typeof MRS.views.dashboard.render === 'function' &&
    typeof MRS.views.stock.render === 'function' && typeof MRS.views.reports.render === 'function');
  const indexSource = fs.readFileSync(INDEX, 'utf8');
  check('Excel library is loaded from the local vendor file', indexSource.indexOf('src="js/vendor/xlsx.full.min.js"') !== -1);
  check('Excel library has no CDN fallback', !/https?:\/\/[^"']*xlsx/i.test(indexSource));
  check('page loads the workbook exporter', indexSource.indexOf('src="js/exporter.js"') !== -1);

  section('PERSISTENCE');
  const finalStored = JSON.parse(w.localStorage.getItem(MRS.config.STORAGE_KEY));
  check('localStorage reflects in-memory users', finalStored.users.length === MRS.db.users.length);
  check('localStorage contains items', finalStored.items.length > 0);
  eq('localStorage persists requests', finalStored.requests.length, 2);
  eq('localStorage persists movements', finalStored.movements.length, 3);
  check('stored requests keep status history', finalStored.requests.every((request) => Array.isArray(request.history) && request.history.length > 0));
  check('stored movements keep stock effects', finalStored.movements.every((movement) =>
    movement.id && movement.itemId && movement.itemPn && movement.type && movement.quantity > 0
  ));
  check('localStorage contains no plaintext demo passwords',
    !/requester123|logistics123|admin123|testlog123/.test(w.localStorage.getItem(MRS.config.STORAGE_KEY)));
  check('updatedAt is a number', typeof finalStored.updatedAt === 'number');

  section('CONSOLE HEALTH');
  const realErrors = consoleErrors.filter((entry) => !/Not implemented|Could not parse CSS/i.test(entry));
  check('no runtime errors logged', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));

  console.log('\n' + '='.repeat(52));
  console.log('SMOKE TEST RESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) {
    console.log('\nFailures:');
    failures.forEach((name) => console.log(' - ' + name));
  }
  console.log('='.repeat(52));
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error('\nSMOKE TEST CRASHED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(2);
});
