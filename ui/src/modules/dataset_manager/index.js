import { DatasetSpec, DatasetSpecConstants } from './spec.js';
import { Sampler } from './sampler.js';
import {
    closeDatasetManager,
    getCurrentDatasetSpec,
    initDatasetManagerUI,
    openDatasetManager,
    toggleDatasetManager,
    removeAnnotation,
    refreshDynamicPanels,
    refreshPreview,
    refreshI18n
} from './ui_layout.js';
import { UIComponents } from './ui_components.js';
import { UICanvas } from './ui_canvas.js';

const namespace = window.CocoyaDataset || {};

function getPreferredLocale() {
    const app = window.CocoyaApp || {};
    const candidates = [
        app.currentLang,
        app.config && app.config.currentLang,
        window.Blockly && window.Blockly.Msg && window.Blockly.Msg['BKY_LANG'],
        window.Blockly && window.Blockly.Msg && window.Blockly.Msg['LANGUAGE'],
        window.navigator && window.navigator.language,
        window.navigator && window.navigator.languages && window.navigator.languages[0]
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            const normalized = candidate.trim().toLowerCase().replace(/_/g, '-');
            if (normalized.startsWith('zh')) return 'zh-hant';
            if (normalized.startsWith('en')) return 'en';
            return normalized;
        }
    }

    return 'zh-hant';
}

function getLocaleCandidates(locale) {
    const normalized = String(locale || 'zh-hant').trim().toLowerCase().replace(/_/g, '-');
    const base = normalized.split('-')[0];
    const candidates = [normalized, base, 'en', 'zh-hant'];

    if (normalized.startsWith('zh') || base === 'zh') {
        candidates.push('zh-hant');
    }
    if (normalized.startsWith('en') || base === 'en') {
        candidates.push('en');
    }

    return [...new Set(candidates.filter(Boolean))];
}

/**
 * 動態載入 Dataset Manager i18n 語系檔
 * 依目前應用語系設定載入對應的 i18n 腳本，並支援回退
 */
async function loadI18n() {
    const locale = getPreferredLocale();
    const candidates = getLocaleCandidates(locale);

    return new Promise((resolve) => {
        const tryLoad = (index) => {
            if (index >= candidates.length) {
                resolve();
                return;
            }

            const candidate = candidates[index];
            const scriptUrl = new URL(`./i18n/${candidate}.js`, import.meta.url);
            const existingScript = document.querySelector(`script[src="${scriptUrl.href}"]`);
            if (existingScript) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = scriptUrl.href;
            script.onload = () => resolve();
            script.onerror = () => tryLoad(index + 1);
            document.head.appendChild(script);
        };

        tryLoad(0);
    });
}

function createSpec(options = {}) {
    return DatasetSpec.createDefault(options);
}

function detectSchema(sampleRows = []) {
    return DatasetSpec.detectSchema(sampleRows);
}

function validateSpec(input) {
    const spec = input instanceof DatasetSpec ? input : new DatasetSpec(input);
    return spec.validate();
}

async function init() {
    // 先載入 i18n，確保 Blockly.Msg 中的 DSM_* 鍵值就緒
    await loadI18n();
    Sampler.init();
    initDatasetManagerUI();
    return window.CocoyaDataset;
}

async function refreshLocale() {
    await loadI18n();
    return refreshI18n();
}

window.CocoyaDataset = Object.assign(namespace, {
    version: '0.1.0',
    DatasetSpec,
    constants: DatasetSpecConstants,
    init,
    refreshI18n: refreshLocale,
    createSpec,
    detectSchema,
    validateSpec,
    open: openDatasetManager,
    close: closeDatasetManager,
    toggle: toggleDatasetManager,
    getCurrentSpec: getCurrentDatasetSpec,
    removeAnnotation: removeAnnotation,
    refreshDynamicPanels: refreshDynamicPanels,
    refreshPreview: refreshPreview
});

init();

export {
    DatasetSpec,
    DatasetSpecConstants,
    createSpec,
    detectSchema,
    validateSpec,
    init,
    refreshLocale as refreshI18n
};
