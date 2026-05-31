/**
 * Dataset Manager UI Canvas
 * 負責處理影像標註畫布 (物件偵測拉框與自駕循線劃線等互動)
 */

export const UICanvas = {
    state: {
        canvas: null,
        ctx: null,
        img: null,
        isDrawing: false,
        startX: 0,
        startY: 0,
        clickTime: 0,
        drawingState: 0, // 0: idle, 1: pending_end (用於點擊兩下畫線)
        currentBbox: null, // [x, y, w, h] (BBox) 或 [x1, y1, x2, y2] (Line) 比例座標 (0~1)
        annotations: [], // [{ class_id, bbox:[x,y,w,h] }] 或 [{ class_id, line:[x1,y1,x2,y2] }]
        mode: 'bbox', // 'bbox' 或 'line'
        onUpdate: null,
        handlers: {} // 存放事件處理器以便清理
    },

    init(parentContainer, imgElement, annotations = [], options = {}) {
        this.state.img = imgElement;
        this.state.annotations = annotations || [];
        this.state.onUpdate = options.onUpdate;
        this.state.mode = options.mode || 'bbox';
        this.state.drawingState = 0; // 重置點擊兩點狀態機
        this.state.isDrawing = false;

        const oldCanvas = parentContainer.querySelector('canvas.dataset-annotation-canvas');
        if (oldCanvas) {
            this.unbindEvents();
            oldCanvas.remove();
        }

        const canvas = document.createElement('canvas');
        canvas.className = 'dataset-annotation-canvas';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.cursor = 'crosshair';
        
        parentContainer.style.position = 'relative';
        parentContainer.appendChild(canvas);
        
        this.state.canvas = canvas;
        this.state.ctx = canvas.getContext('2d');
        
        this.bindEvents();
        this.resize();
        this.render();
    },

    resize() {
        if (!this.state.canvas || !this.state.img) return;
        this.state.canvas.width = this.state.img.clientWidth;
        this.state.canvas.height = this.state.img.clientHeight;
        this.render();
    },

    bindEvents() {
        const canvas = this.state.canvas;
        const clamp = (val, max) => Math.max(0, Math.min(max, val));
        
        this.state.handlers.mousedown = (e) => {
            const rect = canvas.getBoundingClientRect();
            const px = clamp(e.clientX - rect.left, canvas.width);
            const py = clamp(e.clientY - rect.top, canvas.height);

            if (this.state.mode === 'line') {
                if (this.state.drawingState === 0) {
                    // 第一下：可能是拖曳起點，也可能是點選起點
                    this.state.startX = px;
                    this.state.startY = py;
                    this.state.isDrawing = true;
                    this.state.clickTime = Date.now();
                } else if (this.state.drawingState === 1) {
                    // 第二下：鎖定終點
                    this.state.annotations = [{
                        class_id: 0,
                        line: [
                            this.state.startX / canvas.width,
                            this.state.startY / canvas.height,
                            px / canvas.width,
                            py / canvas.height
                        ]
                    }];
                    if (this.state.onUpdate) this.state.onUpdate(this.state.annotations);
                    this.state.drawingState = 0;
                    this.state.currentBbox = null;
                    this.render();
                }
            } else {
                // 原有的物件偵測拉框模式 (bbox)
                this.state.isDrawing = true;
                this.state.startX = px;
                this.state.startY = py;
            }
        };

        this.state.handlers.mousemove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const currX = clamp(e.clientX - rect.left, canvas.width);
            const currY = clamp(e.clientY - rect.top, canvas.height);

            if (this.state.mode === 'line') {
                // 拖曳拉線中，或是點選起點後正在等待終點 (橡皮筋線預覽)
                if (this.state.isDrawing || this.state.drawingState === 1) {
                    this.state.currentBbox = [
                        this.state.startX / canvas.width,
                        this.state.startY / canvas.height,
                        currX / canvas.width,
                        currY / canvas.height
                    ];
                    this.render();
                }
            } else {
                // 畫矩形框 bbox 中
                if (!this.state.isDrawing) return;
                const x = Math.min(this.state.startX, currX);
                const y = Math.min(this.state.startY, currY);
                const w = Math.abs(currX - this.state.startX);
                const h = Math.abs(currY - this.state.startY);

                this.state.currentBbox = [
                    x / canvas.width,
                    y / canvas.height,
                    w / canvas.width,
                    h / canvas.height
                ];
                this.render();
            }
        };

        this.state.handlers.mouseup = (e) => {
            if (!this.state.isDrawing) return;
            this.state.isDrawing = false;

            const rect = canvas.getBoundingClientRect();
            const currX = clamp(e.clientX - rect.left, canvas.width);
            const currY = clamp(e.clientY - rect.top, canvas.height);

            if (this.state.mode === 'line') {
                const dist = Math.sqrt(Math.pow(currX - this.state.startX, 2) + Math.pow(currY - this.state.startY, 2));
                
                if (dist > 5) {
                    // 距離大於 5 像素：代表為拖曳拉線模式，直接結束並儲存
                    this.state.annotations = [{
                        class_id: 0,
                        line: [
                            this.state.startX / canvas.width,
                            this.state.startY / canvas.height,
                            currX / canvas.width,
                            currY / canvas.height
                        ]
                    }];
                    if (this.state.onUpdate) this.state.onUpdate(this.state.annotations);
                    this.state.currentBbox = null;
                    this.render();
                } else {
                    // 距離極小：代表是單點按起點，進入點選狀態機，等待第二次點擊
                    this.state.drawingState = 1;
                    this.state.currentBbox = [
                        this.state.startX / canvas.width,
                        this.state.startY / canvas.height,
                        this.state.startX / canvas.width,
                        this.state.startY / canvas.height
                    ];
                    this.render();
                }
            } else {
                // 畫矩形框結束
                if (this.state.currentBbox && this.state.currentBbox[2] > 0.01) {
                    this.state.annotations.push({
                        class_id: 0,
                        bbox: this.state.currentBbox.slice() // 拷貝陣列避免參考問題
                    });
                    if (this.state.onUpdate) this.state.onUpdate(this.state.annotations);
                }
                this.state.currentBbox = null;
                this.render();
            }
        };

        canvas.addEventListener('mousedown', this.state.handlers.mousedown);
        window.addEventListener('mousemove', this.state.handlers.mousemove);
        window.addEventListener('mouseup', this.state.handlers.mouseup);
    },

    unbindEvents() {
        const canvas = this.state.canvas;
        const h = this.state.handlers;
        if (h.mousedown && canvas) canvas.removeEventListener('mousedown', h.mousedown);
        if (h.mousemove) window.removeEventListener('mousemove', h.mousemove);
        if (h.mouseup) window.removeEventListener('mouseup', h.mouseup);
        
        this.state.handlers = {};
    },

    render() {
        const { canvas, ctx, annotations, currentBbox, mode } = this.state;
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (mode === 'line') {
            // 繪製循線線段
            annotations.forEach((ann) => {
                if (ann.line) {
                    this.drawLine(ann.line, '#FE2F89', 'Line');
                }
            });

            // 繪製當前拉伸中或等待點擊中的預覽線
            if (currentBbox) {
                this.drawLine(currentBbox, '#00CCFF', 'Pending');
            }
        } else {
            // 繪製既有矩形框
            annotations.forEach((ann, idx) => {
                if (ann.bbox) {
                    this.drawBox(ann.bbox, '#FE2F89', `Obj ${idx}`);
                }
            });

            // 繪製當前拉框
            if (currentBbox) {
                this.drawBox(currentBbox, '#00CCFF', 'New');
            }
        }
    },

    drawBox(bbox, color, label) {
        const { ctx, canvas } = this.state;
        const [x, y, w, h] = bbox;
        
        const px = x * canvas.width;
        const py = y * canvas.height;
        const pw = w * canvas.width;
        const ph = h * canvas.height;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, pw, ph);

        ctx.fillStyle = color;
        ctx.font = '10px sans-serif';
        ctx.fillText(label, px, py > 15 ? py - 5 : py + 15);
    },

    drawLine(lineCoords, color, label) {
        const { ctx, canvas } = this.state;
        const [x1, y1, x2, y2] = lineCoords;
        
        const px1 = x1 * canvas.width;
        const py1 = y1 * canvas.height;
        const px2 = x2 * canvas.width;
        const py2 = y2 * canvas.height;

        // 1. 繪製線段
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
        ctx.stroke();

        // 2. 繪製起點（綠色圓點代表 Start）
        ctx.fillStyle = '#00FF00';
        ctx.beginPath();
        ctx.arc(px1, py1, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 3. 繪製終點（紅色圓點代表 End）
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(px2, py2, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 4. 繪製方向箭頭
        const dx = px2 - px1;
        const dy = py2 - py1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10) {
            const angle = Math.atan2(dy, dx);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(px2, py2);
            ctx.lineTo(px2 - 12 * Math.cos(angle - Math.PI / 6), py2 - 12 * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(px2 - 12 * Math.cos(angle + Math.PI / 6), py2 - 12 * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
        }

        // 5. 標註文字
        ctx.fillStyle = color;
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(label, px1 + 10, py1 - 5);
    }
};
