/// Cocoya 序列繪圖 — 面板控制器
/// 職責：管理左右分欄的開闔、繪圖排程、圖例渲染、分隔條拖曳與窄視窗降級。
/// 位置：ui/src/modules/plot/plot-panel.js
///
/// # 佈局決策：為什麼是「左右分欄」而不是切頁
///
/// 高中生在除錯時需要**同時**確認兩件事：程式有沒有印出預期的字（文字），
/// 以及數值變化是否合理（曲線）。Arduino IDE 2.0 的 Plotter 是獨立視窗，
/// 但對教學場景來說多一個視窗就多一份「視窗被我關掉了」的心智負擔。
/// 因此開啟繪圖時把終端機面板**垂直分成左右兩欄**：左＝Monitor 文字、
/// 右＝Plotter 波形。
///
/// # 為什麼要自動撐高
///
/// 終端機預設 200px。扣掉標題列（32）、序列控制列（~28）與輸入行（~28）後，
/// canvas 只剩約 110px，折線會被壓成看不出波形的一條線。
/// 因此開啟繪圖時若高度不足就自動撐到 320px，關閉時還原。
///
/// # 為什麼「自動撐高」與「使用者拖曳的高度」必須分開記錄
///
/// 若直接呼叫 `setHeight(320)`，使用者辛苦拖到 500px 的高度就被改掉了；
/// 反之若在關閉時無條件還原，使用者在開繪圖期間手動調到 400px 也會被還原成
/// 200px。兩者都會讓使用者覺得「面板在跟我作對」。
/// 因此只有**當我們自己執行過自動撐高**時才在關閉時還原，且只還原一次。

var CocoyaPlotPanel = (function() {
    'use strict';

    /// 開啟繪圖時的最小可用高度。
    var MIN_PLOT_HEIGHT = 320;

    /// 低於此寬度時兩欄各剩一點都用不了 → 改成上下堆疊。
    var STACK_BREAKPOINT = 560;

    /// 分隔條可讓任一欄縮到這麼小（再小文字就無法閱讀）。
    var MIN_PANE_WIDTH = 260;

    var open = false;
    var paused = false;
    /// 是否由我們執行過自動撐高（決定關閉時要不要還原）。
    var autoRaised = false;
    /// 自動撐高前的原始高度；null 代表原本就是 CSS 預設值。
    var restoreHeight = null;
    var listeners = [];
    var frameHandle = null;

    var store = null;
    var parser = null;
    var renderer = null;

    function byId(id) {
        return typeof document === 'undefined' ? null : document.getElementById(id);
    }

    /// 序列埠監看狀態的 Cocoya 適配器。
    ///
    /// **為何要一層適配**：Cocoya 沒有獨立的 `CocoyaSerialMonitor` 物件，
    /// 序列埠狀態由 `CocoyaUI` 持有（`setSerialMonitorState`，由 bridge 的
    /// `serial-monitor-state` 事件驅動，見 `ui/src/ui/hardware.js`）。
    /// 本模組只需要三個欄位，故在此收斂成最小介面，
    /// 避免 plot 模組反向依賴 UI 層的內部欄位命名。
    function monitor() {
        var ui = (typeof window !== 'undefined') ? window.CocoyaUI : null;
        if (!ui) return null;
        return {
            getState: function() {
                return {
                    // Cocoya 的 Serial Raw Dump 是**寫檔**（`<ProjectRoot>/raw_dump.log`），
                    // 不是把顯示切成 HEX —— 沒有 CodeBridge 的「HEX 模式」語意，
                    // 故 hex 恆為 false。
                    hex: false,
                    connected: !!ui._serialMonitorConnected,
                    // Cocoya 的上傳流程會 stop_python（連帶釋放 monitor），
                    // 沒有「上傳中暫停、稍後續畫」這個中間態。
                    pausedForUpload: false
                };
            },
            isActive: function() { return !!ui._serialMonitorActive; },
            start: function() { ensureSerialMonitor(); }
        };
    }

    /// 終端機面板高度控制的 Cocoya 適配器。
    ///
    /// Cocoya 沒有 `CocoyaTerminalPanel` 控制器（高度由 `terminal.js` 的
    /// 拖曳直接寫 `#terminalArea.style.height`），故就地以該元素實作。
    /// `px === null` 代表移除 inline height（回到 CSS 預設 200px），
    /// 與 CodeBridge `restoreHeight` 的語意一致。
    function terminalPanel() {
        return {
            setHeight: function(px) {
                var area = byId('terminalArea');
                if (!area) return;
                var next = Number(px);
                if (px === null || px === undefined || !(next > 0)) {
                    area.style.removeProperty('height');
                } else {
                    area.style.height = next + 'px';
                }
            },
            notifyWorkspaceResize: function() {
                // 2026-10-10 版面重構後終端機是 #container 的直屬 flex 子項（底部），
                // 不再位於 #blocklyArea 內部；但中段 workbench 仍是 flex:1，
                // 高度變化仍須讓 Blockly 重算，否則畫布底部會被切掉。
                setTimeout(function() {
                    if (window.Blockly && typeof Blockly.svgResize === 'function'
                        && typeof Blockly.getMainWorkspace === 'function') {
                        Blockly.svgResize(Blockly.getMainWorkspace());
                    }
                }, 310);
            }
        };
    }

    /// 代為啟動序列埠監看（繪圖與監看共用同一條連線）。
    ///
    /// 刻意**直接觸發 `#btn-serial-monitor` 的 onclick**，而不是在此複製
    /// `toggleSerialMonitor` 的 invoke 參數組裝：port / pythonPath /
    /// rawDumpEnabled 的決定權在 `ui/src/ui/base.js`，複製一份會讓兩邊
    /// 漂移（例如 rawDump 偏好改成走 CocoyaSettings 時只改到一邊）。
    function ensureSerialMonitor() {
        var serial = monitor();
        if (serial && serial.isActive && serial.isActive()) return;
        var btn = byId('btn-serial-monitor');
        if (btn && typeof btn.onclick === 'function') btn.onclick();
    }

    function text(key, fallback) {
        // Cocoya 的 i18n SSOT 是 Blockly.Msg（`ui/src/zh-hant.js` / `en.js`），
        // 沒有 CodeBridge 的全域 `getI18n()`。
        if (typeof window !== 'undefined' && window.Blockly && Blockly.Msg && Blockly.Msg[key]) {
            return Blockly.Msg[key];
        }
        return fallback || key;
    }

    /// 依賴注入點：測試與載入順序都靠它取得模組。
    function parseModule() { return window.CocoyaPlotParse; }
    function storeModule() { return window.CocoyaPlotStore; }
    function renderModule() { return window.CocoyaPlotRender; }

    function ensureCore() {
        if (store) return true;
        if (!parseModule() || !storeModule() || !renderModule()) return false;
        parser = parseModule().createParser();
        store = storeModule().createStore();
        return true;
    }

    function getState() {
        var defaults = storeModule() ? storeModule().DEFAULT_WINDOW : 600;
        var state = {
            open: open,
            paused: paused,
            autoRaised: autoRaised,
            windowSize: store ? store.getState().windowSize : defaults,
            sampleCount: 0,
            seriesCount: 0,
            series: [],
            droppedLines: 0
        };
        if (store) {
            var inner = store.getState();
            state.sampleCount = inner.sampleCount;
            state.seriesCount = inner.seriesCount;
            state.droppedLines = inner.droppedLines;
            state.series = store.seriesList().map(function(series) {
                return { label: series.label, visible: series.visible };
            });
        }
        return state;
    }

    function onChange(listener) {
        if (typeof listener !== 'function') return;
        listeners.push(listener);
    }

    function emit() {
        var snapshot = getState();
        listeners.forEach(function(listener) {
            try { listener(snapshot); } catch (error) { /* 訂閱者錯誤不得影響面板 */ }
        });
    }

    /// 排程一幀後重繪。
    ///
    /// **為什麼需要 rAF**：序列埠最高可達數百 Hz，若每次資料事件都同步重畫，
    /// 主執行緒會被 canvas 填補操作塞滿，導致 Blockly 工作區的拖曳開始卡頓。
    /// rAF 會把同一幀內的所有請求合併成一次重畫。
    function scheduleDraw() {
        if (frameHandle !== null) return;
        var raf = (typeof requestAnimationFrame === 'function')
            ? requestAnimationFrame
            : function(callback) { return setTimeout(callback, 16); };
        frameHandle = raf(function() {
            frameHandle = null;
            draw();
        });
    }

    function draw() {
        if (!open || !store || !renderer) return false;
        var canvas = byId('plotCanvas');
        if (!canvas) return false;
        // 每幀重測尺寸：分隔條拖曳與視窗縮放都會改變版面。
        renderer.resize();
        var size = renderer.getSize();
        var windowState = store.getState();
        var drawn = renderer.draw(store.window(windowState.windowSize, size.width));
        renderLegend();
        syncStatus();
        return drawn;
    }

    // ---------------------------------------------------------------
    // 圖例
    // ---------------------------------------------------------------

    function renderLegend() {
        var host = byId('plotLegend');
        if (!host || !store) return;
        var series = store.seriesList();
        // 只有變動時才重建 DOM：資料事件可達數百 Hz，
        // 每次都重建圖例會讓畫面閃爍並拖慢整個面板。
        var signature = series.map(function(item) {
            return item.label + (item.visible ? ':1' : ':0');
        }).join('|');
        if (host.getAttribute('data-signature') === signature) return;
        host.setAttribute('data-signature', signature);
        while (host.firstChild) host.removeChild(host.firstChild);

        series.forEach(function(item) {
            var chip = document.createElement('button');
            chip.type = 'button';
            // 圖例是「色塊 + 文字」雙重編碼，不單靠顏色辨識（色盲友善）。
            chip.className = 'plot-legend-item' + (item.visible ? '' : ' is-off');
            var swatch = document.createElement('span');
            swatch.className = 'plot-legend-swatch';
            if (renderer) swatch.style.background = renderer.colorFor(item.label);
            var label = document.createElement('span');
            label.className = 'plot-legend-label';
            label.textContent = item.label;
            chip.appendChild(swatch);
            chip.appendChild(label);
            chip.setAttribute('data-plot-series', item.label);
            chip.addEventListener('click', function() { toggleSeries(item.label); });
            host.appendChild(chip);
        });
    }

    function toggleSeries(label) {
        if (!store) return false;
        var visible = store.toggleVisible(label);
        renderLegend();
        scheduleDraw();
        emit();
        return visible;
    }

    // ---------------------------------------------------------------
    // 資料流入
    // ---------------------------------------------------------------

    function handleDataLine(line) {
        // 關閉時不收集：記憶體與 CPU 都沒有必要為看不見的畫面付出。
        if (!open || paused) return 0;
        if (!ensureCore()) return 0;
        var serial = monitor();
        // HEX 顯示的是位元組串（`48 65 6C`），解析沒有意義，
        // 而且會把圖表畫成滿版雜訊。交由 UI 顯示提示即可。
        //
        // Cocoya 適配器的 hex 恆為 false：本專案的 Serial Raw Dump 是**寫檔**
        // （`<ProjectRoot>/raw_dump.log`），不是把終端機顯示切成 HEX，
        // 故不存在「HEX 模式」。保留此判斷是為了不更動 CodeBridge 的純函式結構。
        if (serial && serial.getState && serial.getState().hex) return 0;
        var points = parser.parseLine(line);
        if (points.length === 0) return 0;
        var stored = store.push(points, Date.now());
        if (stored > 0) {
            // 圖例**同步**更新，不跟著 rAF 走：它反映的是資料結構的變化，
            // 晚一幀出現會讓使用者以為「資料進來了但沒畫出來」。
            // 只有 canvas 重繪才需要 rAF 節流。
            renderLegend();
            syncStatus();
            scheduleDraw();
            emit();
        }
        return stored;
    }

    /// 監看狀態變化（HEX 切換、斷線等）。
    function handleMonitorChange() {
        if (!open) return;
        scheduleDraw();
    }

    function syncStatus() {
        var status = byId('plot-status');
        if (!status) return;
        var serial = monitor();
        var state = serial && serial.getState ? serial.getState() : null;
        if (!open) {
            status.textContent = '';
            status.setAttribute('data-tone', 'idle');
            return;
        }
        if (state && state.hex) {
            status.textContent = text('PLOT_HEX_HINT', 'HEX 模式下不繪圖，請關閉 HEX');
            status.setAttribute('data-tone', 'warn');
            return;
        }
        if (state && !state.connected) {
            status.textContent = state.pausedForUpload
                ? text('PLOT_PAUSED_UPLOAD', '上傳中暫停，稍後自動續畫')
                : text('PLOT_WAITING', '等待資料…');
            status.setAttribute('data-tone', 'idle');
            return;
        }
        var inner = store ? store.getState() : null;
        status.textContent = inner && inner.sampleCount === 0
            ? text('PLOT_WAITING', '等待資料…')
            : '';
        status.setAttribute('data-tone', 'idle');
    }

    // ---------------------------------------------------------------
    // 開闔與版面
    // ---------------------------------------------------------------

    function bodyElement() { return byId('terminalBody'); }
    function plotPane() { return byId('plotPane'); }

    /// 依容器寬度套用左右分欄或上下堆疊。
    ///
    /// **為什麼需要降級**：視窗很窄時兩欄各剩一點，
    /// 左邊文字被擠到換行、右邊曲線只剩幾個像素，兩邊都不能用。
    function syncLayout() {
        var body = bodyElement();
        if (!body) return;
        body.classList.toggle('is-split', open);
        var pane = plotPane();
        if (pane) pane.style.display = open ? 'flex' : 'none';
        if (!open) {
            body.classList.remove('is-stacked');
            return;
        }
        var stacked = Number(body.offsetWidth) > 0
            && Number(body.offsetWidth) < STACK_BREAKPOINT;
        body.classList.toggle('is-stacked', stacked);
    }

    /// 開啟繪圖：分欄 + 必要時自動撐高 + 確保有資料來源。
    function openPlot() {
        if (open) return true;
        if (!ensureCore()) return false;
        var canvas = byId('plotCanvas');
        if (canvas && !renderer) renderer = renderModule().createRenderer(canvas);

        open = true;
        // 解析器的「上一個標籤」是跨連線的狀態，開新面板要清掉，
        // 否則新連線的純數值會沿用舊連線的 series 名稱。
        if (parser) parser.reset();

        raiseForPlot();
        syncLayout();
        // 開關鈕的啟用樣式與文字要在這裡同步。
        // 少了這行，按鈕不會反映「已開啟」—— 使用者看起來就是
        // 「按了沒反應、功能也沒開」，實際上功能正常只是按鈕沒變色。
        syncControls();
        bindControls();
        // 繪圖與監看共用同一條序列連線：使用者只想看圖時，
        // 不該還得再按一次「開啟監視器」。
        //
        // 判據用 `isActive()`（後端 session 是否持有該埠）而非 `getState().connected`：
        // 後者為 false 的時機包含「active 但正在等重連」，此時再 start 會把
        // 好的 session 停掉重開（白等一次 400ms 冷卻）。
        var serial = monitor();
        if (serial && typeof serial.isActive === 'function' && !serial.isActive()) {
            if (typeof serial.start === 'function') serial.start({});
        }
        scheduleDraw();
        emit();
        return true;
    }

    /// 高度不足時自動撐高，記住原值以便還原。
    function raiseForPlot() {
        if (autoRaised) return;
        var panel = terminalPanel();
        if (!panel || typeof panel.setHeight !== 'function') return;
        var area = byId('terminalArea');
        var current = area ? Number(area.offsetHeight) || 0 : 0;
        // 已經夠高（使用者自己拖過）就完全不動 —— 尊重使用者的版面選擇。
        if (current >= MIN_PLOT_HEIGHT) return;
        restoreHeight = current > 0 ? current : null;
        autoRaised = true;
        panel.setHeight(MIN_PLOT_HEIGHT);
        notifyWorkspaceResize();
    }

    function restoreHeightIfNeeded() {
        if (!autoRaised) return;
        autoRaised = false;
        var panel = terminalPanel();
        if (panel && typeof panel.setHeight === 'function') {
            // null 會讓終端機面板改回 CSS 預設值（移除 inline style）。
            panel.setHeight(restoreHeight);
        }
        restoreHeight = null;
        notifyWorkspaceResize();
    }

    /// 終端機面板位於 `#blocklyArea` 內部，改變高度必須讓 Blockly 重算。
    ///
    /// 走 `terminal-panel` 提供的 `notifyWorkspaceResize()`（若存在），
    /// 否則退回全域鉤子 —— 由 main.js 在啟動時注入。
    /// 不可自己直接呼叫 `Blockly.svgResize`：那會讓本模組與 Blockly 產生
    /// 不必要的相依，且單元測試環境沒有 Blockly。
    function notifyWorkspaceResize() {
        var panel = terminalPanel();
        if (panel && typeof panel.notifyWorkspaceResize === 'function') {
            panel.notifyWorkspaceResize();
            return;
        }
        if (typeof window.CocoyaPlotPanelNotifyResize === 'function') {
            window.CocoyaPlotPanelNotifyResize();
        }
    }

    function closePlot() {
        if (!open) return false;
        open = false;
        paused = false;
        syncLayout();
        restoreHeightIfNeeded();
        // **必須是 syncControls() 而非只 syncStatus()**：
        // syncControls 才會把 `is-active` 從開關鈕上移除。
        // 只呼叫 syncStatus 的話，按鈕會一直停在「已開啟」的樣式 ——
        // 這正是使用者回報「按鈕狀態沒有正常切換」的原因。
        // （`syncControls` 內部已包含 `syncStatus`。）
        syncControls();
        emit();
        return true;
    }

    function toggle() {
        return open ? closePlot() : openPlot();
    }

    function clear() {
        if (!store) return false;
        store.clear();
        if (parser) parser.reset();
        if (renderer) renderer.clear();
        scheduleDraw();
        emit();
        return true;
    }

    /// 暫停／繼續收集資料。
    ///
    /// 暫停是**凍結畫面**而不是清空資料：使用者暫停是要比較兩段波形，
    /// 清掉資料就失去意義了。
    function togglePause() {
        paused = !paused;
        syncControls();
        if (!paused) scheduleDraw();
        emit();
        return paused;
    }

    function setWindow(size) {
        if (!ensureCore()) return false;
        var applied = store.setWindow(size);
        var select = byId('plotWindowSelect');
        if (select) select.value = String(applied);
        scheduleDraw();
        emit();
        return applied;
    }
    // ---------------------------------------------------------------
    // 控制列與初始化
    // ---------------------------------------------------------------

    /// 依狀態同步控制列外觀（開關鈕、暫停鈕、視窗長度下拉）。
    function syncControls() {
        // **用 `is-active` class 而非 `data-active` 屬性**：
        // `presets.css` 的啟用樣式（`.terminal-tool-btn.is-active`）走語意 token
        //（`--cb-primary`），而舊的 `[data-active="true"]` 選擇器寫死在
        // `style.css` 裡的深綠 `#2d6a2d`。
        //
        // 差別在 Angel（candy-light）preset 下才看得出來：硬編碼的深綠
        // 加上硬編碼的淺色文字（`.serial-toggle-btn { color: #e0e0e0 }`）
        // 落在淺色面板上幾乎看不見 —— 使用者會說「按鈕狀態沒有切換」，
        // 但 `data-active` 屬性確實有變。統一走 class 後兩個 preset 都有正確對比。
        //
        // 同時補 `aria-pressed`：這是 toggle button 的標準屬性，
        // 螢幕閱讀器據此播報「已按下／未按下」，不只靠顏色表達狀態。
        var toggle = byId('btn-plotter');
        if (toggle) {
            toggle.classList.toggle('is-active', open);
            toggle.setAttribute('aria-pressed', open ? 'true' : 'false');
            var label = text(open ? 'PLOT_CLOSE' : 'PLOT_OPEN', open ? '關閉繪圖' : '開啟繪圖');
            // **只寫 title，不可寫 textContent**：此鈕是 icon-only（內含 <img>），
            // `textContent = label` 會把 img 節點整個替換成文字 —— 按鈕從此變成空白框，
            // 且**沒有任何錯誤訊息**（程式碼看起來完全正常）。
            // 狀態因此由三處冗餘編碼表達（符合「不單靠顏色」的可讀性原則）：
            //   ① .is-active 底色（Cocoya 品牌色）
            //   ② img opacity（未啟用時淡，啟用時全亮）
            //   ③ title 文案（PLOT_OPEN ↔ PLOT_CLOSE）與 aria-pressed
            toggle.title = label;
        }
        var pauseButton = byId('btn-plot-pause');
        if (pauseButton) {
            pauseButton.classList.toggle('is-paused', paused);
            pauseButton.setAttribute('aria-pressed', paused ? 'true' : 'false');
            var pauseLabel = text(paused ? 'PLOT_RESUME' : 'PLOT_PAUSE', paused ? '繼續' : '暫停');
            pauseButton.textContent = pauseLabel;
            pauseButton.title = pauseLabel;
        }
        var select = byId('plotWindowSelect');
        if (select && store) select.value = String(store.getState().windowSize);
        var clearButton = byId('btn-plot-clear');
        if (clearButton) {
            var clearLabel = text('PLOT_CLEAR', '清除');
            clearButton.textContent = clearLabel;
            clearButton.title = clearLabel;
        }
        syncStatus();
    }

    /// 填入視窗長度選項（3 / 10 / 30 秒，值與 store 的常數一致）。
    function renderWindowOptions() {
        var select = byId('plotWindowSelect');
        if (!select || select.__plotOptionsRendered || !storeModule()) return;
        select.__plotOptionsRendered = true;
        while (select.firstChild) select.removeChild(select.firstChild);
        storeModule().WINDOW_CHOICES.forEach(function(value) {
            var option = document.createElement('option');
            option.value = String(value);
            // 秒數只是呈現，值仍是點數 —— 兩者不可混為一談。
            option.textContent = String(Math.round(value / 60)) + 's';
            select.appendChild(option);
        });
    }

    /// 綁定分隔條拖曳（只在水平分欄時有意義）。
    function bindDivider() {
        var divider = byId('plotDivider');
        if (!divider || divider.__plotBound) return;
        divider.__plotBound = true;
        var dragging = false;
        var startX = 0;
        var startFlex = 0;

        function onMouseDown(event) {
            var body = bodyElement();
            if (!body || body.classList.contains('is-stacked')) return;
            dragging = true;
            startX = event.clientX || 0;
            var left = byId('terminalTextPane');
            startFlex = left ? Number(left.offsetWidth) || 0 : 0;
            divider.setAttribute('data-dragging', 'true');
            if (event.preventDefault) event.preventDefault();
        }

        function onMouseMove(event) {
            if (!dragging) return;
            var body = bodyElement();
            var total = Number(body.offsetWidth) || 0;
            if (total <= 0) return;
            // 右欄也要保底寬度：左欄吃光等於關掉繪圖。
            var next = startFlex + ((event.clientX || 0) - startX);
            var maxLeft = total - MIN_PANE_WIDTH;
            next = Math.max(MIN_PANE_WIDTH, Math.min(maxLeft, next));
            body.style.setProperty('--plot-left-width', next + 'px');
            scheduleDraw();
        }

        function onMouseUp() {
            if (!dragging) return;
            dragging = false;
            divider.setAttribute('data-dragging', 'false');
        }

        divider.addEventListener('mousedown', onMouseDown);
        if (typeof document !== 'undefined') {
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
    }

    /// 綁定控制列（冪等，重複 init 不會重複綁）。
    function bindControls() {
        var select = byId('plotWindowSelect');
        if (select && !select.__plotBound) {
            select.__plotBound = true;
            select.addEventListener('change', function() { setWindow(select.value); });
        }
        syncControls();
    }

    function init() {
        // Cocoya 的資料接線在 bridge（`ui/src/bridge/tauri.js` 的 `python-log`
        // listener 依 `_serialMonitorActive` 閘門後呼叫 `handleDataLine`），
        // **不在這裡訂閱**：Cocoya 沒有 `CocoyaSerialMonitor` 這種可訂閱物件。
        // 因此 init 只負責「畫面與控制項就緒」，資料到達時才惰性建立 store。
        renderWindowOptions();
        bindControls();
        bindDivider();
        // 容器寬度變化（視窗縮放、程式預覽面板收合）會影響分欄決策。
        if (typeof ResizeObserver === 'function') {
            var body = bodyElement();
            if (body) {
                var observer = new ResizeObserver(function() {
                    syncLayout();
                    scheduleDraw();
                });
                observer.observe(body);
            }
        }
        syncLayout();
        // **必須呼叫 syncControls**：按鈕的啟用 class 與文字是在這裡初始化的。
        // 少了這行，頁面一載入時按鈕還沒被 sync 過，
        // 狀態會停留在 HTML 的初始樣式（無 is-active）而與實際狀態脫節。
        syncControls();
        return getState();
    }

    return {
        MIN_PLOT_HEIGHT: MIN_PLOT_HEIGHT,
        STACK_BREAKPOINT: STACK_BREAKPOINT,
        init: init,
        open: openPlot,
        close: closePlot,
        toggle: toggle,
        clear: clear,
        togglePause: togglePause,
        toggleSeries: toggleSeries,
        setWindow: setWindow,
        handleDataLine: handleDataLine,
        handleMonitorChange: handleMonitorChange,
        syncLayout: syncLayout,
        syncControls: syncControls,
        getState: getState,
        onChange: onChange,
        /// 僅供單元測試重置模組狀態（不影響 DOM）。
        _reset: function() {
            open = false;
            paused = false;
            autoRaised = false;
            restoreHeight = null;
            listeners = [];
            frameHandle = null;
            store = null;
            parser = null;
            renderer = null;
        }
    };
})();

if (typeof window !== 'undefined') {
    window.CocoyaPlotPanel = CocoyaPlotPanel;
}
