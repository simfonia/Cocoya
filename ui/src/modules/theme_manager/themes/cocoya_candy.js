/**
 * Cocoya 糖果繽紛主題（活潑多色）
 * 純資料定義：配色全部走 cssVars 與 Blockly Theme，不動 style.css
 */
(function() {
    'use strict';
    if (!window.CocoyaTheme) return;
    window.CocoyaTheme.registerTheme({
        id: 'cocoya_candy',
        labelKey: 'BKY_THEME_CANDY',
        labelFallback: 'Candy Pop',
        isDark: false,
        hideGrid: false,
        blockly: {
            name: 'cocoya_candy',
            componentStyles: {
                'workspaceBackgroundColour': '#FFF8F0',
                'toolboxBackgroundColour':   '#FFE9F3',
                'toolboxTextColour':         '#8A4A6A',
                'flyoutBackgroundColour':    '#FFF0F7',
                'flyoutTextColour':          '#8A4A6A',
                'scrollbarColour':           '#FFB0D8',
                'insertionMarkerColour':     '#FE2F89',
                'insertionMarkerOpacity':    0.35,
                'scrollbarOpacity':          0.5,
                'cursorColour':              '#FE2F89'
            }
        },
        msgColours: {
            'STRUCTURE': '#8A7F70', 'LOGIC': '#8E7CF8', 'LOOPS': '#4ECDC4',
            'MATH': '#FFB347', 'TEXT': '#7ED957', 'TYPES': '#FFD166',
            'VARIABLES': '#FF8FB1', 'FUNCTIONS': '#B983FF', 'IO': '#45B7D1',
            'TIME': '#6FCF97', 'CODING': '#C084FC', 'AI': '#FF6B9D',
            'AI_BASIC': '#FF8FA3', 'AI_DRAW': '#F9C74F', 'AI_HAND': '#90E0A0',
            'AI_FACE': '#56CFE1', 'AI_POSE': '#C77DFF', 'AI_INFERENCE': '#E07BE0',
            'HARDWARE': '#7B9EF8', 'MCU_CAMERA': '#FF7AA2', 'HUSKYLENS': '#5BC8AF',
            'MCU_CAR': '#FF9770', 'MCU_CAR_MOTOR': '#FFB26B', 'MCU_CAR_SERVO': '#CBA6F7',
            'MCU_CAR_MUSIC': '#F49AC2', 'MCU_CAR_LED': '#89CFF0', 'MCU_CAR_SENSOR': '#B5E48C',
            'MCU_CAR_BUTTON': '#76C893'
        },
        cssVars: {
            '--cocoya-overlay': '#FFF8F0',
            '--cocoya-surface': '#FFFFFF',
            '--cocoya-fg': '#8A4A6A',
            '--cocoya-border': '#FFD0E8',
            '--cocoya-hover': '#FFEFF7',
            '--bg-color': '#FFF8F0',
            '--toolbar-bg': '#FFE9F3',
            '--toolbar-border': '#FFC0E0',
            '--code-bg': '#FFFDF7',
            '--code-header-bg': '#FFEFF7',
            '--code-border': '#FFD0E8',
            '--text-primary': '#6A4A8C',
            '--text-secondary': '#B08AC0',
            /* Dataset Manager tokens（Stage 5 切片 5：使用 candy 既有色彩）*/
            '--dsm-brand': '#FE2F89',
            '--dsm-brand-soft': 'rgba(254, 47, 137, 0.15)',
            '--dsm-brand-strong': 'rgba(254, 47, 137, 0.3)',
            '--dsm-text': '#8A4A6A',
            '--dsm-text-secondary': '#B08AC0',
            '--dsm-text-muted': '#B08AC0',
            '--dsm-border-light': '#FFD0E8',
            '--dsm-border-strong': '#FFC0E0',
            '--dsm-surface': '#FFF8F0',
            '--dsm-surface-alt': '#FFEFF7',
            '--dsm-input-bg': '#FFFFFF',
            '--dsm-btn-bg': '#FFEFF7',
            '--dsm-btn-hover-bg': '#FFE3F0',
            '--dsm-code-bg': '#FFFDF7',
            '--dsm-message-bg': '#FFE9F3',
            '--dsm-message-border': '#FFC0E0',
            '--dsm-message-text': '#8A4A6A',
            '--dsm-disabled-bg': '#FFEFF7',
            '--dsm-disabled-text': '#B08AC0',
            '--dsm-disabled-border': '#FFD0E8',
            '--dsm-list-item-bg': '#FFE3F0',
            '--dsm-success-bg': '#FFEFF7',
            '--dsm-success-border': '#FFC0E0',
            '--dsm-success-text': '#8A4A6A',
            '--dsm-success-accent': '#FE2F89',
            '--dsm-error-bg': '#FFF0F0',
            '--dsm-warning-bg': '#FFE8F0'
        }
    });
})();
