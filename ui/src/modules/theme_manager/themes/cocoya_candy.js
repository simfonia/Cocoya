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
            '--text-secondary': '#B08AC0'
        }
    });
})();
