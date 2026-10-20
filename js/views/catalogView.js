(function (MRS) {
    'use strict';

    var state = {
        term: '',
        subcategory: ''
    };

    var importState = {
        reviewed: false,
        content: '',
        applied: false
    };

    function canManage() {
        return MRS.auth.hasRole('LOGISTICS');
    }

    function photoFallback() {
        return '<div class="item-photo-fallback">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"></path>' +
            '<path d="M4 7.5 12 12l8-4.5M12 12v9"></path>' +
            '</svg></div>';
    }

    function renderStats() {
        var stats = MRS.catalog.stats();
        MRS.utils.setText('catalogStatItems', stats.items);
        MRS.utils.setText('catalogStatSubcats', stats.subcategories);
        MRS.utils.setText('catalogStatPhotos', stats.photos);
        MRS.utils.setText('catalogStatUpdated', stats.updatedAt ? MRS.utils.formatDateTime(stats.updatedAt) : '--');
    }

    function renderSubcategories() {
        var host = MRS.utils.$('catalogSubcats');
        if (!host) return;
        var list = MRS.catalog.subcategoryList();
        var total = MRS.catalog.activeItems().length;
        var chunks = [];

        chunks.push(
            '<button type="button" class="subcat-chip' + (!state.subcategory ? ' active' : '') + '" data-action="subcat-filter" data-subcat="">All materials <span>' + total + '</span></button>'
        );
        list.forEach(function (entry) {
            chunks.push(
                '<button type="button" class="subcat-chip' + (state.subcategory === entry.name ? ' active' : '') + '" data-action="subcat-filter" data-subcat="' + MRS.utils.escapeAttr(entry.name) + '">' +
                MRS.utils.escapeHtml(entry.name) + ' <span>' + entry.count + '</span></button>'
            );
        });

        host.innerHTML = chunks.join('');
    }

    function renderGrid() {
        var grid = MRS.utils.$('catalogGrid');
        var empty = MRS.utils.$('catalogEmpty');
        var emptyText = MRS.utils.$('catalogEmptyText');
        var meta = MRS.utils.$('catalogResultsMeta');
        var clear = MRS.utils.$('catalogSearchClear');
        if (!grid) return;

        var results = MRS.catalog.filterItems(state.term, state.subcategory);
        var total = MRS.catalog.activeItems().length;

        if (clear) clear.classList.toggle('hidden', !state.term);
        if (meta) {
            var bits = [results.length + ' of ' + total + ' items'];
            if (state.term) bits.push('matching "' + state.term + '"');
            if (state.subcategory) bits.push('in ' + state.subcategory);
            meta.textContent = bits.join(' ');
        }

        if (!results.length) {
            grid.innerHTML = '';
            grid.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            if (emptyText) {
                emptyText.textContent = state.term || state.subcategory
                    ? 'No part number or description matches these filters. Try a broader search.'
                    : 'The catalog is empty. Add the first material to get started.';
            }
            return;
        }

        grid.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        var manage = canManage();
        var html = results.map(function (item, index) {
            var photo = MRS.utils.safeImageUrl(item.photo);
            var accent = /^#[0-9a-f]{6}$/i.test(item.accent || '') ? item.accent : MRS.catalog.accentFor(item.subcategory);
            var safeId = MRS.utils.escapeAttr(item.id);
            var imageHtml = photo
                ? '<img src="' + MRS.utils.escapeAttr(photo) + '" alt="' + MRS.utils.escapeAttr(item.name) + '" loading="lazy">'
                : photoFallback();

            var actions =
                '<div class="item-actions">' +
                '<button type="button" class="btn btn-request" data-action="catalog-request" data-id="' + safeId + '">Request</button>';
            if (manage) {
                actions +=
                    '<span class="item-actions-spacer"></span>' +
                    '<button type="button" class="btn btn-edit" data-action="item-edit" data-id="' + safeId + '">Edit</button>' +
                    '<button type="button" class="btn btn-delete" data-action="item-delete" data-id="' + safeId + '">Remove</button>';
            }
            actions += '</div>';

            return '<article class="item-card" style="--item-accent:' + accent + ';animation-delay:' + Math.min(index * 12, 240) + 'ms">' +
                '<div class="item-photo">' +
                '<span class="pn-tag">' + MRS.utils.escapeHtml(item.pn) + '</span>' +
                imageHtml +
                '</div>' +
                '<div class="item-body">' +
                '<span class="item-subcat">' + MRS.utils.escapeHtml(item.subcategory) + '</span>' +
                '<h3 class="item-name">' + MRS.utils.escapeHtml(item.name) + '</h3>' +
                '<div class="item-meta">' +
                '<span class="loc-chip">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"></path><circle cx="12" cy="11" r="2.2"></circle></svg>' +
                '<span>' + MRS.utils.escapeHtml(item.stockLocation || 'No location') + '</span>' +
                '</span>' +
                '<span class="unit-chip">' + MRS.utils.escapeHtml(item.unit) + '</span>' +
                '</div>' +
                '</div>' +
                actions +
                '</article>';
        }).join('');

        grid.innerHTML = html;
    }

    function renderDatalist() {
        var datalist = MRS.utils.$('subcategoryOptions');
        if (!datalist) return;
        datalist.innerHTML = MRS.catalog.subcategoryList().map(function (entry) {
            return '<option value="' + MRS.utils.escapeAttr(entry.name) + '"></option>';
        }).join('');
    }

    function ensureUnitOptions() {
        var select = MRS.utils.$('itemUnit');
        if (!select || select.options.length === MRS.config.UNITS.length) return;
        select.innerHTML = MRS.config.UNITS.map(function (unit) {
            return '<option value="' + MRS.utils.escapeAttr(unit) + '">' + MRS.utils.escapeHtml(unit) + '</option>';
        }).join('');
    }

    function render() {
        if (!MRS.db) return;
        ensureUnitOptions();
        renderStats();
        renderSubcategories();
        renderDatalist();
        renderGrid();
    }

    function setPreview(source) {
        var preview = MRS.utils.$('itemPhotoPreview');
        if (!preview) return;
        var safe = MRS.utils.safeImageUrl(source);
        preview.innerHTML = '';
        if (!safe) {
            var span = document.createElement('span');
            span.textContent = 'No photo selected';
            preview.appendChild(span);
            return;
        }
        var image = document.createElement('img');
        image.src = safe;
        image.alt = 'Item photo preview';
        preview.appendChild(image);
    }

    function resetForm() {
        MRS.utils.$('itemId').value = '';
        MRS.utils.$('itemPn').value = '';
        MRS.utils.$('itemName').value = '';
        MRS.utils.$('itemSubcategory').value = '';
        MRS.utils.$('itemStockLocation').value = '';
        MRS.utils.$('itemPhotoUrl').value = '';
        MRS.utils.$('itemPhotoData').value = '';
        MRS.utils.$('itemPhotoFile').value = '';
        MRS.utils.$('itemUnit').value = 'pc';
        MRS.utils.setText('itemFormError', '');
        setPreview('');
    }

    function openAdd() {
        if (!MRS.auth.requireRole('LOGISTICS')) return;
        resetForm();
        MRS.utils.setText('itemModalTitle', 'Add material');
        MRS.utils.setText('itemSaveBtn', 'Save item');
        MRS.utils.openModal('modalItem');
    }

    function openEdit(id) {
        if (!MRS.auth.requireRole('LOGISTICS')) return;
        var item = MRS.catalog.getById(id);
        if (!item) {
            MRS.utils.toast('Item not found.', 'error');
            return;
        }

        resetForm();
        MRS.utils.$('itemId').value = item.id;
        MRS.utils.$('itemPn').value = item.pn;
        MRS.utils.$('itemName').value = item.name;
        MRS.utils.$('itemSubcategory').value = item.subcategory;
        MRS.utils.$('itemStockLocation').value = item.stockLocation;
        MRS.utils.$('itemUnit').value = item.unit;
        MRS.utils.setText('itemModalTitle', 'Edit material');
        MRS.utils.setText('itemSaveBtn', 'Save changes');

        if (/^data:image\//i.test(item.photo || '')) {
            MRS.utils.$('itemPhotoData').value = item.photo;
            setPreview(item.photo);
        } else {
            MRS.utils.$('itemPhotoUrl').value = item.photo || '';
            setPreview(item.photo || '');
        }

        MRS.utils.openModal('modalItem');
    }

    function collectForm() {
        var dataUrl = MRS.utils.$('itemPhotoData').value.trim();
        var photoUrl = MRS.utils.$('itemPhotoUrl').value.trim();
        return {
            id: MRS.utils.$('itemId').value,
            pn: MRS.utils.$('itemPn').value,
            name: MRS.utils.$('itemName').value,
            subcategory: MRS.utils.$('itemSubcategory').value,
            stockLocation: MRS.utils.$('itemStockLocation').value,
            unit: MRS.utils.$('itemUnit').value,
            photo: dataUrl || photoUrl
        };
    }

    function showItemErrors(errors) {
        var box = MRS.utils.$('itemFormError');
        var fieldMap = {
            pn: 'itemPn',
            name: 'itemName',
            subcategory: 'itemSubcategory',
            stockLocation: 'itemStockLocation',
            unit: 'itemUnit',
            photo: 'itemPhotoUrl'
        };
        var parts = [];
        var first = null;
        Object.keys(errors).forEach(function (key) {
            parts.push(errors[key]);
            if (!first && fieldMap[key]) first = MRS.utils.$(fieldMap[key]);
        });
        if (box) box.textContent = parts.join(' ');
        if (first) {
            first.focus();
            first.classList.add('invalid');
            setTimeout(function () { first.classList.remove('invalid'); }, 1800);
        }
    }

    function saveFromForm() {
        var box = MRS.utils.$('itemFormError');
        if (box) box.textContent = '';
        var result = MRS.catalog.saveItem(collectForm());
        if (!result.ok) {
            if (result.errors && Object.keys(result.errors).length) showItemErrors(result.errors);
            else if (box) box.textContent = result.error || 'Could not save the item.';
            MRS.utils.toast(result.error || 'Could not save the item.', 'error');
            return;
        }

        MRS.utils.closeModal('modalItem');
        MRS.utils.toast(result.created ? 'Material added to the catalog.' : 'Material updated.', 'success');
        render();
        if (MRS.views.admin) MRS.views.admin.renderStats();
    }

    function confirmDelete(id) {
        var item = MRS.catalog.getById(id);
        if (!item) return;
        MRS.views.app.openConfirm({
            title: 'Remove material',
            message: 'Remove ' + item.pn + ' - ' + item.name + ' from the active catalog? Historical records are kept.',
            onConfirm: function () {
                var result = MRS.catalog.deleteItem(id);
                if (!result.ok) {
                    MRS.utils.toast(result.error || 'Could not remove the item.', 'error');
                    return;
                }
                MRS.utils.toast('Material removed from the catalog.', 'success');
                render();
                if (MRS.views.admin) MRS.views.admin.renderStats();
            }
        });
    }

    function onSearchInput() {
        var input = MRS.utils.$('catalogSearch');
        state.term = input ? input.value.trim() : '';
        renderGrid();
    }

    function clearSearch() {
        state.term = '';
        state.subcategory = '';
        var input = MRS.utils.$('catalogSearch');
        if (input) input.value = '';
        var clear = MRS.utils.$('catalogSearchClear');
        if (clear) clear.classList.add('hidden');
        renderSubcategories();
        renderGrid();
    }

    function filterSubcategory(name) {
        state.subcategory = state.subcategory === name ? '' : name;
        renderSubcategories();
        renderGrid();
    }

    function setPhotoPreview(dataUrl) {
        MRS.utils.$('itemPhotoData').value = dataUrl || '';
        MRS.utils.$('itemPhotoUrl').value = '';
        setPreview(dataUrl || '');
    }

    function onPhotoFile() {
        var input = MRS.utils.$('itemPhotoFile');
        if (!input || !input.files || !input.files[0]) return;
        var file = input.files[0];
        var errorBox = MRS.utils.$('itemFormError');
        if (errorBox) errorBox.textContent = '';

        if (file.size > MRS.config.TECH.maxPhotoBytes) {
            var message = 'Photo is too large. Maximum size is ' + MRS.utils.formatBytes(MRS.config.TECH.maxPhotoBytes) + '.';
            if (errorBox) errorBox.textContent = message;
            MRS.utils.toast(message, 'error');
            input.value = '';
            return;
        }
        if (!/^image\//i.test(file.type)) {
            if (errorBox) errorBox.textContent = 'Select an image file.';
            input.value = '';
            return;
        }

        MRS.utils.readFileAsDataURL(file).then(function (dataUrl) {
            if (!MRS.utils.safeImageUrl(dataUrl)) throw new Error('Unsupported image format.');
            setPhotoPreview(dataUrl);
        }).catch(function (error) {
            if (errorBox) errorBox.textContent = error.message || 'Could not read the image.';
        });
    }

    function clearPhoto() {
        MRS.utils.$('itemPhotoData').value = '';
        MRS.utils.$('itemPhotoUrl').value = '';
        MRS.utils.$('itemPhotoFile').value = '';
        setPreview('');
    }

    function onPhotoUrlInput() {
        var url = MRS.utils.$('itemPhotoUrl').value.trim();
        if (!url) return;
        MRS.utils.$('itemPhotoData').value = '';
        setPreview(url);
    }

    function importButton(label) {
        MRS.utils.setText('importSubmit', label);
    }

    function hideImportResult() {
        var result = MRS.utils.$('importResult');
        if (result) {
            result.classList.add('hidden');
            result.innerHTML = '';
        }
    }

    function resetImportReview(options) {
        importState.reviewed = false;
        importState.content = '';
        importState.applied = false;
        importButton('Preview import');
        if (!options || !options.keepResult) hideImportResult();
    }

    function openImport() {
        if (!MRS.auth.requireRole('LOGISTICS')) return;
        MRS.utils.$('importFile').value = '';
        MRS.utils.$('importText').value = '';
        MRS.utils.setText('importFileName', 'No file selected');
        MRS.utils.setText('importError', '');
        resetImportReview();
        MRS.utils.openModal('modalImport');
    }

    function onImportFile() {
        var input = MRS.utils.$('importFile');
        if (!input || !input.files || !input.files[0]) return;
        var file = input.files[0];
        resetImportReview();
        MRS.utils.setText('importFileName', file.name + ' (' + MRS.utils.formatBytes(file.size) + ')');
        MRS.utils.readFileAsText(file).then(function (text) {
            MRS.utils.$('importText').value = text;
            resetImportReview();
        }).catch(function () {
            MRS.utils.setText('importError', 'Could not read the selected file.');
        });
    }

    function importErrorList(items, label) {
        if (!items || !items.length) return [];
        var parts = ['<div class="import-detail"><span class="field-label">' + label + '</span><ul>'];
        items.slice(0, 12).forEach(function (error) {
            var prefix = error.row ? 'Row ' + error.row + ': ' : '';
            parts.push('<li>' + MRS.utils.escapeHtml(prefix + error.message) + '</li>');
        });
        if (items.length > 12) parts.push('<li>...and ' + (items.length - 12) + ' more.</li>');
        parts.push('</ul></div>');
        return parts;
    }

    function showImportPreview(preview) {
        var box = MRS.utils.$('importResult');
        if (!box) return;
        var parts = [];
        parts.push('<strong>Import preview</strong>');
        parts.push('<div class="import-counts">' +
            '<span class="import-count is-valid"><strong>' + preview.validCount + '</strong><small>Valid rows</small></span>' +
            '<span class="import-count is-error"><strong>' + preview.invalidCount + '</strong><small>Rows with errors</small></span>' +
            '<span class="import-count is-duplicate"><strong>' + preview.duplicateCount + '</strong><small>Duplicate PNs</small></span>' +
            '</div>');
        parts.push('<div class="import-breakdown">' + preview.added + ' new material' + (preview.added === 1 ? '' : 's') + ' · ' +
            preview.updated + ' existing PN' + (preview.updated === 1 ? '' : 's') + ' will be updated · ' +
            preview.totalRows + ' data row' + (preview.totalRows === 1 ? '' : 's') + ' read</div>');
        if (preview.duplicates && preview.duplicates.length) {
            parts.push('<div class="import-detail"><span class="field-label">Duplicate PNs in this file (last row wins)</span><ul>');
            preview.duplicates.slice(0, 12).forEach(function (duplicate) {
                parts.push('<li>Row ' + MRS.utils.escapeHtml(duplicate.row) + ': ' + MRS.utils.escapeHtml(duplicate.pn) + ' - ' + MRS.utils.escapeHtml(duplicate.message) + '</li>');
            });
            if (preview.duplicates.length > 12) parts.push('<li>...and ' + (preview.duplicates.length - 12) + ' more.</li>');
            parts.push('</ul></div>');
        }
        importErrorList(preview.errors, 'Errors').forEach(function (part) { parts.push(part); });
        importErrorList(preview.warnings, 'Notes').forEach(function (part) { parts.push(part); });
        parts.push('<div class="import-confirm-note">' + (preview.canApply
            ? 'No catalog changes have been written yet. Confirm to apply the ' + preview.validCount + ' valid row' + (preview.validCount === 1 ? '' : 's') + '.'
            : 'Nothing can be imported until the errors are fixed.') + '</div>');
        box.classList.remove('hidden');
        box.classList.toggle('has-errors', preview.invalidCount > 0);
        box.innerHTML = parts.join('');
    }

    function showImportResult(result) {
        var box = MRS.utils.$('importResult');
        if (!box) return;
        var parts = [];
        parts.push('<strong>Import complete</strong>');
        parts.push('<div class="import-counts">' +
            '<span class="import-count is-valid"><strong>' + result.added + '</strong><small>Added</small></span>' +
            '<span class="import-count is-duplicate"><strong>' + result.updated + '</strong><small>Updated</small></span>' +
            '<span class="import-count is-error"><strong>' + result.skipped + '</strong><small>Skipped</small></span>' +
            '</div>');
        if (result.duplicateCount) parts.push('<div class="import-breakdown">' + result.duplicateCount + ' duplicate PN row' + (result.duplicateCount === 1 ? '' : 's') + ' collapsed using the last row.</div>');
        if (result.positional) parts.push('<div class="import-breakdown">Headers were not recognized; positional columns were used.</div>');
        importErrorList(result.errors, 'Skipped rows').forEach(function (part) { parts.push(part); });
        parts.push('<div class="import-confirm-note">The catalog has been updated. Export CSV always includes the full active catalog.</div>');
        box.classList.remove('hidden');
        box.classList.toggle('has-errors', !!(result.errors && result.errors.length));
        box.innerHTML = parts.join('');
    }

    function submitImport() {
        if (!MRS.auth.requireRole('LOGISTICS')) return;
        var errorBox = MRS.utils.$('importError');
        if (errorBox) errorBox.textContent = '';
        var text = MRS.utils.$('importText').value.trim();
        var input = MRS.utils.$('importFile');

        if (importState.reviewed) {
            var current = text || importState.content;
            if (!current || current !== importState.content) {
                resetImportReview();
                if (errorBox) errorBox.textContent = 'The CSV changed after the preview. Preview it again before importing.';
                return;
            }
            var result = MRS.catalog.importCSV(current);
            showImportResult(result);
            importState.reviewed = false;
            importState.content = '';
            importState.applied = result.ok;
            importButton('Preview again');
            if (result.added || result.updated) {
                MRS.utils.toast('Catalog imported: ' + result.added + ' added, ' + result.updated + ' updated.', 'success', 4200);
                render();
                if (MRS.views.admin) MRS.views.admin.renderStats();
            } else {
                MRS.utils.toast(result.error || 'No rows were imported.', 'warn');
            }
            return;
        }

        var ready = text
            ? Promise.resolve(text)
            : (input && input.files && input.files[0]
                ? MRS.utils.readFileAsText(input.files[0])
                : Promise.resolve(''));

        ready.then(function (content) {
            if (!String(content || '').trim()) {
                if (errorBox) errorBox.textContent = 'Choose a CSV file or paste CSV content.';
                return;
            }
            var preview = MRS.catalog.previewImport(content);
            importState.content = content;
            importState.reviewed = preview.canApply;
            showImportPreview(preview);
            importButton(preview.canApply ? 'Confirm import' : 'Preview import');
            if (preview.canApply) {
                MRS.utils.toast('Preview ready. Review the counts, then confirm.', 'info', 4000);
            } else {
                MRS.utils.toast(preview.error || 'No valid rows found.', 'warn');
            }
        }).catch(function () {
            if (errorBox) errorBox.textContent = 'Could not read the selected CSV file.';
        });
    }

    function onImportTextInput() {
        MRS.utils.setText('importError', '');
        resetImportReview();
    }

    function exportCatalog() {
        if (!MRS.auth.requireLogin()) return;
        var downloaded = MRS.catalog.exportCatalog();
        if (downloaded) MRS.utils.toast('Catalog CSV exported.', 'success');
        else MRS.utils.toast('CSV download is not available in this browser.', 'error');
    }

    MRS.views = MRS.views || {};
    MRS.views.catalog = {
        render: render,
        openAdd: openAdd,
        openEdit: openEdit,
        saveFromForm: saveFromForm,
        confirmDelete: confirmDelete,
        onSearchInput: onSearchInput,
        clearSearch: clearSearch,
        filterSubcategory: filterSubcategory,
        onPhotoFile: onPhotoFile,
        onPhotoUrlInput: onPhotoUrlInput,
        clearPhoto: clearPhoto,
        openImport: openImport,
        onImportFile: onImportFile,
        onImportTextInput: onImportTextInput,
        submitImport: submitImport,
        exportCatalog: exportCatalog
    };

}(window.MRS = window.MRS || {}));
