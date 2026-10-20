(function (MRS) {
    'use strict';

    var CATALOG_HEADERS = ['PN', 'Name', 'Subcategory', 'Unit', 'Stock Location'];
    var REQUEST_HEADERS = [
        'Request ID', 'Created date/time', 'Requester', 'Requesting area',
        'Item PN', 'Item name', 'Quantity', 'Unit', 'Drop-off', 'Job number',
        'Urgency', 'Status', 'Started by', 'Started at', 'Fulfilled by',
        'Fulfilled at', 'Rejected by', 'Rejection reason', 'Rejection note', 'Lead time'
    ];
    var STOCK_HEADERS = [
        'Date/time', 'Item PN', 'Item name', 'Type', 'Quantity', 'Unit',
        'Balance after', 'Performed by', 'Reference', 'Note'
    ];

    function library() {
        return window.XLSX || null;
    }

    function excelDate(timestamp) {
        var value = Number(timestamp) || 0;
        return value > 0 ? new Date(value) : '';
    }

    function leadTime(request) {
        if (request.status !== 'DONE') return '';
        return MRS.utils.formatDuration(MRS.reports.fulfillmentMs(request));
    }

    function catalogRows() {
        var rows = [CATALOG_HEADERS.slice()];
        MRS.catalog.activeItems().slice().sort(function (a, b) {
            return String(a.pn).localeCompare(String(b.pn));
        }).forEach(function (item) {
            rows.push([
                item.pn || '',
                item.name || '',
                item.subcategory || '',
                item.unit || '',
                item.stockLocation || ''
            ]);
        });
        return rows;
    }

    function requestRows() {
        var rows = [REQUEST_HEADERS.slice()];
        MRS.requests.all().slice().sort(function (a, b) {
            return Number(b.createdAt || 0) - Number(a.createdAt || 0);
        }).forEach(function (request) {
            var done = request.status === 'DONE';
            var rejected = request.status === 'REJECTED';
            rows.push([
                request.requestNumber || request.id || '',
                excelDate(request.createdAt),
                request.requesterName || '',
                request.requestingArea || '',
                request.itemPn || '',
                request.itemName || '',
                Number(request.quantity) || 0,
                request.unit || '',
                request.dropOff || '',
                request.jobNumber || '',
                MRS.requests.urgencyLabel(request.urgency),
                MRS.requests.statusLabel(request.status),
                request.startedByName || '',
                excelDate(request.startedAt),
                done ? (request.handledByName || '') : '',
                done ? excelDate(request.completedAt) : '',
                rejected ? (request.handledByName || '') : '',
                rejected ? (request.rejectionReason || '') : '',
                rejected ? (request.rejectionNote || '') : '',
                leadTime(request)
            ]);
        });
        return rows;
    }

    function stockRows() {
        if (MRS.movements) MRS.movements.ensureFromRequests();
        var movements = MRS.movements.all().slice().sort(function (a, b) {
            var delta = Number(a.createdAt || 0) - Number(b.createdAt || 0);
            if (delta !== 0) return delta;
            return String(a.id || '').localeCompare(String(b.id || ''));
        });
        var balances = {};
        var rows = [STOCK_HEADERS.slice()];
        movements.forEach(function (movement) {
            var key = movement.itemId || movement.itemPn || movement.id;
            var quantity = Number(movement.quantity) || 0;
            var signed = movement.type === 'IN' ? quantity : -quantity;
            var balance = (balances[key] || 0) + signed;
            balances[key] = balance;
            rows.push([
                excelDate(movement.createdAt),
                movement.itemPn || '',
                movement.itemName || '',
                MRS.movements.typeLabel(movement.type),
                quantity,
                movement.unit || '',
                balance,
                movement.actorName || '',
                movement.reference || movement.sourceRequestNumber || '',
                movement.note || ''
            ]);
        });
        return rows;
    }

    function configureSheet(sheet, rows, widths, dateColumns) {
        sheet['!cols'] = widths.map(function (width) { return { wch: width }; });
        if (rows.length > 1) {
            sheet['!autofilter'] = {
                ref: library().utils.encode_range({
                    s: { r: 0, c: 0 },
                    e: { r: rows.length - 1, c: rows[0].length - 1 }
                })
            };
        }
        dateColumns.forEach(function (column) {
            for (var row = 1; row < rows.length; row++) {
                var address = library().utils.encode_cell({ r: row, c: column });
                var cell = sheet[address];
                if (cell && cell.t === 'd') cell.z = 'yyyy-mm-dd hh:mm';
            }
        });
        sheet['!rows'] = [{ hpt: 20 }];
        return sheet;
    }

    function buildWorkbook() {
        var XLSX = library();
        if (!XLSX) throw new Error('The local Excel library is not available.');
        var workbook = XLSX.utils.book_new();
        var catalogData = catalogRows();
        var requestData = requestRows();
        var stockData = stockRows();
        var catalog = XLSX.utils.aoa_to_sheet(catalogData, { cellDates: true });
        var requests = XLSX.utils.aoa_to_sheet(requestData, { cellDates: true });
        var stock = XLSX.utils.aoa_to_sheet(stockData, { cellDates: true });
        configureSheet(catalog, catalogData, [18, 44, 18, 10, 16], []);
        configureSheet(requests, requestData, [17, 20, 21, 19, 17, 38, 10, 8, 22, 16, 10, 12, 20, 20, 20, 20, 19, 38, 40, 14], [1, 13, 15]);
        configureSheet(stock, stockData, [20, 17, 38, 11, 10, 8, 14, 20, 18, 34], [0]);
        XLSX.utils.book_append_sheet(workbook, catalog, 'Catalog');
        XLSX.utils.book_append_sheet(workbook, requests, 'Requests');
        XLSX.utils.book_append_sheet(workbook, stock, 'Stock Movements');
        return workbook;
    }

    function buildArrayBuffer() {
        var XLSX = library();
        if (!XLSX) throw new Error('The local Excel library is not available.');
        return XLSX.write(buildWorkbook(), {
            bookType: 'xlsx',
            type: 'array',
            compression: true,
            cellDates: true
        });
    }

    function fileName() {
        return 'material-request-data-' + new Date().toISOString().slice(0, 10) + '.xlsx';
    }

    function exportXlsx() {
        if (!MRS.currentUser || !MRS.auth.hasRole('LOGISTICS')) {
            return { ok: false, error: 'Permission denied.' };
        }
        try {
            var data = buildArrayBuffer();
            var type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            var blob = new Blob([data], { type: type });
            var name = fileName();
            var downloaded = MRS.utils.downloadBlob(name, blob);
            if (!downloaded) return { ok: false, error: 'Excel download is not available in this browser.' };
            return { ok: true, filename: name };
        } catch (error) {
            return { ok: false, error: error && error.message ? error.message : 'Could not build the Excel workbook.' };
        }
    }

    MRS.exporter = {
        CATALOG_HEADERS: CATALOG_HEADERS,
        REQUEST_HEADERS: REQUEST_HEADERS,
        STOCK_HEADERS: STOCK_HEADERS,
        catalogRows: catalogRows,
        requestRows: requestRows,
        stockRows: stockRows,
        buildWorkbook: buildWorkbook,
        buildArrayBuffer: buildArrayBuffer,
        exportXlsx: exportXlsx
    };

}(window.MRS = window.MRS || {}));
