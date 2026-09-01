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
 *
 * Race 防護（2026-09-01，T5-2）：以 promise 記錄每個 URL 的載入狀態。
 * 舊實作只檢查 <script> 是否存在於 DOM——若同一 URL 的 script 仍在載入中
 * （前一次 refreshLocale 剛 append），第二次呼叫會立即 resolve，
 * 導致 refreshI18n() 在新語系鍵值就緒前就重建 UI（顯示舊語系）。
 */
const localeScriptPromises = new Map();

function injectLocaleScript(scriptUrl) {
    const href = scriptUrl.href;
    if (localeScriptPromises.has(href)) {
        return localeScriptPromises.get(href);
    }

    const promise = new Promise((resolve) => {
        const existingScript = document.querySelector(`script[src="${href}"]`);
        if (existingScript) {
            resolve(true);
            return;
        }

        const script = document.createElement('script');
        script.src = href;
        script.onload = () => resolve(true);
        script.onerror = () => {
            localeScriptPromises.delete(href);
            resolve(false);
        };
        document.head.appendChild(script);
    });

    localeScriptPromises.set(href, promise);
    return promise;
}

async function loadI18n() {
    const locale = getPreferredLocale();
    const candidates = getLocaleCandidates(locale);

    for (const candidate of candidates) {
        const scriptUrl = new URL(`./i18n/${candidate}.js`, import.meta.url);
        const loaded = await injectLocaleScript(scriptUrl);
        if (loaded) return;
    }
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
