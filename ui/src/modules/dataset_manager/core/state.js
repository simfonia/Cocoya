function cloneState(state) {
    return Object.assign({}, state, {
        images: Array.isArray(state.images) ? state.images.slice() : [],
        tableRows: Array.isArray(state.tableRows) ? state.tableRows.slice() : [],
        annotationMode: Object.assign({}, state.annotationMode || {})
    });
}

export function createInitialDatasetState(spec) {
    return {
        spec,
        isOpen: false,
        images: [],
        tableRows: [],
        sourceFolderPath: null,
        _savedGridScrollTop: 0,
        annotationMode: {
            isActive: false,
            currentIndex: -1,
            mode: null,
            saveTimer: null,
            originalBodyClass: null
        }
    };
}

export class DatasetStore {
    constructor(initialState) {
        this.state = cloneState(initialState);
        this.listeners = new Set();
    }

    getState() {
        return this.state;
    }

    subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    replace(nextState) {
        this.state = cloneState(nextState);
        this.listeners.forEach((listener) => listener(this.state));
        return this.state;
    }

    update(patch) {
        const nextState = Object.assign({}, this.state, patch || {});
        return this.replace(nextState);
    }
}
