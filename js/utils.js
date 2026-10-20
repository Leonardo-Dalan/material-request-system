(function (MRS) {
    'use strict';

    function $(id) {
        return document.getElementById(id);
    }

    function $$(selector, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(selector));
    }

    function setText(id, value) {
        var element = $(id);
        if (element) element.textContent = value == null ? '' : String(value);
    }

    var HTML_ESCAPES = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;'
    };

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"'`]/g, function (character) {
            return HTML_ESCAPES[character];
        });
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function normalizeSearch(value) {
        var text = value == null ? '' : String(value);
        try {
            text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        } catch (error) {
            text = text.replace(/[^\x00-\x7f]/g, '');
        }
        return text.toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function uid(prefix) {
        return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e9).toString(36);
    }

    function deepClone(value) {
        if (value === null || typeof value !== 'object') return value;
        if (typeof window.structuredClone === 'function') {
            try {
                return window.structuredClone(value);
            } catch (error) {
                return JSON.parse(JSON.stringify(value));
            }
        }
        return JSON.parse(JSON.stringify(value));
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function debounce(fn, wait) {
        var timer = null;
        return function () {
            var context = this;
            var args = arguments;
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
                timer = null;
                fn.apply(context, args);
            }, wait);
        };
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function formatDate(timestamp) {
        if (!timestamp) return '--';
        var date = new Date(timestamp);
        if (isNaN(date.getTime())) return '--';
        return MONTHS[date.getMonth()] + ' ' + pad2(date.getDate()) + ', ' + date.getFullYear();
    }

    function formatDateTime(timestamp) {
        if (!timestamp) return '--';
        var date = new Date(timestamp);
        if (isNaN(date.getTime())) return '--';
        return formatDate(timestamp) + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    }

    function formatClock(timestamp) {
        var date = timestamp ? new Date(timestamp) : new Date();
        if (isNaN(date.getTime())) return '--:--';
        return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    }

    function formatRelative(timestamp) {
        var diff = Date.now() - Number(timestamp || 0);
        if (!isFinite(diff) || diff < 0) diff = 0;
        var minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return minutes + 'm ago';
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        var days = Math.floor(hours / 24);
        if (days < 7) return days + 'd ago';
        return formatDate(timestamp);
    }

    function formatDuration(milliseconds) {
        var ms = Math.max(0, Number(milliseconds) || 0);
        var minutes = Math.floor(ms / 60000);
        if (minutes < 1) return '<1 min';
        if (minutes < 60) return minutes + ' min';
        var hours = Math.floor(minutes / 60);
        var rest = minutes % 60;
        if (hours < 24) return hours + 'h ' + pad2(rest) + 'm';
        var days = Math.floor(hours / 24);
        return days + 'd ' + (hours % 24) + 'h';
    }

    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '--';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    function safeImageUrl(value) {
        var url = String(value || '').trim();
        if (!url) return '';
        if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);/i.test(url)) return url;
        if (/^https?:\/\//i.test(url)) return url;
        if (/^blob:/i.test(url)) return url;
        return '';
    }

    function csvCell(value, delimiter) {
        var text = value == null ? '' : String(value);
        if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
    }

    function detectDelimiter(text) {
        var sample = String(text || '').slice(0, 5000);
        var counts = { ',': 0, ';': 0, '\t': 0 };
        var quoted = false;
        for (var i = 0; i < sample.length; i++) {
            var character = sample.charAt(i);
            if (character === '"') {
                if (quoted && sample.charAt(i + 1) === '"') {
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (!quoted && (character === ',' || character === ';' || character === '\t')) {
                counts[character]++;
            }
        }
        var best = ',';
        if (counts[';'] > counts[best]) best = ';';
        if (counts['\t'] > counts[best]) best = '\t';
        return best;
    }

    function parseCSV(text, delimiter) {
        var source = String(text == null ? '' : text).replace(/^\uFEFF/, '');
        if (!source.trim()) return [];
        var sep = delimiter || detectDelimiter(source);
        var rows = [];
        var row = [];
        var field = '';
        var quoted = false;

        for (var i = 0; i < source.length; i++) {
            var character = source.charAt(i);

            if (quoted) {
                if (character === '"') {
                    if (source.charAt(i + 1) === '"') {
                        field += '"';
                        i++;
                    } else {
                        quoted = false;
                    }
                } else {
                    field += character;
                }
                continue;
            }

            if (character === '"' && field === '') {
                quoted = true;
            } else if (character === sep) {
                row.push(field);
                field = '';
            } else if (character === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            } else if (character === '\r') {
                if (source.charAt(i + 1) === '\n') i++;
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            } else {
                field += character;
            }
        }

        row.push(field);
        rows.push(row);

        return rows.filter(function (line) {
            return line.some(function (cell) { return String(cell).trim() !== ''; });
        });
    }

    function toCSV(rows, delimiter) {
        var sep = delimiter || ';';
        return rows.map(function (row) {
            return row.map(function (cell) { return csvCell(cell, sep); }).join(sep);
        }).join('\r\n');
    }

    function downloadBlob(filename, blob) {
        if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
            return false;
        }
        if (!(blob instanceof Blob)) return false;
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        return true;
    }

    function downloadText(filename, content, mime) {
        if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
            return false;
        }
        var type = mime || 'text/plain;charset=utf-8';
        var payload = /^text\/csv/i.test(type) ? '\uFEFF' + content : content;
        return downloadBlob(filename, new Blob([payload], { type: type }));
    }

    var toastCounter = 0;

    function toast(message, kind, duration) {
        var host = $('toastContainer');
        if (!host) {
            if (window.console && console.log) console.log(message);
            return;
        }
        var element = document.createElement('div');
        element.className = 'toast' + (kind ? ' toast-' + kind : '');
        element.setAttribute('data-toast', String(++toastCounter));
        element.textContent = String(message);
        host.appendChild(element);
        var ms = duration || (MRS.config && MRS.config.TECH ? MRS.config.TECH.toastMs : 3200);
        setTimeout(function () {
            element.classList.add('is-leaving');
            setTimeout(function () {
                if (element.parentNode) element.parentNode.removeChild(element);
            }, 220);
        }, ms);
    }

    function openModal(id) {
        var element = $(id);
        if (!element) return;
        element.classList.add('open');
        element.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        var focusable = element.querySelector('input:not([type="hidden"]):not([disabled]), select, textarea, button:not([disabled])');
        if (focusable) {
            setTimeout(function () {
                try { focusable.focus(); } catch (error) { /* ignore */ }
            }, 40);
        }
    }

    function closeModal(id) {
        var element = $(id);
        if (!element) return;
        element.classList.remove('open');
        element.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal-backdrop.open')) {
            document.body.classList.remove('modal-open');
        }
    }

    function closeAllModals() {
        $$('.modal-backdrop.open').forEach(function (element) {
            element.classList.remove('open');
            element.setAttribute('aria-hidden', 'true');
        });
        document.body.classList.remove('modal-open');
    }

    function isAnyModalOpen() {
        return !!document.querySelector('.modal-backdrop.open');
    }

    function readFileAsText(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { reject(reader.error || new Error('File read failed')); };
            reader.readAsText(file, 'utf-8');
        });
    }

    function readFileAsDataURL(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { reject(reader.error || new Error('File read failed')); };
            reader.readAsDataURL(file);
        });
    }

    function formatBytes(bytes) {
        var value = Number(bytes) || 0;
        if (value < 1024) return value + ' B';
        if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
        return (value / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function unique(values) {
        var seen = {};
        return values.filter(function (value) {
            var key = String(value);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }

    MRS.utils = {
        $: $,
        $$: $$,
        setText: setText,
        escapeHtml: escapeHtml,
        escapeAttr: escapeAttr,
        normalizeSearch: normalizeSearch,
        uid: uid,
        deepClone: deepClone,
        clamp: clamp,
        debounce: debounce,
        pad2: pad2,
        formatDate: formatDate,
        formatDateTime: formatDateTime,
        formatClock: formatClock,
        formatRelative: formatRelative,
        formatDuration: formatDuration,
        initials: initials,
        safeImageUrl: safeImageUrl,
        csvCell: csvCell,
        detectDelimiter: detectDelimiter,
        parseCSV: parseCSV,
        toCSV: toCSV,
        downloadBlob: downloadBlob,
        downloadText: downloadText,
        toast: toast,
        openModal: openModal,
        closeModal: closeModal,
        closeAllModals: closeAllModals,
        isAnyModalOpen: isAnyModalOpen,
        readFileAsText: readFileAsText,
        readFileAsDataURL: readFileAsDataURL,
        formatBytes: formatBytes,
        unique: unique
    };

}(window.MRS = window.MRS || {}));
