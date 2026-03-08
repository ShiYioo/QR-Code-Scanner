// ==UserScript==
// @name         网页二维码识别器 (QR Code Scanner)
// @namespace    https://github.com/ShiYioo
// @version      2.0.0
// @description  识别网页上的二维码，支持截图框选扫描，自动扫描可在菜单中切换
// @author       ShiYi
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ── 只在顶层窗口运行 ──────────────────────────────────────────────
    if (window.self !== window.top) return;

    // ── 配置 ──────────────────────────────────────────────────────────
    const CONFIG = {
        get autoScan() { return GM_getValue('autoScan', false); },
        set autoScan(v) { GM_setValue('autoScan', v); },
        showFloatButton: true,
        scanDelay:    800,
        maxImageSize: 1024,
        minImageSize: 50,
    };

    // ── 样式注入 ───────────────────────────────────────────────────────
    const injectStyles = () => {
        const style = document.createElement('style');
        style.textContent = `
            .qr-scanner-float-btn {
                position: fixed;
                right: 20px;
                bottom: 20px;
                width: 60px;
                height: 60px;
                background: rgba(0, 122, 255, 0.95);
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border-radius: 18px;
                box-shadow: 0 8px 24px rgba(0,122,255,.25), 0 2px 8px rgba(0,0,0,.08);
                cursor: pointer;
                z-index: 2147483640;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all .35s cubic-bezier(.4,0,.2,1);
                border: .5px solid rgba(255,255,255,.2);
                outline: none;
                user-select: none;
                touch-action: none;
            }
            .qr-scanner-float-btn:hover {
                transform: scale(1.08) translateY(-2px);
                box-shadow: 0 12px 32px rgba(0,122,255,.35), 0 4px 12px rgba(0,0,0,.12);
                background: rgba(0,122,255,1);
            }
            .qr-scanner-float-btn.is-dragging {
                transform: scale(1.06);
                box-shadow: 0 16px 40px rgba(0,122,255,.4), 0 6px 16px rgba(0,0,0,.16);
                transition: box-shadow .2s, transform .2s;
                cursor: grabbing;
            }
            .qr-scanner-float-btn:active { transform: scale(0.96); transition: all .15s; }
            .qr-scanner-float-btn svg { width: 30px; height: 30px; fill: white; pointer-events: none; }

            .qr-screenshot-overlay {
                position: fixed; inset: 0;
                background: rgba(0,0,0,.45);
                z-index: 2147483645;
                cursor: crosshair;
                user-select: none;
            }
            .qr-selection-box {
                position: fixed;
                border: 2px solid #007aff;
                background: rgba(0,122,255,.08);
                z-index: 2147483646;
                pointer-events: none;
                box-shadow: 0 0 0 9999px rgba(0,0,0,.25), 0 0 20px rgba(0,122,255,.4), inset 0 0 0 1px rgba(255,255,255,.25);
            }
            .qr-screenshot-hint {
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%,-50%);
                background: rgba(28,28,30,.92);
                backdrop-filter: blur(40px) saturate(180%);
                -webkit-backdrop-filter: blur(40px) saturate(180%);
                color: white; padding: 20px 32px; border-radius: 16px;
                font-size: 18px; font-weight: 500; z-index: 2147483647;
                box-shadow: 0 12px 32px rgba(0,0,0,.3);
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
                pointer-events: none;
                animation: qrHintIn .3s ease;
                text-align: center;
            }
            .qr-screenshot-hint-sub { font-size: 14px; opacity: .7; margin-top: 8px; font-weight: 400; }
            @keyframes qrHintIn {
                from { opacity: 0; transform: translate(-50%,-50%) scale(.9); }
                to   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
            }

            .qr-result-modal {
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%,-50%);
                background: rgba(255,255,255,.94);
                backdrop-filter: blur(40px) saturate(180%);
                -webkit-backdrop-filter: blur(40px) saturate(180%);
                border-radius: 20px;
                box-shadow: 0 24px 72px rgba(0,0,0,.15), 0 0 0 .5px rgba(0,0,0,.06);
                padding: 28px; max-width: 520px; min-width: 340px;
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
                animation: qrModalIn .4s cubic-bezier(.25,.46,.45,.94);
            }
            @keyframes qrModalIn {
                from { opacity: 0; transform: translate(-50%,-48%) scale(.94); }
                to   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
            }
            .qr-result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .qr-result-title  { font-size: 22px; font-weight: 600; color: #1d1d1f; letter-spacing: -.02em; }
            .qr-result-close  {
                width: 32px; height: 32px; background: rgba(120,120,128,.12);
                border: none; border-radius: 50%; font-size: 20px; color: #8e8e93;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                transition: all .2s;
            }
            .qr-result-close:hover { background: rgba(120,120,128,.2); color: #1d1d1f; transform: scale(1.08); }
            .qr-result-content {
                background: rgba(242,242,247,.8);
                border-radius: 12px; padding: 18px; word-break: break-all;
                max-height: 320px; overflow-y: auto; margin-bottom: 20px;
                font-size: 15px; line-height: 1.6; color: #1d1d1f;
                box-shadow: inset 0 1px 3px rgba(0,0,0,.04);
            }
            .qr-result-content::-webkit-scrollbar { width: 6px; }
            .qr-result-content::-webkit-scrollbar-thumb { background: rgba(0,0,0,.15); border-radius: 3px; }
            .qr-result-actions { display: flex; gap: 12px; }
            .qr-btn {
                flex: 1; padding: 12px 20px; border: none; border-radius: 12px;
                font-size: 16px; font-weight: 600; cursor: pointer;
                transition: all .25s cubic-bezier(.4,0,.2,1);
            }
            .qr-btn-primary {
                background: linear-gradient(180deg,#007aff 0%,#0051d5 100%);
                color: white;
                box-shadow: 0 4px 16px rgba(0,122,255,.3);
            }
            .qr-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,122,255,.4); }
            .qr-btn-secondary { background: rgba(120,120,128,.12); color: #007aff; }
            .qr-btn-secondary:hover { background: rgba(120,120,128,.18); transform: translateY(-2px); }

            .qr-modal-overlay {
                position: fixed; inset: 0;
                background: rgba(0,0,0,.4);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 2147483646;
                animation: qrOverlayIn .3s;
            }
            @keyframes qrOverlayIn { from { opacity: 0; } to { opacity: 1; } }

            .qr-loading {
                display: inline-block; width: 22px; height: 22px;
                border: 2.5px solid rgba(255,255,255,.3);
                border-top-color: white; border-radius: 50%;
                animation: qrSpin .8s linear infinite;
            }
            @keyframes qrSpin { to { transform: rotate(360deg); } }

            .qr-toast {
                position: fixed; top: 80px; left: 50%;
                transform: translateX(-50%);
                background: rgba(28,28,30,.92);
                backdrop-filter: blur(40px) saturate(180%);
                -webkit-backdrop-filter: blur(40px) saturate(180%);
                color: white; padding: 14px 24px; border-radius: 16px;
                font-size: 15px; font-weight: 500; z-index: 2147483647;
                box-shadow: 0 12px 32px rgba(0,0,0,.3), 0 0 0 .5px rgba(255,255,255,.1);
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
                animation: qrToastIn .4s cubic-bezier(.25,.46,.45,.94);
                pointer-events: none;
            }
            @keyframes qrToastIn {
                from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                to   { opacity: 1; transform: translateX(-50%) translateY(0); }
            }

            .qr-code-detected {
                outline: 3px solid #34c759 !important;
                outline-offset: 3px; cursor: pointer;
                border-radius: 8px;
                box-shadow: 0 4px 16px rgba(52,199,89,.3);
                animation: qrPulse 2s ease-in-out infinite;
            }
            @keyframes qrPulse {
                0%,100% { box-shadow: 0 4px 16px rgba(52,199,89,.25); }
                50%      { box-shadow: 0 4px 24px rgba(52,199,89,.5); }
            }
        `;
        document.head.appendChild(style);
    };

    // ── QR 扫描器 ──────────────────────────────────────────────────────
    class QRScanner {
        constructor() {
            this.scannedElements = new WeakSet();
            this.detectedQRs    = new Map();
        }

        // ── 公开入口：扫描任意元素 ──────────────────────────────────────
        async scanElement(element) {
            try {
                if (element.tagName === 'IMG')    return await this._scanImg(element);
                if (element.tagName === 'CANVAS') return await this._scanCanvas(element);
                return null;
            } catch (err) {
                console.warn('[QR] scanElement 错误:', err);
                return null;
            }
        }

        // ── 扫描 <img>（含 data:URI base64 图片）──────────────────────
        async _scanImg(img) {
            if (!img.complete || img.naturalWidth === 0) {
                try { await this._waitLoad(img); } catch { return null; }
            }
            if (img.naturalWidth < CONFIG.minImageSize || img.naturalHeight < CONFIG.minImageSize) return null;

            const src = img.src || img.currentSrc || img.getAttribute('src') || '';

            // data:URI base64 图片 — 直接绘制无跨域限制
            if (src.startsWith('data:')) {
                return await this._decodeFromDataUrl(src);
            }

            // 优先尝试同源直接绘制
            const canvas = this._makeCanvas(img.naturalWidth, img.naturalHeight);
            const ctx    = canvas.getContext('2d');
            try {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                ctx.getImageData(0, 0, 1, 1); // 检测是否被污染
                return await this._decodeCanvas(canvas, ctx);
            } catch (_) {
                // 跨域图片 → 通过 GM_xmlhttpRequest 绕过
                return await this._scanImgViaBlobUrl(src, img.naturalWidth, img.naturalHeight);
            }
        }

        // ── 解码 data:URI 图片 ─────────────────────────────────────────
        _decodeFromDataUrl(dataUrl) {
            return new Promise((resolve) => {
                const tmpImg  = new Image();
                tmpImg.onload = async () => {
                    const canvas = this._makeCanvas(tmpImg.naturalWidth, tmpImg.naturalHeight);
                    const ctx    = canvas.getContext('2d');
                    ctx.drawImage(tmpImg, 0, 0, canvas.width, canvas.height);
                    resolve(await this._decodeCanvas(canvas, ctx));
                };
                tmpImg.onerror = () => resolve(null);
                tmpImg.src = dataUrl;
            });
        }

        // ── 用 GM_xmlhttpRequest 下载图片绕过跨域 ─────────────────────
        _scanImgViaBlobUrl(src, natW, natH) {
            return new Promise((resolve) => {
                if (!src) { resolve(null); return; }
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: src,
                    responseType: 'blob',
                    timeout: 10000,
                    onload: async (resp) => {
                        try {
                            const blobUrl = URL.createObjectURL(resp.response);
                            const tmpImg  = new Image();
                            tmpImg.onload = async () => {
                                URL.revokeObjectURL(blobUrl);
                                const canvas = this._makeCanvas(tmpImg.naturalWidth || natW, tmpImg.naturalHeight || natH);
                                const ctx    = canvas.getContext('2d');
                                ctx.drawImage(tmpImg, 0, 0, canvas.width, canvas.height);
                                resolve(await this._decodeCanvas(canvas, ctx));
                            };
                            tmpImg.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
                            tmpImg.src = blobUrl;
                        } catch { resolve(null); }
                    },
                    onerror:   () => resolve(null),
                    ontimeout: () => resolve(null),
                });
            });
        }

        // ── 扫描 <canvas>（宽松空白判断，最多重试 5 次）──────────────
        async _scanCanvas(sourceCanvas) {
            for (let attempt = 0; attempt < 5; attempt++) {
                if (attempt > 0) await this._delay(300 * attempt);
                try {
                    const w = sourceCanvas.width;
                    const h = sourceCanvas.height;
                    if (w < CONFIG.minImageSize || h < CONFIG.minImageSize) return null;

                    const canvas = this._makeCanvas(w, h);
                    const ctx    = canvas.getContext('2d');
                    ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);

                    // 宽松空白判断：只抽样少量像素，放宽阈值
                    const probe = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    if (attempt < 4 && this._isBlankImageData(probe, 0.98)) continue;

                    const result = await this._decodeCanvas(canvas, ctx);
                    if (result) return result;
                } catch (err) {
                    console.warn('[QR] Canvas 扫描出错:', err);
                    return null;
                }
            }
            return null;
        }

        // ── 判断 ImageData 是否为空白（threshold: 白/透明像素比例阈值）
        _isBlankImageData(imageData, threshold = 0.95) {
            const data = imageData.data;
            const total = data.length / 4;
            const step  = Math.max(1, Math.floor(total / 500));
            let blank   = 0;
            for (let i = 0; i < total; i += step) {
                const off = i * 4;
                const r = data[off], g = data[off+1], b = data[off+2], a = data[off+3];
                if (a < 10 || (r > 245 && g > 245 && b > 245)) blank++;
            }
            return (blank / Math.ceil(total / step)) > threshold;
        }

        // ── 核心解码：多策略顺序尝试 ──────────────────────────────────
        async _decodeCanvas(canvas, ctx) {
            // 策略 1：原图 + 反色
            let r = this._jsqr(ctx.getImageData(0, 0, canvas.width, canvas.height), 'attemptBoth');
            if (r) return r;

            // 策略 2：多尺度（放大 1.5×）
            r = await this._decodeScaled(canvas, 1.5);
            if (r) return r;

            // 策略 3：对比度增强
            r = this._jsqr(this._enhance(ctx.getImageData(0, 0, canvas.width, canvas.height), 'contrast'), 'attemptBoth');
            if (r) return r;

            // 策略 4：Otsu 自适应二值化
            r = this._jsqr(this._enhance(ctx.getImageData(0, 0, canvas.width, canvas.height), 'otsu'), 'dontInvert');
            if (r) return r;

            // 策略 5：锐化
            r = this._jsqr(this._enhance(ctx.getImageData(0, 0, canvas.width, canvas.height), 'sharpen'), 'attemptBoth');
            if (r) return r;

            return null;
        }

        // ── 放大后再解码 ───────────────────────────────────────────────
        async _decodeScaled(srcCanvas, scale) {
            const w      = Math.round(srcCanvas.width  * scale);
            const h      = Math.round(srcCanvas.height * scale);
            const scaled = this._makeCanvas(w, h);
            const sCtx   = scaled.getContext('2d');
            sCtx.imageSmoothingEnabled = true;
            sCtx.imageSmoothingQuality = 'high';
            sCtx.drawImage(srcCanvas, 0, 0, w, h);
            return this._jsqr(sCtx.getImageData(0, 0, w, h), 'attemptBoth');
        }

        // ── 图像增强工厂 ───────────────────────────────────────────────
        _enhance(imageData, mode) {
            const d = new Uint8ClampedArray(imageData.data);
            const w = imageData.width;
            const h = imageData.height;

            if (mode === 'contrast') {
                const f = 1.8;
                for (let i = 0; i < d.length; i += 4) {
                    d[i]   = Math.min(255, Math.max(0, (d[i]   - 128) * f + 128));
                    d[i+1] = Math.min(255, Math.max(0, (d[i+1] - 128) * f + 128));
                    d[i+2] = Math.min(255, Math.max(0, (d[i+2] - 128) * f + 128));
                }
            }

            if (mode === 'otsu') {
                const gray = new Uint8Array(w * h);
                for (let i = 0; i < d.length; i += 4)
                    gray[i >> 2] = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
                const hist = new Array(256).fill(0);
                for (const g of gray) hist[g]++;
                const total = w * h;
                let sum = 0;
                for (let i = 0; i < 256; i++) sum += i * hist[i];
                let sumB = 0, wB = 0, wF = 0, max = 0, threshold = 128;
                for (let t = 0; t < 256; t++) {
                    wB += hist[t]; if (!wB) continue;
                    wF = total - wB; if (!wF) break;
                    sumB += t * hist[t];
                    const mB = sumB / wB;
                    const mF = (sum - sumB) / wF;
                    const between = wB * wF * (mB - mF) ** 2;
                    if (between > max) { max = between; threshold = t; }
                }
                for (let i = 0; i < d.length; i += 4) {
                    const v = gray[i >> 2] > threshold ? 255 : 0;
                    d[i] = d[i+1] = d[i+2] = v;
                }
            }

            if (mode === 'sharpen') {
                const kernel = [0,-1,0,-1,5,-1,0,-1,0];
                const src    = new Uint8ClampedArray(d);
                for (let y = 1; y < h - 1; y++) {
                    for (let x = 1; x < w - 1; x++) {
                        for (let c = 0; c < 3; c++) {
                            let val = 0;
                            for (let ky = -1; ky <= 1; ky++)
                                for (let kx = -1; kx <= 1; kx++)
                                    val += src[((y+ky)*w+(x+kx))*4+c] * kernel[(ky+1)*3+(kx+1)];
                            d[(y*w+x)*4+c] = Math.min(255, Math.max(0, val));
                        }
                    }
                }
            }

            return new ImageData(d, w, h);
        }

        // ── 调用 jsQR ─────────────────────────────────────────────────
        _jsqr(imageData, inversionAttempts) {
            if (!imageData || !imageData.data) return null;
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts });
            return code ? code.data : null;
        }

        // ── 生成适当尺寸的 Canvas ─────────────────────────────────────
        _makeCanvas(w, h) {
            const scale  = Math.min(CONFIG.maxImageSize / w, CONFIG.maxImageSize / h, 1);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            return canvas;
        }

        // ── 等待图片加载 ───────────────────────────────────────────────
        _waitLoad(img) {
            return new Promise((resolve, reject) => {
                if (img.complete && img.naturalWidth > 0) { resolve(); return; }
                const t = setTimeout(() => reject(new Error('图片加载超时')), 12000);
                img.addEventListener('load',  () => { clearTimeout(t); resolve(); },  { once: true });
                img.addEventListener('error', () => { clearTimeout(t); reject(); }, { once: true });
            });
        }

        _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

        // ── 自动扫描整页 ───────────────────────────────────────────────
        async autoScanPage() {
            const elements = [
                ...document.querySelectorAll('img'),
                ...document.querySelectorAll('canvas'),
            ];
            for (const el of elements) {
                if (this.scannedElements.has(el)) continue;
                const rect = el.getBoundingClientRect();
                if (rect.width < CONFIG.minImageSize && rect.height < CONFIG.minImageSize) continue;
                this.scannedElements.add(el);
                const result = await this.scanElement(el);
                if (result) {
                    this.detectedQRs.set(el, result);
                    this._highlightElement(el, result);
                }
            }
        }

        // ── 高亮识别到的元素 ──────────────────────────────────────────
        _highlightElement(element, data) {
            element.classList.add('qr-code-detected');
            element.title = `🔍 二维码: ${data}`;
            element.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                UI.showResult(data);
            }, { once: true });
        }
    }

    // ── UI 管理器 ──────────────────────────────────────────────────────
    class UIManager {
        constructor() {
            this.currentModal = null;
        }

        // ── 悬浮按钮 ─────────────────────────────────────────────────
        createFloatButton() {
            const btn = document.createElement('button');
            btn.className = 'qr-scanner-float-btn';
            btn.setAttribute('aria-label', '截图扫描二维码');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4z
                             M3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v3h-3v-3zm0 5h3v3h-3v-3z"/>
                </svg>
            `;
            document.body.appendChild(btn);

            // ── 拖动逻辑（修复坐标跳跃 & 拖动结束误触发截图）──────────
            let isDragging   = false;
            let hasMoved     = false;
            let pointerOffX  = 0;  // 指针相对按钮左上角的偏移
            let pointerOffY  = 0;
            let longPressTimer = null;

            // 将按钮从 right/bottom 定位切换到 left/top，避免拖动时跳位
            const switchToAbsolute = () => {
                const r = btn.getBoundingClientRect();
                btn.style.right  = 'auto';
                btn.style.bottom = 'auto';
                btn.style.left   = `${r.left}px`;
                btn.style.top    = `${r.top}px`;
            };

            const onPointerDown = (e) => {
                if (e.button !== undefined && e.button !== 0) return;
                e.preventDefault();

                hasMoved   = false;
                isDragging = false;

                const r    = btn.getBoundingClientRect();
                pointerOffX = e.clientX - r.left;
                pointerOffY = e.clientY - r.top;

                longPressTimer = setTimeout(() => {
                    isDragging = true;
                    switchToAbsolute();
                    btn.classList.add('is-dragging');
                }, 200);

                btn.setPointerCapture(e.pointerId);
                btn.addEventListener('pointermove', onPointerMove);
                btn.addEventListener('pointerup',   onPointerUp);
            };

            const onPointerMove = (e) => {
                if (!isDragging) {
                    const r  = btn.getBoundingClientRect();
                    const dx = Math.abs(e.clientX - (pointerOffX + r.left));
                    const dy = Math.abs(e.clientY - (pointerOffY + r.top));
                    if (dx + dy > 8) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                    return;
                }

                hasMoved = true;
                e.preventDefault();

                const newLeft = Math.max(0, Math.min(e.clientX - pointerOffX, window.innerWidth  - btn.offsetWidth));
                const newTop  = Math.max(0, Math.min(e.clientY - pointerOffY, window.innerHeight - btn.offsetHeight));

                btn.style.left = `${newLeft}px`;
                btn.style.top  = `${newTop}px`;
            };

            const onPointerUp = (e) => {
                clearTimeout(longPressTimer);
                longPressTimer = null;

                btn.removeEventListener('pointermove', onPointerMove);
                btn.removeEventListener('pointerup',   onPointerUp);
                btn.releasePointerCapture(e.pointerId);

                btn.classList.remove('is-dragging');

                const wasDragging = isDragging && hasMoved;
                isDragging = false;

                if (!wasDragging) {
                    // 正常点击 → 截图扫描
                    this.startScreenshotMode();
                }
            };

            btn.addEventListener('pointerdown', onPointerDown);
        }

        // ── 截图框选扫描模式 ─────────────────────────────────────────
        startScreenshotMode() {
            const overlay      = document.createElement('div');
            const hint         = document.createElement('div');
            const selectionBox = document.createElement('div');

            overlay.className      = 'qr-screenshot-overlay';
            hint.className         = 'qr-screenshot-hint';
            selectionBox.className = 'qr-selection-box';
            selectionBox.style.display = 'none';

            hint.innerHTML = `
                <div>🔍 拖动鼠标框选二维码区域</div>
                <div class="qr-screenshot-hint-sub">按 ESC 取消</div>
            `;

            document.body.appendChild(overlay);
            document.body.appendChild(hint);
            document.body.appendChild(selectionBox);

            let isDrawing = false, sx = 0, sy = 0;

            const onDown = (e) => {
                isDrawing = true;
                sx = e.clientX; sy = e.clientY;
                hint.style.display = 'none';
                selectionBox.style.display = 'block';
                selectionBox.style.left   = `${sx}px`;
                selectionBox.style.top    = `${sy}px`;
                selectionBox.style.width  = '0';
                selectionBox.style.height = '0';
            };

            const onMove = (e) => {
                if (!isDrawing) return;
                const l = Math.min(sx, e.clientX), t = Math.min(sy, e.clientY);
                const w = Math.abs(e.clientX - sx),  h = Math.abs(e.clientY - sy);
                selectionBox.style.left   = `${l}px`;
                selectionBox.style.top    = `${t}px`;
                selectionBox.style.width  = `${w}px`;
                selectionBox.style.height = `${h}px`;
            };

            const onUp = async (e) => {
                if (!isDrawing) return;
                isDrawing = false;

                const l = Math.min(sx, e.clientX), t = Math.min(sy, e.clientY);
                const w = Math.abs(e.clientX - sx),  h = Math.abs(e.clientY - sy);

                if (w < 20 || h < 20) {
                    cleanup();
                    this.showToast('❌ 选择区域太小，请重新框选');
                    return;
                }

                selectionBox.style.display = 'none';
                hint.style.display = 'block';
                hint.innerHTML = `<div class="qr-loading"></div><div style="margin-top:12px">识别中…</div>`;

                let result = null;
                try {
                    result = await this._captureRegionScan(l, t, w, h);
                } catch (err) {
                    console.error('[QR] 扫描异常:', err);
                    // 不 rethrow，继续走正常流程，result 保持 null
                } finally {
                    cleanup();
                }
                result
                    ? this.showResult(result)
                    : this.showToast('❌ 未识别到二维码，请确保完整框选二维码区域');
            };

            const onKey = (e) => {
                if (e.key === 'Escape') { cleanup(); this.showToast('已取消'); }
            };

            const cleanup = () => {
                overlay.remove(); hint.remove(); selectionBox.remove();
                overlay.removeEventListener('mousedown', onDown);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',   onUp);
                document.removeEventListener('keydown',   onKey);
            };

            overlay.addEventListener('mousedown', onDown);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',   onUp);
            document.addEventListener('keydown',   onKey);
        }

        // ── 对框选区域内的元素精确裁剪扫描 ──────────────────────────
        async _captureRegionScan(rx, ry, rw, rh) {
            const elements = [
                ...document.querySelectorAll('img'),
                ...document.querySelectorAll('canvas'),
            ];

            for (const el of elements) {
                const rect = el.getBoundingClientRect();
                // 重叠检测（元素必须与框选区域有交集）
                if (rect.right <= rx || rect.left >= rx + rw ||
                    rect.bottom <= ry || rect.top  >= ry + rh) continue;

                try {
                    // 1. 先尝试精确裁剪框选区域内的像素（最优先，避免扫描无关区域）
                    const cropX = Math.max(0, rx - rect.left);
                    const cropY = Math.max(0, ry - rect.top);
                    const cropW = Math.min(rect.width  - cropX, (rx + rw) - Math.max(rx, rect.left));
                    const cropH = Math.min(rect.height - cropY, (ry + rh) - Math.max(ry, rect.top));

                    if (cropW >= 10 && cropH >= 10) {
                        const cropped = await this._cropAndDecode(el, rect, cropX, cropY, cropW, cropH);
                        if (cropped) return cropped;
                    }

                    // 2. 裁剪失败则扫描整个元素（兜底）
                    const full = await scanner.scanElement(el);
                    if (full) return full;

                } catch (err) {
                    console.warn('[QR] 元素裁剪失败，跳过:', err);
                }
            }

            // 3. 没有命中任何元素 → 合成框选区域所有像素到 canvas 再解码
            return await this._renderRegionFallback(rx, ry, rw, rh);
        }

        // ── 从图片元素裁剪局部区域并解码 ─────────────────────────────
        // cropX/Y/W/H 为相对于元素左上角的坐标（CSS像素）
        async _cropAndDecode(el, rect, cropX, cropY, cropW, cropH) {
            if (el.tagName === 'CANVAS') {
                return this._cropCanvas(el, rect, cropX, cropY, cropW, cropH);
            }
            // IMG 元素
            return this._cropImg(el, rect, cropX, cropY, cropW, cropH);
        }

        // ── 裁剪 <canvas> ─────────────────────────────────────────────
        async _cropCanvas(srcCanvas, rect, cropX, cropY, cropW, cropH) {
            const scaleX = srcCanvas.width  / rect.width;
            const scaleY = srcCanvas.height / rect.height;
            // 裁剪区域在原始 canvas 上的像素坐标
            const px = Math.round(cropX * scaleX);
            const py = Math.round(cropY * scaleY);
            const pw = Math.max(1, Math.round(cropW * scaleX));
            const ph = Math.max(1, Math.round(cropH * scaleY));
            // 输出 canvas 至少 200px，确保 jsQR 有足够分辨率
            const outSize = Math.max(pw, ph, 200);
            const out     = document.createElement('canvas');
            out.width  = outSize;
            out.height = outSize;
            const ctx  = out.getContext('2d');
            ctx.drawImage(srcCanvas, px, py, pw, ph, 0, 0, outSize, outSize);
            return scanner._decodeCanvas(out, ctx);
        }

        // ── 裁剪 <img>（支持跨域，用 GM_xmlhttpRequest 绕过）─────────
        _cropImg(imgEl, rect, cropX, cropY, cropW, cropH) {
            return new Promise((resolve) => {
                const src = imgEl.src || imgEl.currentSrc || imgEl.getAttribute('src') || '';
                if (!src) { resolve(null); return; }

                const doCrop = async (loadedImg) => {
                    try {
                        const scaleX = loadedImg.naturalWidth  / rect.width;
                        const scaleY = loadedImg.naturalHeight / rect.height;
                        const px = Math.round(cropX * scaleX);
                        const py = Math.round(cropY * scaleY);
                        const pw = Math.max(1, Math.round(cropW * scaleX));
                        const ph = Math.max(1, Math.round(cropH * scaleY));
                        // 输出 canvas 不缩小到 1024，至少保持原始像素数（最大 2048 防内存溢出）
                        const outW = Math.min(pw * 2, 2048);
                        const outH = Math.min(ph * 2, 2048);
                        const out  = document.createElement('canvas');
                        out.width  = outW;
                        out.height = outH;
                        const ctx  = out.getContext('2d');
                        ctx.drawImage(loadedImg, px, py, pw, ph, 0, 0, outW, outH);
                        resolve(await scanner._decodeCanvas(out, ctx));
                    } catch (err) {
                        console.warn('[QR] doCrop 失败:', err);
                        resolve(null);
                    }
                };

                // data:URI 无跨域问题
                if (src.startsWith('data:')) {
                    const tmp = new Image();
                    tmp.onload  = () => doCrop(tmp);
                    tmp.onerror = () => resolve(null);
                    tmp.src     = src;
                    return;
                }

                // 先尝试同源直接裁剪（快速路径）
                if (imgEl.complete && imgEl.naturalWidth > 0) {
                    const testCanvas = document.createElement('canvas');
                    testCanvas.width = testCanvas.height = 1;
                    const testCtx = testCanvas.getContext('2d');
                    try {
                        testCtx.drawImage(imgEl, 0, 0, 1, 1);
                        testCtx.getImageData(0, 0, 1, 1); // 测试是否跨域污染
                        doCrop(imgEl);                     // 同源，直接使用
                        return;
                    } catch (_) {
                        // 跨域，走 GM_xmlhttpRequest
                    }
                }

                // 跨域图片：通过 GM_xmlhttpRequest 下载为 Blob
                GM_xmlhttpRequest({
                    method: 'GET', url: src, responseType: 'blob', timeout: 15000,
                    onload: (resp) => {
                        const blobUrl = URL.createObjectURL(resp.response);
                        const tmp     = new Image();
                        tmp.onload  = () => { URL.revokeObjectURL(blobUrl); doCrop(tmp); };
                        tmp.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
                        tmp.src     = blobUrl;
                    },
                    onerror:   () => resolve(null),
                    ontimeout: () => resolve(null),
                });
            });
        }

        // ── 兜底：合成框选区域所有图片像素到一个 canvas 再解码 ───────
        async _renderRegionFallback(rx, ry, rw, rh) {
            // 输出 canvas 保持框选的原始像素大小（不缩小，确保分辨率）
            const out = document.createElement('canvas');
            out.width  = rw;
            out.height = rh;
            const ctx  = out.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, rw, rh);

            const imgs = [...document.querySelectorAll('img')].filter(img => {
                const r = img.getBoundingClientRect();
                return r.right > rx && r.left < rx + rw && r.bottom > ry && r.top < ry + rh;
            });

            // 逐图顺序处理（避免并发 blob URL 冲突）
            for (const img of imgs) {
                await new Promise((resolve) => {
                    const rect = img.getBoundingClientRect();
                    const src  = img.src || img.currentSrc || img.getAttribute('src') || '';
                    if (!src) { resolve(); return; }

                    const draw = (tmpImg) => {
                        // 图片上哪块区域要画到 out 上
                        const srcX = Math.max(0, rx - rect.left) / rect.width  * tmpImg.naturalWidth;
                        const srcY = Math.max(0, ry - rect.top)  / rect.height * tmpImg.naturalHeight;
                        const srcW = Math.min(rect.right,  rx + rw) / rect.width  * tmpImg.naturalWidth  - srcX;
                        const srcH = Math.min(rect.bottom, ry + rh) / rect.height * tmpImg.naturalHeight - srcY;
                        const dstX = Math.max(0, rect.left - rx);
                        const dstY = Math.max(0, rect.top  - ry);
                        const dstW = Math.min(rect.right,  rx + rw) - Math.max(rect.left, rx);
                        const dstH = Math.min(rect.bottom, ry + rh) - Math.max(rect.top,  ry);
                        if (srcW > 0 && srcH > 0 && dstW > 0 && dstH > 0) {
                            try { ctx.drawImage(tmpImg, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH); } catch (_) {}
                        }
                        resolve();
                    };

                    if (src.startsWith('data:')) {
                        const tmp = new Image();
                        tmp.onload  = () => draw(tmp);
                        tmp.onerror = resolve;
                        tmp.src     = src;
                        return;
                    }

                    // 同源快速路径
                    if (img.complete && img.naturalWidth > 0) {
                        const t = document.createElement('canvas');
                        t.width = t.height = 1;
                        try {
                            t.getContext('2d').drawImage(img, 0, 0, 1, 1);
                            t.getContext('2d').getImageData(0, 0, 1, 1);
                            draw(img);
                            return;
                        } catch (_) { /* 跨域，继续用 GM */ }
                    }

                    GM_xmlhttpRequest({
                        method: 'GET', url: src, responseType: 'blob', timeout: 10000,
                        onload: (resp) => {
                            const blobUrl = URL.createObjectURL(resp.response);
                            const tmp     = new Image();
                            tmp.onload  = () => { URL.revokeObjectURL(blobUrl); draw(tmp); };
                            tmp.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(); };
                            tmp.src     = blobUrl;
                        },
                        onerror:   resolve,
                        ontimeout: resolve,
                    });
                });
            }

            return scanner._decodeCanvas(out, ctx);
        }

        // ── 结果弹窗 ─────────────────────────────────────────────────
        showResult(content) {
            this.removeModal();
            const overlay = document.createElement('div');
            const modal   = document.createElement('div');
            overlay.className = 'qr-modal-overlay';
            modal.className   = 'qr-result-modal';

            const isUrl = this._isUrl(content);
            modal.innerHTML = `
                <div class="qr-result-header">
                    <div class="qr-result-title">✅ 扫描结果</div>
                    <button class="qr-result-close" aria-label="关闭">×</button>
                </div>
                <div class="qr-result-content">${this._escapeHtml(content)}</div>
                <div class="qr-result-actions">
                    ${isUrl ? '<button class="qr-btn qr-btn-primary" data-action="open">打开链接</button>' : ''}
                    <button class="qr-btn qr-btn-${isUrl ? 'secondary' : 'primary'}" data-action="copy">复制内容</button>
                </div>
            `;

            modal.querySelector('.qr-result-close').addEventListener('click', () => this.removeModal());
            overlay.addEventListener('click', () => this.removeModal());

            modal.querySelector('[data-action="open"]')?.addEventListener('click', () => {
                window.open(content, '_blank', 'noopener,noreferrer');
            });

            const copyBtn = modal.querySelector('[data-action="copy"]');
            copyBtn.addEventListener('click', () => {
                this._copyText(content);
                copyBtn.textContent = '✓ 已复制';
                setTimeout(() => { copyBtn.textContent = '复制内容'; }, 2000);
            });

            document.body.appendChild(overlay);
            document.body.appendChild(modal);
            this.currentModal = { overlay, modal };
        }

        removeModal() {
            if (!this.currentModal) return;
            this.currentModal.overlay.remove();
            this.currentModal.modal.remove();
            this.currentModal = null;
        }

        showToast(message, duration = 2500) {
            const toast = document.createElement('div');
            toast.className   = 'qr-toast';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity    = '0';
                toast.style.transform  = 'translateX(-50%) translateY(-16px)';
                toast.style.transition = 'opacity .3s, transform .3s';
                setTimeout(() => toast.remove(), 320);
            }, duration);
        }

        _copyText(text) {
            if (typeof GM_setClipboard !== 'undefined') {
                GM_setClipboard(text);
            } else {
                navigator.clipboard?.writeText(text).catch(() => {
                    const ta = Object.assign(document.createElement('textarea'),
                        { value: text, style: 'position:fixed;opacity:0' });
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    ta.remove();
                });
            }
        }

        _escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = str;
            return d.innerHTML;
        }

        _isUrl(str) {
            try { new URL(str); return true; } catch {
                return /^https?:\/\//.test(str);
            }
        }
    }

    // ── 初始化 ────────────────────────────────────────────────────────
    injectStyles();
    const scanner = new QRScanner();
    const UI      = new UIManager();

    if (CONFIG.showFloatButton) UI.createFloatButton();

    // ── 自动扫描控制 ──────────────────────────────────────────────────
    let domObserver = null;

    const startAutoScan = () => {
        scanner.autoScanPage().then(() => {
            if (scanner.detectedQRs.size > 0)
                UI.showToast(`✓ 找到 ${scanner.detectedQRs.size} 个二维码`);
        });

        domObserver?.disconnect();
        domObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const targets = node.matches?.('img,canvas') ? [node]
                        : [...(node.querySelectorAll?.('img,canvas') ?? [])];
                    for (const el of targets) {
                        if (scanner.scannedElements.has(el)) continue;
                        scanner.scannedElements.add(el);
                        setTimeout(async () => {
                            const r = await scanner.scanElement(el);
                            if (r) { scanner.detectedQRs.set(el, r); scanner._highlightElement(el, r); }
                        }, 500);
                    }
                }
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
    };

    const stopAutoScan = () => {
        domObserver?.disconnect();
        domObserver = null;
    };

    if (CONFIG.autoScan) {
        setTimeout(startAutoScan, CONFIG.scanDelay);
    }

    // ── 油猴菜单 ──────────────────────────────────────────────────────
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('🔍 扫描当前页面二维码', async () => {
            scanner.detectedQRs.clear();
            scanner.scannedElements = new WeakSet();
            await scanner.autoScanPage();
            UI.showToast(scanner.detectedQRs.size > 0
                ? `✓ 找到 ${scanner.detectedQRs.size} 个二维码`
                : '❌ 未检测到二维码');
        });

        GM_registerMenuCommand(
            CONFIG.autoScan ? '⏸ 关闭自动扫描' : '▶ 开启自动扫描',
            () => {
                CONFIG.autoScan = !CONFIG.autoScan;
                if (CONFIG.autoScan) {
                    startAutoScan();
                    UI.showToast('✓ 自动扫描已开启');
                } else {
                    stopAutoScan();
                    UI.showToast('✗ 自动扫描已关闭');
                }
                // 重新注册菜单以刷新文字（Tampermonkey 支持）
                setTimeout(() => location.reload(), 100);
            }
        );
    }
})();

