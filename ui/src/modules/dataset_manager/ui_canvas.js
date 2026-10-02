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
        currentClassId: 0, // 目前選擇的類別 ID（由外部 UI 設定）
        selectedAnnotationIndex: -1, // -1 = 無選中
        // 2026-10-01：滑鼠 hover 的標註索引（從標註列表觸發）。
        // 與 selectedAnnotationIndex 刻意分開 —— hover 暫時、選取持續（見 setHoveredAnnotation）。
        hoveredAnnotationIndex: -1,
        // 2026-10-01：hover 閃爍動畫的時鐘（0~1，用於虛線相位）。
        // 由 _hoverTick() 以 requestAnimationFrame 持續推進；
        // 無 hover 時為 -1（代表「不跑動畫」）。
        hoverPhase: -1,
        // requestAnimationFrame 的 handle；-1 = 未啟動。用於確保不重複啟動動畫迴圈。
        hoverRafId: -1,
        labelMap: {}, // class_id → 類別名稱對照表
        // 2026-10-01：由呼叫端注入的標籤取色函式（來自 P2 的 UIComponents.getLabelColor），
        // 讓 bbox 框線與 P2 縮圖／統計同色。未注入時退回舊的單色。
        getLabelColor: null,
        // 2026-10-01：跨畫面十字尺規。pointer 為滑鼠在畫布內的像素座標；
        // null = 游標不在畫布上（不繪製）。bbox 模式專用，方便對齊物件範圍。
        pointerX: null,
        pointerY: null,
        crosshairColor: '#00ff88', // 尺規顏色（可由 UI 改色，預設亮綠以免在淺色照片上消失）
        onUpdate: null,
        handlers: {} // 存放事件處理器以便清理
    },

    // 標註文字樣式（畫布像素單位，非 CSS px）
    // 2026-10-01：原為 10px/11px，在高解析截圖上過小幾乎不可讀，放大為 15px/17px。
    LABEL_FONT_SIZE: 15,
    LABEL_FONT_SIZE_SELECTED: 17,
    CROSSHAIR_DEFAULT_COLOR: '#00ff88',
    CROSSHAIR_STORAGE_KEY: 'cocoya_dm_crosshair_color',

    // bbox / 線段框線顏色（2026-10-01）
    // 選取中的框固定用醒目青色：選取狀態必須與類別色脫鉤，
    // 否則同一類別有多個框時分不出目前選到哪一個。
    SELECTED_COLOR: '#00CCFF',
    // 未注入 P2 標籤取色時的退 fallback 色（維持舊的單色行為）。
    DEFAULT_BOX_COLOR: '#FE2F89',

    // ── 框線雙色描邊（2026-10-01）───────────────────────────────────
    // 為什麼要雙層：框線畫在「照片」上，不是畫在 UI 底色上。
    //   照片的明暗與主題無關 —— 白色背景的商品照在 light/dark 主題下
    //   都是白底；夜景照則相反。單一顏色必然有一半情況看不見。
    //
    // 解法（兩層互補）：
    //   外層 BOX_HALO_COLOR（白、粗）→ 在暗照片上提供邊界
    //   內層 標籤色（細）            → 保留類別辨識；且在亮照片上反而清楚
    // 因此白+標籤色這組搭配可涵蓋絕大多數照片，不需判斷照片明暗
    // （判斷的話得每張取樣，且漸層照片會誤判，成本高）。
    BOX_HALO_COLOR: '#FFFFFF',

    // ── hover 閃爍虛線（2026-10-01，使用者回報「加粗不明顯」後改用）────
    // 為什麼改用閃爍而不只是加粗：
    //   靜態的加粗/加寬在高解析照片上仍可能被背景吞沒；
    //   「動態」是不依賴顏色對比的訊號，人眼對運動的敏感度遠高於對粗細。
    //   （業界工具如 CVAT / LabelImg 的 hover 提示也常以動態強調。）
    //
    // 頻率 2Hz（使用者指定「慢速呼吸，柔和不惱人」）：
    //   每秒 2 次往返。快於此會讓人眼花、易疲勞。
    HOVER_BLINK_HZ: 2,
    // 虛線樣式 [實線段, 空白段]（畫布像素）。
    HOVER_DASH: [7, 5],
    // 呼吸的振幅：光暈寬度在此範圍內起伏。設 0 即為固定寬度（無呼吸）。
    HOVER_HALO_MIN_EXTRA: 2,
    HOVER_HALO_MAX_EXTRA: 8,
    // 外層比內層粗這麼多 px，確保白邊不會被內層完全覆蓋。
    BOX_HALO_EXTRA_PX: 2,

    // hover 時光暈額外加寬的 px（2026-10-01 使用者回報「高亮不明顯」）。
    // 只加寬光暈、不加寬內框 —— 內框變粗會讓標籤色的可辨識性下降，
    // 而使用者要的是「知道是哪個框」，不是「框更粗」。
    BOX_HOVER_HALO_EXTRA_PX: 5,

    // hover 時晶片底板的不透明度（比一般狀態更亮更實）。
    // 一般為 0.72（半透明黑）；hover 提到 0.92，讓文字與色條更突出。
    CHIP_HOVER_BG_ALPHA: 1,

    // 框線（內層標籤色）的固定明度，**不依主題變動**。
    // 取 52 的理由：介於深底可見（需 ≥55 較佳）與亮照片可辨（需 ≤60）
    // 之間的中值；且因外層有白色描邊兜底，暗照片上的可見性不依賴這個值。
    BOX_LABEL_LIGHTNESS: 52,

    // 標註晶片色條用的「亮化」幅度（%）。
    // 晶片底板是 rgba(0,0,0,0.72) 深色，若直接用標籤原色，
    // 偏暗的標籤色（light 主題 L≈42）在深底上幾乎看不見色條。
    CHIP_BAR_LIGHTEN_PCT: 22,

    /**
     * 設定十字尺規顏色並立即重繪。
     * 2026-10-01 使用者回報：固定白色在白色照片上看不清 → 提供可調色。
     * @param {string} color CSS 顏色字串（#rgb / #rrggbb / rgba(...)）
     * @param {boolean} [persist] 是否寫入 localStorage（預設 true）
     * @returns {boolean} 是否設定成功（空字串／非字串 → false，不污染狀態）
     */
    setCrosshairColor(color, persist = true) {
        if (typeof color !== 'string' || !color.trim()) return false;
        this.state.crosshairColor = color.trim();
        if (persist) {
            try {
                localStorage.setItem(this.CROSSHAIR_STORAGE_KEY, this.state.crosshairColor);
            } catch (e) { /* 隱私模式忽略 */ }
        }
        this.render();
        return true;
    },

    /**
     * 讀取已儲存的尺規顏色（無儲存值時回傳預設色）。由 init() 呼叫，跨工作階段保留。
     */
    loadCrosshairColor() {
        let saved = null;
        try { saved = localStorage.getItem(this.CROSSHAIR_STORAGE_KEY); } catch (e) { /* 忽略 */ }
        this.state.crosshairColor = saved || this.CROSSHAIR_DEFAULT_COLOR;
        return this.state.crosshairColor;
    },

    init(parentContainer, imgElement, annotations = [], options = {}) {
        this.state.img = imgElement;
        this.state.annotations = annotations || [];
        this.state.onUpdate = options.onUpdate;
        this.state.mode = options.mode || 'bbox';
        this.state.labelMap = options.labelMap || {};
        this.state.getLabelColor = options.getLabelColor || null;
        this.state.drawingState = 0; // 重置點擊兩點狀態機
        this.state.isDrawing = false;
        this.state.selectedAnnotationIndex = -1; // 重置選中狀態
        // 2026-10-01：也要重置 hover —— 否則切圖後舊索引會指向新圖的框，
        // 畫面會莫名高亮一個不相關的框。
        this.state.hoveredAnnotationIndex = -1;
        // 停止閃爍動畫 —— 否則 rAF 會持續對舊畫布重繪（洩漏 + 浪費 CPU）。
        this._stopHoverAnimation();
        this.state.pointerX = null; // 重置十字尺規
        this.state.pointerY = null;
        this.loadCrosshairColor(); // 還原使用者上次選的尺規顏色（2026-10-01 可調色）

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

            // 點擊畫布時清除選中狀態（非拉框開始）
            this.state.selectedAnnotationIndex = -1;

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
            const rawX = e.clientX - rect.left;
            const rawY = e.clientY - rect.top;
            const currX = clamp(rawX, canvas.width);
            const currY = clamp(rawY, canvas.height);

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
                // 2026-10-01：尺規需在「非拉框」時也更新（否則只在拉框中出現）。
                // 但 currentBbox（預覽框）必須守在 isDrawing 保護內 ——
                // 否則滑鼠一移動就會用殘留的 startX/startY(=0) 從左上角憑空拉出藍框，
                // 且 mouseup 會把它當成正式標註送出。
                //
                // 2026-10-02（使用者回報「mouse 不在影像上尺規也會出現」）：
                // mousemove 掛在 window（拉框拖出畫布仍要追蹤），游標到影像之外一樣觸發，
                // 而 currX/currY 被 clamp 釘在邊界 → 尺規黏在影像邊緣不消失；
                // canvas.mouseleave 雖會把 pointer 清掉，但下一次 window mousemove
                // 又立刻設回去，等於永遠清不掉。故改以「未 clamp 的 raw 座標」判定
                // 游標是否真的在影像上，出界一律收起（拉框中的預覽框不受影響，
                // currentBbox 仍用 clamp 後的座標，拖出畫布會停在邊界）。
                const inside = rawX >= 0 && rawY >= 0
                    && rawX <= canvas.width && rawY <= canvas.height;
                this.state.pointerX = inside ? currX : null;
                this.state.pointerY = inside ? currY : null;
                if (this.state.isDrawing) {
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
                }
                this.render();
            }
        };

        // 2026-10-01：游標離開畫布 → 收起十字尺規，避免留下過期的線
        this.state.handlers.mouseleave = () => {
            this.state.pointerX = null;
            this.state.pointerY = null;
            if (this.state.isDrawing) return; // 拉框中不重繪，避免中斷預覽
            this.render();
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
                        class_id: this.state.currentClassId,
                        bbox: this.state.currentBbox.slice() // 拷貝陣列避免參考問題
                    });
                    if (this.state.onUpdate) this.state.onUpdate(this.state.annotations);
                }
                this.state.currentBbox = null;
                this.render();
            }
        };

        canvas.addEventListener('mousedown', this.state.handlers.mousedown);
        canvas.addEventListener('mouseleave', this.state.handlers.mouseleave);
        window.addEventListener('mousemove', this.state.handlers.mousemove);
        window.addEventListener('mouseup', this.state.handlers.mouseup);
    },

    unbindEvents() {
        const canvas = this.state.canvas;
        const h = this.state.handlers;
        if (h.mousedown && canvas) canvas.removeEventListener('mousedown', h.mousedown);
        if (h.mouseleave && canvas) canvas.removeEventListener('mouseleave', h.mouseleave);
        if (h.mousemove) window.removeEventListener('mousemove', h.mousemove);
        if (h.mouseup) window.removeEventListener('mouseup', h.mouseup);
        if (h.keydown && canvas) canvas.removeEventListener('keydown', h.keydown);
        
        // 2026-10-01：離開標註模式時必須停止 hover 閃爍動畫，
        // 否則 rAF 會一直跑下去（洩漏 + 對已卸載的畫布重繪）。
        this._stopHoverAnimation();

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
                    this.drawLine(ann.line, UICanvas.DEFAULT_BOX_COLOR, 'Line');
                }
            });

            // 繪製當前拉伸中或等待點擊中的預覽線
            if (currentBbox) {
                this.drawLine(currentBbox, UICanvas.SELECTED_COLOR, 'Pending');
            }
        } else {
            // 繪製既有矩形框
            annotations.forEach((ann, idx) => {
                if (ann.bbox) {
                    const isSelected = (idx === this.state.selectedAnnotationIndex);
                    // 2026-10-01：hover 預覽（滑鼠停在標註列表項目上）。
                    // 優先級 selected > hovered：已選取的框即使被 hover 也不改變，
                    // 否則 hover 會「洗掉」選取狀態的視覺回饋。
                    const isHovered = (idx === this.state.hoveredAnnotationIndex);
                    const label = this.getAnnotationLabel(ann.class_id, idx);
                    // ★ 只有 selected 才換成青色；hover 只加粗、維持標籤色
                    //   （先前誤傳 isSelected || isHovered，會讓 hover 也變青色，
                    //    與「hover 用加粗而非換色區隔」的設計相矛盾）。
                    this.drawBox(
                        ann.bbox,
                        this.resolveBoxColor(label, isSelected),
                        label,
                        isSelected,
                        isHovered && !isSelected
                    );
                }
            });

            // 繪製當前拉框
            if (currentBbox) {
                this.drawBox(currentBbox, UICanvas.SELECTED_COLOR, 'New');
            }

            // 2026-10-01：跨畫面十字尺規（最後繪製 → 疊在框之上，便於對齊邊界）
            this.drawCrosshair();
        }
    },

    /**
     * 繪製跨整個畫面的十字尺規（水平 + 垂直虛線）。
     * 游標不在畫布上時不繪製；線模式不繪製（線段模式原本就有橡皮筋預覽）。
     */
    drawCrosshair() {
        const { ctx, canvas, mode, pointerX, pointerY } = this.state;
        if (mode !== 'bbox') return;
        if (pointerX === null || pointerY === null) return;
        if (!ctx || !canvas || !canvas.width || !canvas.height) return;

        ctx.save();
        ctx.strokeStyle = this.state.crosshairColor || this.CROSSHAIR_DEFAULT_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        // 水平線：貫穿整個寬度，位於游標列
        ctx.moveTo(0, Math.round(pointerY) + 0.5);
        ctx.lineTo(canvas.width, Math.round(pointerY) + 0.5);
        // 垂直線：貫穿整個高度，位於游標欄
        ctx.moveTo(Math.round(pointerX) + 0.5, 0);
        ctx.lineTo(Math.round(pointerX) + 0.5, canvas.height);
        ctx.stroke();
        ctx.restore();
    },

    /**
     * 繪製標註框（雙色描邊，2026-10-01）
     *
     * 兩層各司其職：
     *   1. 外層白色粗線 → 在**暗照片**上提供邊界（照片明暗與主題無關，
     *      單色框必然有一半情況看不見）
     *   2. 內層標籤色細線 → 保留**類別辨識度**，且在亮照片上反而清楚
     *
     * 兩層互補，故不需判斷照片明暗（判斷需每張取樣，漸層照片會誤判）。
     *
     * @param {number[]} bbox [x, y, w, h] 皆為 0~1 的相對座標
     * @param {string} color 標籤色（內層用）
     * @param {string} label 標籤文字
     * @param {boolean} [isSelected=false] 是否選取中（青色，最粗）
     * @param {boolean} [isHovered=false] 是否 hover 中（加粗但維持標籤色）。
     *   與 isSelected 的差別：hover 只加粗、不換色，且優先級較低
     *   （已選取的框被 hover 時不會改變外觀）。
     */
    drawBox(bbox, color, label, isSelected = false, isHovered = false) {
        const { ctx, canvas } = this.state;
        const [x, y, w, h] = bbox;

        const px = x * canvas.width;
        const py = y * canvas.height;
        const pw = w * canvas.width;
        const ph = h * canvas.height;

        // 線寬：selected(4) > hovered(3) > 一般(2)
        const baseWidth = isSelected ? 4 : (isHovered ? 3 : 2);
        // ── hover：閃爍虛線 + 呼吸光暈（2026-10-01）────────────────────
        // 靜態加粗被使用者回報「不明顯」，故改用動態提示：
        //   · 光暈寬度依 hoverPhase 在 [MIN, MAX] 之間往返（呼吸）
        //   · 虛線的 lineDashOffset 隨相位前移 → 看起來在流動
        // 人眼對運動的敏感度遠高於對粗細，故此法在複雜背景上更可靠。
        const blinking = isHovered && !isSelected;
        let haloWidth = baseWidth + UICanvas.BOX_HALO_EXTRA_PX;
        if (blinking) {
            const phase = (this.state.hoverPhase >= 0) ? this.state.hoverPhase : 0;
            const extra = UICanvas.HOVER_HALO_MIN_EXTRA
                + phase * (UICanvas.HOVER_HALO_MAX_EXTRA - UICanvas.HOVER_HALO_MIN_EXTRA);
            haloWidth = baseWidth + extra;

            // 處線相位：隨呼吸相位前移，形成流動感（與呼吸同頼）
            ctx._dashTag = 'outer'; // 測試用：標記本次 setLineDash 的來源
            // ★ 先設 lineDashOffset 再設 lineDash —— setLineDash 會重置 offset，
            //   順序額倒會讓「流動」效果完全看不到（畫面變成靜止處線）。
            ctx.lineDashOffset = -phase * 12;
            ctx.setLineDash(UICanvas.HOVER_DASH);
        }

        // 第 1 層：白色外框（粗）—— 暗照片上的可見性來源；hover 時呼吸且為虛線
        ctx.strokeStyle = UICanvas.BOX_HALO_COLOR;
        ctx.lineWidth = haloWidth;
        ctx.strokeRect(px, py, pw, ph);

        // 第 2 層：標籤色內框（細）—— 類別辨識；亮照片上靠這層看清
        // hover 時不畫虛線（虛線套在內框會讓標籤色難以辨識）
        if (blinking) { ctx._dashTag = 'inner'; ctx.setLineDash([]); }
        ctx.strokeStyle = color;
        ctx.lineWidth = baseWidth;
        ctx.strokeRect(px, py, pw, ph);

        // 還原 lineDash，避免影響後續繪製（尺規等）
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;

        this.drawLabelChip(label, px, py > 22 ? py - 6 : py + 18, color, isSelected, blinking);
    },

    /**
     * 將 hsl() 色字串的明度提高指定百分比（用於深底板上的色條）。
     *
     * 為什麼需要：標註晶片的底板是 rgba(0,0,0,0.72) 深色，
     * 直接畫偏暗的標籤色（light 主題 L≈42）在上面幾乎看不見。
     *
     * @param {string} color CSS 色字串，目前僅支援 hsl(h, s%, l%) 格式
     * @param {number} pct 要增加的明度百分比
     * @returns {string} 亮化後的色字串；格式不符時原樣回傳
     */
    lightenHsl(color, pct) {
        const m = /^hsl\(\s*(-?[\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/.exec(String(color).trim());
        if (!m) return color;
        const l = Math.min(100, parseFloat(m[3]) + pct);
        return `hsl(${m[1]}, ${m[2]}%, ${l}%)`;
    },

    /**
     * 繪製標註文字：深色底板 + 白字，確保在任何影像背景上都清晰可讀。
     * 2026-10-01：原為無底板的 10px 純色文字，於高解析截圖上幾乎不可讀。
     * @param {string} text 文字內容
     * @param {number} x 文字基準 x
     * @param {number} y 文字基準 y
     * @param {string} color 原標註色（用於底板左側色條）
     * @param {boolean} isSelected 是否為選中狀態（字體略大）
     * @param {boolean} [isHovered=false] 是否為 hover 預覽（2026-10-01）。
     *   hover 時底板更亮更實（alpha 0.72 → 0.92），讓文字與色條在
     *   雜亂照片上更突出 —— 使用者回報框線高亮「不明顯」，光暈加寬仍不足，
     *   故疊加底板變亮。文字維持白色（白底白字不可讀，故只加亮底板不換字色）。
     */
    drawLabelChip(text, x, y, color, isSelected = false, isHovered = false) {
        const { ctx } = this.state;
        const fontSize = isSelected ? this.LABEL_FONT_SIZE_SELECTED : this.LABEL_FONT_SIZE;
        ctx.save();
        ctx.font = `${isSelected ? 'bold ' : ''}${fontSize}px sans-serif`;
        ctx.textBaseline = 'alphabetic';

        const metrics = ctx.measureText(text);
        const padX = 4;
        const padY = 3;
        const w = metrics.width + padX * 2;
        const h = fontSize + padY * 2;

        // 深色底板（半透明黑），疊在任何背景上都可讀。
        // hover 時提高不透明度 → 底板更實、文字更突出。
        const bgAlpha = (isHovered && !isSelected) ? UICanvas.CHIP_HOVER_BG_ALPHA : 0.72;
        ctx.fillStyle = `rgba(0, 0, 0, ${bgAlpha})`;
        ctx.fillRect(x - padX, y - fontSize - padY, w, h);

        // 左側色條標示類別色。
        // 2026-10-01：改用「亮化版」—— 底板是 rgba(0,0,0,0.72) 深色，
        // 偏暗的標籤色（light 主題 L≈42）直接畫上去幾乎看不見色條。
        ctx.fillStyle = this.lightenHsl(color, UICanvas.CHIP_BAR_LIGHTEN_PCT);
        ctx.fillRect(x - padX, y - fontSize - padY, 3, h);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, x, y);
        ctx.restore();
    },

    /**
     * 設定目前選中的標註索引並重新繪製
     * @param {number} index 標註索引，-1 表示清除選中
     */
    setSelectedAnnotation(index) {
        this.state.selectedAnnotationIndex = index;
        this.render();
    },

    /**
     * 設定「滑鼠停留」的標註索引（hover 預覽）並重新繪製。
     *
     * 為什麼需要（2026-10-01 使用者需求）：標註列表有多個框時，
     * 從列表刪除框時無法對應畫面上是哪一個。使用者 hover 列表項目時，
     * 畫面對應的框要高亮，才能知道要刪哪一個。
     *
     * ★ 與 selectedAnnotationIndex **刻意分開**：
     *   hover 是暫時的（滑開就消失），選取是持續的（點一下就固定）。
     *   若共用同一狀態，滑鼠滑過列表會把選取狀態洗掉，
     *   使用者點了「選取框」再滑鼠碰到列表就失效了。
     *
     * @param {number} index 標註索引，-1 表示清除 hover
     */
    setHoveredAnnotation(index) {
        if (this.state.hoveredAnnotationIndex === index) return; // 避免重複重繪
        this.state.hoveredAnnotationIndex = index;
        this._syncHoverAnimation();
        this.render();
    },

    /**
     * 依 hover 狀態啟動／停止閃爍動畫（2026-10-01）。
     *
     * 為什麼需要這個方法：若只靠 setHoveredAnnotation 呼叫 render()，
     * 虛線相位不會前進，畫面就是「靜態虛線」而非閃爍。
     * 而若無腦常駐 rAF，則在沒有 hover 時白白重繪、浪費 CPU。
     * 故此處明確管理「何時跑動畫」，並在 hover 結束時把相位歸零。
     *
     * @private
     */
    _syncHoverAnimation() {
        const needsAnim = this.state.hoveredAnnotationIndex >= 0;
        if (!needsAnim) {
            this._stopHoverAnimation();
            return;
        }
        if (this.state.hoverRafId === -1) {
            this._startHoverAnimation();
        }
    },

    /**
     * 啟動閃爍動畫迴圈（@private）
     * 以 requestAnimationFrame 推進 hoverPhase 並重繪。
     */
    _startHoverAnimation() {
        const step = () => {
            // 無 hover → 停止迴圈（避免空轉）
            if (this.state.hoveredAnnotationIndex < 0) {
                this.state.hoverRafId = -1;
                return;
            }
            // 以時間而非影格數推進，確保不同螢幕更新率下閃爍速度一致
            const now = (typeof performance !== 'undefined' && performance.now)
                ? performance.now() : Date.now();
            if (this._hoverClockStart == null) this._hoverClockStart = now;
            const elapsed = (now - this._hoverClockStart) / 1000; // 秒
            // 三角波：0→1→0，來回呼吸
            const cycles = elapsed * UICanvas.HOVER_BLINK_HZ;
            const tri = Math.abs((cycles % 2) - 1); // 0..1..0
            this.state.hoverPhase = tri;

            this.render();

            const raf = (typeof requestAnimationFrame !== 'undefined')
                ? requestAnimationFrame : (cb) => setTimeout(() => cb(Date.now()), 16);
            this.state.hoverRafId = raf(step);
        };
        this._hoverClockStart = null;
        const raf = (typeof requestAnimationFrame !== 'undefined')
            ? requestAnimationFrame : (cb) => setTimeout(() => cb(Date.now()), 16);
        this.state.hoverRafId = raf(step);
    },

    /**
     * 停止閃爍動畫並歸零相位（@private）
     */
    _stopHoverAnimation() {
        if (this.state.hoverRafId !== -1) {
            const cancel = (typeof cancelAnimationFrame !== 'undefined')
                ? cancelAnimationFrame : clearTimeout;
            try { cancel(this.state.hoverRafId); } catch (e) { /* 忽略 */ }
            this.state.hoverRafId = -1;
        }
        this._hoverClockStart = null;
        this.state.hoverPhase = -1;
    },

    /**
     * 根據 class_id 反查類別名稱
     * @param {number} classId 標註的類別 ID
     * @param {number} idx 標註索引（fallback 用）
     * @returns {string} 類別名稱或 fallback 字串
     */
    getAnnotationLabel(classId, idx) {
        const labelMap = this.state.labelMap || {};
        if (classId === -1) return 'Unclassified';
        const name = Object.keys(labelMap).find(k => labelMap[k] === classId);
        return name || `Obj ${idx}`;
    },

    /**
     * 決定 bbox 框線的顏色（2026-10-01）。
     *
     * 規則：
     *  - 選取中 → 一律用醒目青色（SELECTED_COLOR），與類別色無關。
     *  - 未選取 → 用注入的 P2 標籤色（UIComponents.getLabelColor），
     *    與 P2 縮圖徽章／統計的顏色一致。
     *  - 未注入取色函式或取色失敗 → 退回舊的單色，避免整個畫布變成無色。
     *
     * @param {string} label 類別名稱
     * @param {boolean} isSelected 是否為目前選取的框
     * @returns {string} CSS 顏色字串
     */
    resolveBoxColor(label, isSelected) {
        if (isSelected) return UICanvas.SELECTED_COLOR;
        if (typeof this.state.getLabelColor !== 'function') return UICanvas.DEFAULT_BOX_COLOR;
        try {
            const color = this.state.getLabelColor(label);
            // getLabelColor 對空值回傳 '#999'；仍防禦一次非空字串，避免 strokeStyle 被設成 undefined。
            return (typeof color === 'string' && color) ? color : UICanvas.DEFAULT_BOX_COLOR;
        } catch (e) {
            return UICanvas.DEFAULT_BOX_COLOR;
        }
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
        this.drawLabelChip(label, px1 + 10, py1 - 5, color, false);
    }
};
