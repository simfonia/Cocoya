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
    refreshPreview
} from './ui_layout.js';

const namespace = window.CocoyaDataset || {};

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

function init() {
    Sampler.init();
    initDatasetManagerUI();
    return window.CocoyaDataset;
}

window.CocoyaDataset = Object.assign(namespace, {
    version: '0.1.0',
    DatasetSpec,
    constants: DatasetSpecConstants,
    init,
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
    init
};
