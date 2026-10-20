(function (MRS) {
    'use strict';

    function activeItems() {
        if (!MRS.db) return [];
        return (MRS.db.items || []).filter(function (item) {
            return item && !item.deleted && item.active !== false;
        });
    }

    function allItems() {
        if (!MRS.db) return [];
        return (MRS.db.items || []).filter(function (item) {
            return item && !item.deleted;
        });
    }

    function getById(id) {
        if (!id) return null;
        return activeItems().find(function (item) { return item.id === id; }) || null;
    }

    function getByPn(pn, includeDeleted) {
        var target = String(pn || '').trim().toLowerCase();
        if (!target) return null;
        var pool = includeDeleted ? (MRS.db.items || []) : activeItems();
        return pool.find(function (item) {
            return String(item.pn || '').trim().toLowerCase() === target && (includeDeleted || !item.deleted);
        }) || null;
    }

    function subcategoryList() {
        var counts = {};
        activeItems().forEach(function (item) {
            var name = item.subcategory || 'Uncategorized';
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.keys(counts).sort(function (a, b) {
            return a.localeCompare(b);
        }).map(function (name) {
            return { name: name, count: counts[name] };
        });
    }

    function scoreItem(item, tokens, term) {
        var pn = MRS.utils.normalizeSearch(item.pn);
        var name = MRS.utils.normalizeSearch(item.name);
        var subcategory = MRS.utils.normalizeSearch(item.subcategory);
        var location = MRS.utils.normalizeSearch(item.stockLocation);
        var haystack = pn + ' ' + name + ' ' + subcategory + ' ' + location;

        for (var i = 0; i < tokens.length; i++) {
            if (haystack.indexOf(tokens[i]) === -1) return -1;
        }

        if (!term) return 50;
        if (pn === term) return 0;
        if (pn.indexOf(term) === 0) return 1;
        if (name.indexOf(term) === 0) return 2;
        if (pn.indexOf(term) !== -1) return 3;
        if (name.indexOf(term) !== -1) return 4;
        if (subcategory.indexOf(term) !== -1) return 5;
        return 10;
    }

    function filterItems(term, subcategory) {
        var normalizedTerm = MRS.utils.normalizeSearch(term);
        var tokens = normalizedTerm.split(' ').filter(Boolean);
        var targetSubcategory = String(subcategory || '').trim();

        return activeItems().filter(function (item) {
            if (targetSubcategory && item.subcategory !== targetSubcategory) return false;
            return scoreItem(item, tokens, normalizedTerm) !== -1;
        }).sort(function (a, b) {
            var scoreA = scoreItem(a, tokens, normalizedTerm);
            var scoreB = scoreItem(b, tokens, normalizedTerm);
            if (scoreA !== scoreB) return scoreA - scoreB;
            return String(a.name).localeCompare(String(b.name));
        });
    }

    function accentFor(subcategory) {
        return MRS.SUBCATEGORY_ACCENTS[subcategory] || '#06b6d4';
    }

    function cleanPayload(payload) {
        return {
            id: String(payload.id || '').trim(),
            pn: String(payload.pn || '').trim().toUpperCase(),
            name: String(payload.name || '').trim(),
            subcategory: String(payload.subcategory || '').trim(),
            stockLocation: String(payload.stockLocation || '').trim(),
            unit: String(payload.unit || '').trim(),
            photo: String(payload.photo || '').trim()
        };
    }

    function validateItem(payload, existingId) {
        var data = cleanPayload(payload);
        var errors = {};

        if (!data.pn) errors.pn = 'Part number is required.';
        else if (data.pn.length > 60) errors.pn = 'Part number must have at most 60 characters.';
        if (!data.name) errors.name = 'Item name is required.';
        else if (data.name.length > 120) errors.name = 'Item name must have at most 120 characters.';
        if (!data.subcategory) errors.subcategory = 'Subcategory is required.';
        if (!data.stockLocation) errors.stockLocation = 'Stock location is required.';
        if (!data.unit) errors.unit = 'Unit is required.';
        if (MRS.config.UNITS.indexOf(data.unit) === -1) errors.unit = 'Select a valid unit.';
        if (data.photo && !MRS.utils.safeImageUrl(data.photo)) {
            errors.photo = 'Photo must be an http(s) image URL or an uploaded image.';
        }

        if (!errors.pn) {
            var duplicate = getByPn(data.pn, true);
            if (duplicate && duplicate.id !== existingId && !duplicate.deleted) {
                errors.pn = 'That part number already exists in the catalog.';
            }
        }

        return {
            ok: Object.keys(errors).length === 0,
            errors: errors,
            data: data
        };
    }

    function applyItemData(item, data) {
        item.pn = data.pn;
        item.name = data.name;
        item.subcategory = data.subcategory;
        item.stockLocation = data.stockLocation;
        item.unit = data.unit;
        item.photo = data.photo;
        item.accent = accentFor(data.subcategory);
        item.active = true;
        item.updatedAt = Math.max(Date.now(), Number(item.updatedAt || 0) + 1);
    }

    function saveItem(payload) {
        if (!MRS.auth.requireRole('LOGISTICS')) return { ok: false, error: 'Permission denied.', errors: {} };
        var raw = payload || {};
        var existing = raw.id ? getById(raw.id) : null;
        if (raw.id && !existing) return { ok: false, error: 'Item not found.', errors: {} };

        var validation = validateItem(raw, existing ? existing.id : null);
        if (!validation.ok) {
            return { ok: false, error: 'Check the highlighted fields.', errors: validation.errors };
        }

        var data = validation.data;
        if (existing) {
            applyItemData(existing, data);
            MRS.storage.save();
            return { ok: true, item: existing, created: false };
        }

        var removed = getByPn(data.pn, true);
        if (removed && removed.deleted) {
            applyItemData(removed, data);
            removed.deleted = false;
            MRS.storage.save();
            return { ok: true, item: removed, created: true, restored: true };
        }

        var item = {
            id: MRS.utils.uid('it'),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            deleted: false
        };
        applyItemData(item, data);
        MRS.db.items.push(item);
        MRS.storage.save();
        return { ok: true, item: item, created: true };
    }

    function deleteItem(id) {
        if (!MRS.auth.requireRole('LOGISTICS')) return { ok: false, error: 'Permission denied.' };
        var item = getById(id);
        if (!item) return { ok: false, error: 'Item not found.' };
        item.deleted = true;
        item.updatedAt = Date.now();
        MRS.storage.save();
        return { ok: true, item: item };
    }

    var HEADER_ALIASES = {
        pn: ['pn', 'partnumber', 'partno', 'itemnumber', 'itemno', 'code', 'sku'],
        name: ['name', 'description', 'itemdescription', 'itemname', 'material'],
        subcategory: ['subcategory', 'category', 'group', 'family', 'type'],
        unit: ['unit', 'uom', 'unitofmeasure', 'units'],
        stockLocation: ['stocklocation', 'location', 'stockloc', 'bin', 'warehouselocation'],
        photo: ['photo', 'photourl', 'image', 'imageurl', 'picture']
    };

    function headerLookup(headers) {
        var normalized = headers.map(function (header) {
            return MRS.utils.normalizeSearch(header).replace(/[^a-z0-9]/g, '');
        });
        var map = {};

        Object.keys(HEADER_ALIASES).forEach(function (field) {
            var aliases = HEADER_ALIASES[field];
            for (var i = 0; i < normalized.length; i++) {
                if (aliases.indexOf(normalized[i]) !== -1) {
                    map[field] = i;
                    break;
                }
            }
        });

        return map;
    }

    function rowToPayload(row, map) {
        return {
            pn: row[map.pn] || '',
            name: row[map.name] || '',
            subcategory: row[map.subcategory] !== undefined ? row[map.subcategory] : 'Imported',
            unit: row[map.unit] !== undefined ? row[map.unit] : 'pc',
            stockLocation: row[map.stockLocation] !== undefined ? row[map.stockLocation] : '',
            photo: row[map.photo] !== undefined ? row[map.photo] : ''
        };
    }

    function parseImportText(text) {
        var rows = MRS.utils.parseCSV(text);
        var errors = [];
        var warnings = [];
        var duplicates = [];
        var candidates = [];
        var seen = {};
        var totalRows = 0;

        if (!rows.length) {
            return {
                rows: [],
                errors: [{ row: 0, message: 'The CSV is empty.' }],
                warnings: warnings,
                duplicates: duplicates,
                skipped: 1,
                invalidCount: 1,
                duplicateCount: 0,
                validCount: 0,
                totalRows: 0,
                added: 0,
                updated: 0,
                positional: false
            };
        }

        var map = headerLookup(rows[0]);
        var positional = map.pn === undefined || map.name === undefined;
        if (positional) {
            map = { pn: 0, name: 1, subcategory: 2, unit: 3, stockLocation: 4, photo: 5 };
            warnings.push({ row: 1, message: 'No PN/Name header found. Using positional columns.' });
        }

        var start = positional ? 0 : 1;

        rows.slice(start).forEach(function (row, index) {
            var line = start + index + 1;
            var payload = rowToPayload(row, map);
            payload.pn = String(payload.pn || '').trim().toUpperCase();
            payload.name = String(payload.name || '').trim();
            if (!payload.pn && !payload.name) return;
            totalRows++;

            if (!payload.pn) {
                errors.push({ row: line, message: 'Missing part number.' });
                return;
            }
            if (!payload.name) {
                errors.push({ row: line, message: 'Missing item name.' });
                return;
            }

            payload.unit = String(payload.unit || 'pc').trim() || 'pc';
            payload.subcategory = String(payload.subcategory || 'Imported').trim() || 'Imported';
            payload.stockLocation = String(payload.stockLocation || '').trim();
            payload.photo = String(payload.photo || '').trim();

            if (seen[payload.pn]) {
                seen[payload.pn].payload = payload;
                seen[payload.pn].line = line;
                duplicates.push({
                    row: line,
                    pn: payload.pn,
                    message: 'Duplicate part number in this file. The last row wins.'
                });
                return;
            }

            var candidate = { payload: payload, line: line };
            seen[payload.pn] = candidate;
            candidates.push(candidate);
        });

        var payloads = [];
        var added = 0;
        var updated = 0;
        candidates.forEach(function (candidate) {
            var existing = getByPn(candidate.payload.pn, true);
            var validation = validateItem(candidate.payload, existing ? existing.id : null);
            if (!validation.ok) {
                var reasons = Object.keys(validation.errors).map(function (key) {
                    return validation.errors[key];
                }).join(' ');
                errors.push({
                    row: candidate.line,
                    message: candidate.payload.pn + ': ' + reasons
                });
                return;
            }
            if (existing) updated++;
            else added++;
            payloads.push(validation.data);
        });

        return {
            rows: payloads,
            errors: errors,
            warnings: warnings,
            duplicates: duplicates,
            skipped: errors.length,
            invalidCount: errors.length,
            duplicateCount: duplicates.length,
            validCount: payloads.length,
            totalRows: totalRows,
            added: added,
            updated: updated,
            positional: positional
        };
    }

    function upsertImported(payload) {
        var existing = getByPn(payload.pn, true);
        var now = Date.now();

        if (existing && existing.deleted) {
            existing.deleted = false;
            applyItemData(existing, payload);
            return { item: existing, created: false, restored: true };
        }

        if (existing) {
            applyItemData(existing, payload);
            return { item: existing, created: false };
        }

        var item = {
            id: MRS.utils.uid('it'),
            createdAt: now,
            updatedAt: now,
            deleted: false
        };
        applyItemData(item, payload);
        MRS.db.items.push(item);
        return { item: item, created: true };
    }

    function previewImport(text) {
        if (!MRS.auth.requireRole('LOGISTICS')) {
            return { ok: false, error: 'Permission denied.', rows: [], errors: [], duplicates: [] };
        }
        var parsed = parseImportText(text);
        return {
            ok: parsed.validCount > 0,
            validCount: parsed.validCount,
            invalidCount: parsed.invalidCount,
            duplicateCount: parsed.duplicateCount,
            added: parsed.added,
            updated: parsed.updated,
            totalRows: parsed.totalRows,
            errors: parsed.errors,
            warnings: parsed.warnings,
            duplicates: parsed.duplicates,
            positional: parsed.positional,
            canApply: parsed.validCount > 0,
            error: parsed.validCount ? '' : 'No valid rows found. Fix the errors and preview again.'
        };
    }

    function importCSV(text, options) {
        if (!MRS.auth.requireRole('LOGISTICS')) {
            return { ok: false, error: 'Permission denied.', added: 0, updated: 0, skipped: 0, errors: [], duplicates: [] };
        }

        var parsed = parseImportText(text);
        var settings = options || {};
        var added = 0;
        var updated = 0;

        if (!parsed.rows.length) {
            return {
                ok: false,
                error: 'No importable rows found.',
                added: 0,
                updated: 0,
                skipped: parsed.invalidCount,
                errors: parsed.errors,
                duplicates: parsed.duplicates
            };
        }

        if (!settings.dryRun) {
            parsed.rows.forEach(function (payload) {
                var result = upsertImported(payload);
                if (result.created) added++;
                else updated++;
            });
            if (added || updated) MRS.storage.save();
        } else {
            added = parsed.added;
            updated = parsed.updated;
        }

        return {
            ok: added + updated > 0,
            added: added,
            updated: updated,
            skipped: parsed.invalidCount,
            errors: parsed.errors,
            warnings: parsed.warnings,
            duplicates: parsed.duplicates,
            duplicateCount: parsed.duplicateCount,
            positional: parsed.positional,
            dryRun: settings.dryRun === true
        };
    }

    function csvData() {
        var rows = [['PN', 'Name', 'Subcategory', 'Unit', 'Stock Location', 'Photo']];
        activeItems().slice().sort(function (a, b) {
            return String(a.pn).localeCompare(String(b.pn));
        }).forEach(function (item) {
            rows.push([item.pn, item.name, item.subcategory, item.unit, item.stockLocation, item.photo]);
        });
        return MRS.utils.toCSV(rows, ';');
    }

    function exportCatalog() {
        var filename = 'material-catalog-' + new Date().toISOString().slice(0, 10) + '.csv';
        return MRS.utils.downloadText(filename, csvData(), 'text/csv;charset=utf-8');
    }

    function stats() {
        var items = activeItems();
        var updatedAt = items.reduce(function (latest, item) {
            return Math.max(latest, Number(item.updatedAt) || 0);
        }, 0);
        return {
            items: items.length,
            subcategories: Object.keys(items.reduce(function (set, item) {
                set[item.subcategory] = true;
                return set;
            }, {})).length,
            photos: items.filter(function (item) { return !!item.photo; }).length,
            updatedAt: updatedAt
        };
    }

    function resetToSeed() {
        if (!MRS.auth.requireRole('ADMIN')) return { ok: false, error: 'Permission denied.' };
        var seeded = MRS.seedItems();
        MRS.db.items = seeded;
        MRS.storage.save();
        return { ok: true, items: seeded.length };
    }

    MRS.catalog = {
        activeItems: activeItems,
        allItems: allItems,
        getById: getById,
        getByPn: getByPn,
        subcategoryList: subcategoryList,
        filterItems: filterItems,
        search: filterItems,
        validateItem: validateItem,
        saveItem: saveItem,
        deleteItem: deleteItem,
        parseImportText: parseImportText,
        previewImport: previewImport,
        importCSV: importCSV,
        csvData: csvData,
        exportCatalog: exportCatalog,
        stats: stats,
        accentFor: accentFor,
        resetToSeed: resetToSeed
    };

}(window.MRS = window.MRS || {}));
