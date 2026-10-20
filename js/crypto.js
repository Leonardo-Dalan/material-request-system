(function (MRS) {
    'use strict';

    var K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    function rotr(value, bits) {
        return (value >>> bits) | (value << (32 - bits));
    }

    function toHex8(value) {
        return ('00000000' + (value >>> 0).toString(16)).slice(-8);
    }

    function utf8Bytes(value) {
        var out = [];
        for (var i = 0; i < value.length; i++) {
            var code = value.charCodeAt(i);

            if (code < 0x80) {
                out.push(code);
            } else if (code < 0x800) {
                out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
                var next = value.charCodeAt(i + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    var point = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                    out.push(
                        0xf0 | (point >> 18),
                        0x80 | ((point >> 12) & 0x3f),
                        0x80 | ((point >> 6) & 0x3f),
                        0x80 | (point & 0x3f)
                    );
                    i++;
                } else {
                    out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
                }
            } else {
                out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
            }
        }
        return out;
    }

    function sha256Hex(message) {
        var H = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ];
        var bytes = utf8Bytes(String(message));
        var bitLength = bytes.length * 8;

        bytes.push(0x80);
        while (bytes.length % 64 !== 56) bytes.push(0x00);

        var high = Math.floor(bitLength / 4294967296);
        var low = bitLength >>> 0;
        bytes.push(
            (high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff,
            (low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff
        );

        var w = new Array(64);

        for (var offset = 0; offset < bytes.length; offset += 64) {
            var i;
            for (i = 0; i < 16; i++) {
                var position = offset + i * 4;
                w[i] = (bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) | bytes[position + 3];
            }
            for (i = 16; i < 64; i++) {
                var x = w[i - 15];
                var y = w[i - 2];
                var s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
                var s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }

            var a = H[0], b = H[1], c = H[2], d = H[3];
            var e = H[4], f = H[5], g = H[6], h = H[7];

            for (i = 0; i < 64; i++) {
                var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                var choice = (e & f) ^ (~e & g);
                var temp1 = (h + S1 + choice + K[i] + w[i]) | 0;
                var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                var majority = (a & b) ^ (a & c) ^ (b & c);
                var temp2 = (S0 + majority) | 0;

                h = g;
                g = f;
                f = e;
                e = (d + temp1) | 0;
                d = c;
                c = b;
                b = a;
                a = (temp1 + temp2) | 0;
            }

            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
            H[5] = (H[5] + f) | 0;
            H[6] = (H[6] + g) | 0;
            H[7] = (H[7] + h) | 0;
        }

        var out = '';
        for (var j = 0; j < 8; j++) out += toHex8(H[j]);
        return out;
    }

    function randomSaltHex() {
        try {
            var buffer = new Uint8Array(16);
            window.crypto.getRandomValues(buffer);
            var hex = '';
            for (var i = 0; i < buffer.length; i++) hex += toHex8(buffer[i]).slice(-2);
            return hex;
        } catch (error) {
            var fallback = '';
            for (var j = 0; j < 32; j++) fallback += Math.floor(Math.random() * 16).toString(16);
            return fallback;
        }
    }

    function safeEqual(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') return false;
        if (a.length !== b.length) return false;
        var diff = 0;
        for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return diff === 0;
    }

    function hashPassword(username, password) {
        var salt = randomSaltHex();
        return {
            username: username,
            salt: salt,
            hash: sha256Hex(salt + ':' + password)
        };
    }

    function hashWithSalt(salt, password) {
        return sha256Hex(String(salt) + ':' + String(password));
    }

    function verifyPassword(record, password) {
        if (!record) return false;
        if (record.salt && record.hash) {
            return safeEqual(record.hash, hashWithSalt(record.salt, password));
        }
        if (typeof record.pass === 'string') {
            var ok = record.pass === password;
            if (ok) {
                var salt = randomSaltHex();
                record.salt = salt;
                record.hash = sha256Hex(salt + ':' + password);
                delete record.pass;
            }
            return ok;
        }
        return false;
    }

    function hasPlaintextPassword(record) {
        return !!(record && typeof record.pass === 'string' && !record.hash);
    }

    MRS.crypto = {
        sha256Hex: sha256Hex,
        randomSaltHex: randomSaltHex,
        hashPassword: hashPassword,
        hashWithSalt: hashWithSalt,
        verifyPassword: verifyPassword,
        hasPlaintextPassword: hasPlaintextPassword
    };

}(window.MRS = window.MRS || {}));
