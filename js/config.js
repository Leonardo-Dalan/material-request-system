(function (MRS) {
    'use strict';

    var now = Date.now();

    MRS.config = Object.freeze({
        STORAGE_KEY: 'MRS_MATERIAL_REQUEST_V1',
        SESSION_KEY: 'MRS_SESSION_V1',
        FIREBASE_URL_KEY: 'MRS_FIREBASE_URL_V1',
        FIREBASE_ROOT_PATH: 'material_request_state',
        BROADCAST_CHANNEL: 'mrs_material_request_channel_v1',
        APP_VERSION: '1.0.0',
        UNITS: ['pc', 'roll', 'm', 'kg', 'sheet', 'kit', 'box', 'set', 'L'],
        ROLES: ['REQUESTER', 'LOGISTICS', 'ADMIN'],
        TECH: Object.freeze({
            cloudPollMs: 5000,
            pushDebounceMs: 700,
            toastMs: 3200,
            maxPhotoBytes: 1536 * 1024,
            maxRequestQuantity: 1000000,
            searchDebounceMs: 140,
            catalogPhotoLimit: 0
        })
    });

    MRS.ROLE_RANK = Object.freeze({ REQUESTER: 1, LOGISTICS: 2, ADMIN: 3 });

    MRS.ROLE_LABELS = Object.freeze({
        REQUESTER: 'Requester',
        LOGISTICS: 'Logistics',
        ADMIN: 'Admin'
    });

    MRS.DEFAULT_DROP_OFF_LOCATIONS = Object.freeze([
        'Production Line 1',
        'Production Line 2',
        'Production Line 3',
        'Maintenance Workshop',
        'Quality Lab',
        'Warehouse Counter'
    ]);

    MRS.DEFAULT_REQUESTING_AREAS = Object.freeze([
        'Production',
        'Maintenance',
        'Quality',
        'Engineering',
        'Warehouse',
        'Facilities'
    ]);

    MRS.SUBCATEGORY_ACCENTS = Object.freeze({
        'Tapes': '#06b6d4',
        'Insulation': '#f59e0b',
        'Wire & Cable': '#fb923c',
        'Terminals': '#10b981',
        'Fasteners': '#94a3b8',
        'Protection': '#8b5cf6',
        'Adhesives': '#ef4444',
        'Labels': '#eab308'
    });

    MRS.defaultSettings = function () {
        return {
            requestNumberPrefix: 'MR',
            dropOffLocations: MRS.DEFAULT_DROP_OFF_LOCATIONS.slice(),
            requestingAreas: MRS.DEFAULT_REQUESTING_AREAS.slice(),
            defaultUrgency: 'NORMAL'
        };
    };

    MRS.normalizeSettings = function (raw) {
        var defaults = MRS.defaultSettings();
        if (!raw || typeof raw !== 'object') return defaults;

        var out = defaults;
        if (typeof raw.requestNumberPrefix === 'string' && raw.requestNumberPrefix.trim()) {
            out.requestNumberPrefix = raw.requestNumberPrefix.trim().toUpperCase().slice(0, 8);
        }
        if (Array.isArray(raw.dropOffLocations)) {
            var locations = raw.dropOffLocations
                .filter(function (value) { return typeof value === 'string' && value.trim(); })
                .map(function (value) { return value.trim(); });
            if (locations.length) out.dropOffLocations = locations;
        }
        if (Array.isArray(raw.requestingAreas)) {
            var areas = raw.requestingAreas
                .filter(function (value) { return typeof value === 'string' && value.trim(); })
                .map(function (value) { return value.trim(); });
            if (areas.length) out.requestingAreas = areas;
        }
        if (raw.defaultUrgency === 'NORMAL' || raw.defaultUrgency === 'URGENT') {
            out.defaultUrgency = raw.defaultUrgency;
        }
        return out;
    };

    function escapeXml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function artForKind(kind, accent) {
        var a = accent;
        var art = '';

        if (kind === 'tape') {
            art =
                '<g transform="translate(320 195)">' +
                '<circle r="78" fill="#0a1018" stroke="' + a + '" stroke-width="2"/>' +
                '<circle r="55" fill="none" stroke="' + a + '" stroke-opacity=".55" stroke-width="2"/>' +
                '<circle r="24" fill="#071018" stroke="' + a + '" stroke-width="2"/>' +
                '<path d="M-78 0h156" stroke="' + a + '" stroke-opacity=".25" stroke-width="1"/>' +
                '<path d="M55 -55 112 -92" stroke="' + a + '" stroke-width="2" stroke-linecap="round"/>' +
                '</g>';
        } else if (kind === 'insulation') {
            art =
                '<g transform="translate(320 195)">' +
                '<path d="M-104 35 44-55l76 18-148 90z" fill="#0a1018" stroke="' + a + '" stroke-width="2"/>' +
                '<path d="M-104 18 44-72l76 18-148 90z" fill="#0d1724" stroke="' + a + '" stroke-opacity=".7" stroke-width="2"/>' +
                '<path d="M-104 1 44-89l76 18-148 90z" fill="#0f1d2c" stroke="' + a + '" stroke-opacity=".45" stroke-width="2"/>' +
                '<path d="M-50-27 98-117" stroke="' + a + '" stroke-opacity=".3" stroke-width="1"/>' +
                '</g>';
        } else if (kind === 'wire') {
            art =
                '<g transform="translate(320 195)">' +
                '<ellipse rx="86" ry="55" fill="none" stroke="' + a + '" stroke-width="2"/>' +
                '<ellipse rx="66" ry="41" fill="none" stroke="' + a + '" stroke-opacity=".7" stroke-width="2"/>' +
                '<ellipse rx="46" ry="28" fill="none" stroke="' + a + '" stroke-opacity=".5" stroke-width="2"/>' +
                '<ellipse rx="24" ry="14" fill="#0a1018" stroke="' + a + '" stroke-width="2"/>' +
                '<path d="M86 0h65c14 0 14 20 0 20h-20" fill="none" stroke="' + a + '" stroke-width="2" stroke-linecap="round"/>' +
                '</g>';
        } else if (kind === 'terminal') {
            art =
                '<g transform="translate(320 195)">' +
                '<circle cx="-35" r="45" fill="#0a1018" stroke="' + a + '" stroke-width="2"/>' +
                '<circle cx="-35" r="20" fill="#071018" stroke="' + a + '" stroke-width="2"/>' +
                '<path d="M-10-45h100c18 0 18 90 0 90H-10" fill="none" stroke="' + a + '" stroke-width="2"/>' +
                '<path d="M35-24h48M35 0h48M35 24h48" stroke="' + a + '" stroke-opacity=".45" stroke-width="1"/>' +
                '</g>';
        } else if (kind === 'fastener') {
            art =
                '<g transform="translate(320 195) rotate(-20)">' +
                '<path d="M-95-21h152l32 21-32 21H-95z" fill="#0a1018" stroke="' + a + '" stroke-width="2"/>' +
                '<path d="M-95-21v42M-62-21v42M-29-21v42M4-21v42M37-21v42" stroke="' + a + '" stroke-opacity=".55" stroke-width="2"/>' +
                '<circle cx="-95" cy="0" r="34" fill="#0d1724" stroke="' + a + '" stroke-width="2"/>' +
                '<circle cx="-95" cy="0" r="16" fill="#071018" stroke="' + a + '" stroke-width="2"/>' +
                '</g>';
        } else if (kind === 'protection') {
            art =
                '<g transform="translate(320 195)">' +
                '<path d="M-105-50c0 34 210 34 210 0M-105-18c0 34 210 34 210 0M-105 14c0 34 210 34 210 0M-105 46c0 34 210 34 210 0" fill="none" stroke="' + a + '" stroke-width="2"/>' +
                '<path d="M-88-57v118M88-57v118" stroke="' + a + '" stroke-opacity=".4" stroke-width="1"/>' +
                '</g>';
        } else if (kind === 'adhesive') {
            art =
                '<g transform="translate(320 195)">' +
                '<path d="M-38-89h76v28l14 22v96a12 12 0 0 1-12 12h-80a12 12 0 0 1-12-12V-39l14-22z" fill="#0a1018" stroke="' + a + '" stroke-width="2"/>' +
                '<path d="M-38-89h76" stroke="' + a + '" stroke-width="2"/>' +
                '<path d="M-52-13h104v44H-52z" fill="#0d1724" stroke="' + a + '" stroke-opacity=".7" stroke-width="2"/>' +
                '<path d="M-26-89V-126h52v37" fill="none" stroke="' + a + '" stroke-opacity=".55" stroke-width="2"/>' +
                '</g>';
        } else {
            art =
                '<g transform="translate(320 195)">' +
                '<path d="M-104-52h128l80 52-80 52H-104z" fill="#0a1018" stroke="' + a + '" stroke-width="2"/>' +
                '<circle cx="-82" cy="-33" r="7" fill="none" stroke="' + a + '" stroke-width="2"/>' +
                '<path d="M-66-33h68M-66-12h48M-66 9h58" stroke="' + a + '" stroke-opacity=".65" stroke-width="2" stroke-linecap="round"/>' +
                '</g>';
        }

        return art;
    }

    MRS.photoDataUri = function (kind, category, code, accent) {
        var safeAccent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#06b6d4';
        var svg =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">' +
            '<defs>' +
            '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="#12202f"/>' +
            '<stop offset=".58" stop-color="#0b141f"/>' +
            '<stop offset="1" stop-color="#080d14"/>' +
            '</linearGradient>' +
            '<radialGradient id="glow" cx=".5" cy=".48" r=".55">' +
            '<stop offset="0" stop-color="' + safeAccent + '" stop-opacity=".17"/>' +
            '<stop offset="1" stop-color="' + safeAccent + '" stop-opacity="0"/>' +
            '</radialGradient>' +
            '</defs>' +
            '<rect width="640" height="400" fill="url(#bg)"/>' +
            '<rect width="640" height="400" fill="url(#glow)"/>' +
            '<g opacity=".12" stroke="#8fa1b7">' +
            '<path d="M0 100h640M0 200h640M0 300h640"/>' +
            '<path d="M100 0v400M200 0v400M300 0v400M400 0v400M500 0v400"/>' +
            '</g>' +
            '<path d="M24 62V24h38M578 24h38v38M616 338v38h-38M62 376H24v-38" fill="none" stroke="' + safeAccent + '" stroke-opacity=".5" stroke-width="1.5"/>' +
            artForKind(kind, safeAccent) +
            '<text x="28" y="368" fill="' + safeAccent + '" font-family="Consolas,monospace" font-size="11" letter-spacing="2.4">' + escapeXml(String(category).toUpperCase()) + '</text>' +
            '<text x="612" y="368" text-anchor="end" fill="#60748c" font-family="Consolas,monospace" font-size="10" letter-spacing="1.6">' + escapeXml(code) + '</text>' +
            '<text x="28" y="43" fill="#60748c" font-family="Consolas,monospace" font-size="9" letter-spacing="2.2">MATERIAL REFERENCE</text>' +
            '</svg>';

        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };

    function seedItem(index, pn, name, subcategory, location, unit, kind) {
        var accent = MRS.SUBCATEGORY_ACCENTS[subcategory] || '#06b6d4';
        return {
            id: 'it-' + String(index + 1).padStart(3, '0'),
            pn: pn,
            name: name,
            subcategory: subcategory,
            stockLocation: location,
            unit: unit,
            photo: MRS.photoDataUri(kind, subcategory, pn, accent),
            accent: accent,
            active: true,
            deleted: false,
            createdAt: now - index * 1000,
            updatedAt: now - index * 1000
        };
    }

    MRS.seedItems = function () {
        return [
            seedItem(0, 'TAPE-3M-33', 'PVC Electrical Tape 19 mm x 20 m', 'Tapes', 'A-01-02', 'roll', 'tape'),
            seedItem(1, 'TAPE-3M-69', 'Glass Cloth Tape 25 mm x 33 m', 'Tapes', 'A-01-03', 'roll', 'tape'),
            seedItem(2, 'TAPE-KAP-25', 'Kapton Tape 25 mm x 33 m', 'Tapes', 'A-01-04', 'roll', 'tape'),
            seedItem(3, 'TAPE-ALU-50', 'Aluminum Foil Tape 50 mm x 45 m', 'Tapes', 'A-01-05', 'roll', 'tape'),
            seedItem(4, 'INS-NOMEX-025', 'Nomex Insulation Paper 0.25 mm', 'Insulation', 'B-02-01', 'sheet', 'insulation'),
            seedItem(5, 'INS-MYLAR-035', 'Mylar Polyester Film 0.35 mm', 'Insulation', 'B-02-02', 'sheet', 'insulation'),
            seedItem(6, 'INS-HST-08', 'Heat Shrink Tubing 8 mm', 'Insulation', 'B-02-05', 'm', 'insulation'),
            seedItem(7, 'INS-HST-16', 'Heat Shrink Tubing 16 mm', 'Insulation', 'B-02-06', 'm', 'insulation'),
            seedItem(8, 'WIRE-CU-14', 'Copper Wire AWG 14', 'Wire & Cable', 'C-03-01', 'm', 'wire'),
            seedItem(9, 'WIRE-CU-10', 'Copper Wire AWG 10', 'Wire & Cable', 'C-03-02', 'm', 'wire'),
            seedItem(10, 'WIRE-GRN-06', 'Grounding Wire AWG 6 Green', 'Wire & Cable', 'C-03-03', 'm', 'wire'),
            seedItem(11, 'WIRE-FLEX-16', 'Flexible Wire AWG 16', 'Wire & Cable', 'C-03-04', 'm', 'wire'),
            seedItem(12, 'TERM-RING-M6', 'Ring Terminal M6 2.5 mm2', 'Terminals', 'D-04-01', 'pc', 'terminal'),
            seedItem(13, 'TERM-FERRULE-10', 'Wire Ferrule 1.0 mm2', 'Terminals', 'D-04-02', 'pc', 'terminal'),
            seedItem(14, 'TERM-SPADE-M5', 'Spade Terminal M5 4.0 mm2', 'Terminals', 'D-04-03', 'pc', 'terminal'),
            seedItem(15, 'FAST-BOLT-M8', 'Hex Bolt M8 x 40 Zinc', 'Fasteners', 'E-05-01', 'pc', 'fastener'),
            seedItem(16, 'FAST-NUT-M8', 'Hex Nut M8 Zinc', 'Fasteners', 'E-05-02', 'pc', 'fastener'),
            seedItem(17, 'FAST-WASH-M8', 'Flat Washer M8 Zinc', 'Fasteners', 'E-05-03', 'pc', 'fastener'),
            seedItem(18, 'PROT-SPIRAL-10', 'Spiral Wrap 10 mm', 'Protection', 'F-06-01', 'm', 'protection'),
            seedItem(19, 'PROT-CONDUIT-20', 'Flexible Conduit 20 mm', 'Protection', 'F-06-02', 'm', 'protection'),
            seedItem(20, 'ADH-EPOXY-500', 'Epoxy Potting Resin 500 g', 'Adhesives', 'G-07-01', 'kit', 'adhesive'),
            seedItem(21, 'LBL-HV-WARN', 'High Voltage Warning Label', 'Labels', 'H-08-01', 'sheet', 'label')
        ];
    };

    function buildUser(id, username, password, role, name) {
        var credentials = MRS.crypto.hashPassword(username, password);
        return {
            id: id,
            username: username,
            name: name,
            role: role,
            salt: credentials.salt,
            hash: credentials.hash,
            active: true,
            createdAt: now,
            updatedAt: now
        };
    }

    MRS.buildSeedUsers = function () {
        return [
            buildUser('u-requester', 'requester', 'requester123', 'REQUESTER', 'Demo Requester'),
            buildUser('u-logistics', 'logistics', 'logistics123', 'LOGISTICS', 'Demo Logistics'),
            buildUser('u-admin', 'admin', 'admin123', 'ADMIN', 'Demo Administrator')
        ];
    };

    MRS.createDefaultDB = function () {
        return {
            version: 1,
            updatedAt: Date.now(),
            settings: MRS.defaultSettings(),
            users: MRS.buildSeedUsers(),
            items: MRS.seedItems(),
            requests: [],
            movements: []
        };
    };

}(window.MRS = window.MRS || {}));
