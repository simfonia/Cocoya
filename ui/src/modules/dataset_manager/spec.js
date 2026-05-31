const SPEC_VERSION = '1.0';

const PROJECT_TYPES = new Set(['image', 'object_detection', 'feature', 'serial', 'table', 'line_following']);
const SOURCE_MODES = new Set(['live', 'file', 'hybrid']);
const COLUMN_TYPES = new Set(['float', 'int', 'string', 'boolean', 'image_path', 'timestamp']);
const COLUMN_ROLES = new Set(['feature', 'label', 'id', 'timestamp', 'metadata', 'ignore']);

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toSafeName(value, fallback = 'dataset') {
    const raw = String(value || '').trim();
    // 嚴格規範：僅保留英數、下劃線與連字號
    const normalized = raw
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '') 
        .replace(/^_+|_+$/g, '');
    return normalized || fallback;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function inferValueType(value) {
    const text = String(value ?? '').trim();
    if (!text) return 'string';
    if (/^(true|false)$/i.test(text)) return 'boolean';
    if (/^-?\d+$/.test(text)) return 'int';
    if (/^-?(?:\d+\.\d+|\d+\.|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || /^-?\d+e[+-]?\d+$/i.test(text)) return 'float';
    if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(text)) return 'image_path';
    if (!Number.isNaN(Date.parse(text)) && /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) return 'timestamp';
    return 'string';
}

function mergeTypes(types) {
    const unique = new Set(types.filter(Boolean));
    if (unique.size === 0) return 'string';
    if (unique.size === 1) return Array.from(unique)[0];
    if (unique.has('string')) return 'string';
    if (unique.has('image_path')) return 'string';
    if (unique.has('timestamp')) return 'string';
    if (unique.has('float') && unique.has('int')) return 'float';
    return 'string';
}

function inferRole(name, type) {
    const lower = String(name || '').toLowerCase();
    if (lower === 'label' || lower === 'class' || lower === 'target') return 'label';
    if (lower === 'id' || lower.endsWith('_id')) return 'id';
    if (lower.includes('time') || type === 'timestamp') return 'timestamp';
    if (type === 'image_path') return 'feature';
    return 'feature';
}

function normalizeLabelMap(labelMap) {
    if (!isPlainObject(labelMap)) return {};
    const normalized = {};
    Object.keys(labelMap).forEach((key) => {
        const cleanKey = String(key).trim();
        if (!cleanKey) return;
        const value = Number(labelMap[key]);
        normalized[cleanKey] = Number.isInteger(value) && value >= 0
            ? value
            : Object.keys(normalized).length;
    });
    return normalized;
}

function normalizeColumn(column) {
    const input = isPlainObject(column) ? column : {};
    const name = String(input.name || '').trim();
    const type = COLUMN_TYPES.has(input.type) ? input.type : 'string';
    const role = COLUMN_ROLES.has(input.role) ? input.role : inferRole(name, type);

    return {
        name,
        type,
        role
    };
}

function normalizeSchema(schema) {
    const input = isPlainObject(schema) ? schema : {};
    const columns = Array.isArray(input.columns)
        ? input.columns.map(normalizeColumn).filter((column) => column.name)
        : [];
    const columnNames = new Set(columns.map((column) => column.name));
    const labelColumn = typeof input.label === 'string'
        ? input.label
        : (columns.find((column) => column.role === 'label') || {}).name || '';
    const features = Array.isArray(input.features)
        ? input.features.filter((name) => typeof name === 'string' && columnNames.has(name))
        : columns
            .filter((column) => column.role === 'feature')
            .map((column) => column.name);

    return {
        columns,
        features,
        label: columnNames.has(labelColumn) ? labelColumn : '',
        label_map: normalizeLabelMap(input.label_map)
    };
}

function normalizeStats(stats) {
    const input = isPlainObject(stats) ? stats : {};
    const sampleCount = Number(input.sample_count);

    return {
        sample_count: Number.isInteger(sampleCount) && sampleCount >= 0 ? sampleCount : 0,
        label_counts: isPlainObject(input.label_counts) ? clone(input.label_counts) : {}
    };
}

export class DatasetSpec {
    constructor(input = {}) {
        const source = isPlainObject(input) ? input : {};
        const project = isPlainObject(source.project) ? source.project : {};
        const dataSource = isPlainObject(source.data_source) ? source.data_source : {};
        const name = toSafeName(project.name || source.name, 'dataset');
        const type = PROJECT_TYPES.has(project.type || source.type) ? (project.type || source.type) : 'table';
        const mode = SOURCE_MODES.has(dataSource.mode || source.mode) ? (dataSource.mode || source.mode) : 'file';

        this.version = source.version || SPEC_VERSION;
        this.project = {
            name,
            type,
            description: String(project.description || source.description || '').trim()
        };
        this.data_source = {
            mode,
            files: Array.isArray(dataSource.files) ? dataSource.files.slice() : [],
            samples: Array.isArray(dataSource.samples) ? clone(dataSource.samples) : [],
            base_dir: String(dataSource.base_dir || `dataset/${name}/`)
        };
        this.schema = normalizeSchema(source.schema);
        this.stats = normalizeStats(source.stats);
    }

    toJSON() {
        return {
            version: this.version,
            project: clone(this.project),
            data_source: clone(this.data_source),
            schema: clone(this.schema),
            stats: clone(this.stats)
        };
    }

    /**
     * Updates the schema part of the spec.
     * @param {Object} newSchema The new schema to merge or replace.
     */
    updateSchema(newSchema) {
        this.schema = normalizeSchema(Object.assign({}, this.schema, newSchema));
    }

    validate() {
        const errors = [];
        const warnings = [];
        const spec = this.toJSON();
        const columnNames = new Set();

        if (spec.version !== SPEC_VERSION) {
            warnings.push(`Unsupported spec version "${spec.version}". Expected "${SPEC_VERSION}".`);
        }
        if (!spec.project.name) {
            errors.push('Project name is required.');
        }
        if (!PROJECT_TYPES.has(spec.project.type)) {
            errors.push(`Project type must be one of: ${Array.from(PROJECT_TYPES).join(', ')}.`);
        }
        if (!SOURCE_MODES.has(spec.data_source.mode)) {
            errors.push(`Data source mode must be one of: ${Array.from(SOURCE_MODES).join(', ')}.`);
        }
        if (!Array.isArray(spec.schema.columns) || spec.schema.columns.length === 0) {
            errors.push('At least one schema column is required.');
        }

        spec.schema.columns.forEach((column, index) => {
            if (!column.name) {
                errors.push(`Column ${index + 1} is missing a name.`);
                return;
            }
            if (columnNames.has(column.name)) {
                errors.push(`Duplicate column name: ${column.name}.`);
            }
            columnNames.add(column.name);
            if (!COLUMN_TYPES.has(column.type)) {
                errors.push(`Column "${column.name}" has invalid type "${column.type}".`);
            }
            if (!COLUMN_ROLES.has(column.role)) {
                errors.push(`Column "${column.name}" has invalid role "${column.role}".`);
            }
        });

        spec.schema.features.forEach((name) => {
            if (!columnNames.has(name)) {
                errors.push(`Feature column "${name}" does not exist in schema.columns.`);
            }
        });

        if (spec.schema.label && !columnNames.has(spec.schema.label)) {
            errors.push(`Label column "${spec.schema.label}" does not exist in schema.columns.`);
        }
        if (!spec.schema.label && spec.project.type !== 'table' && spec.project.type !== 'line_following') {
            warnings.push('No label column is assigned yet.');
        }
        if (spec.schema.features.length === 0 && spec.project.type !== 'image' && spec.project.type !== 'line_following') {
            warnings.push('No feature columns are assigned yet.');
        }

        return {
            ok: errors.length === 0,
            errors,
            warnings
        };
    }

    static createDefault(options = {}) {
        const name = toSafeName(options.name, 'dataset');
        const type = PROJECT_TYPES.has(options.type) ? options.type : 'table';
        const mode = SOURCE_MODES.has(options.mode) ? options.mode : 'file';

        return new DatasetSpec({
            project: {
                name,
                type,
                description: options.description || ''
            },
            data_source: {
                mode,
                files: [],
                base_dir: `dataset/${name}/`
            },
            schema: {
                columns: [],
                features: [],
                label: '',
                label_map: {}
            },
            stats: {
                sample_count: 0,
                label_counts: {}
            }
        });
    }

    static detectSchema(sampleRows = []) {
        const rows = Array.isArray(sampleRows) ? sampleRows.filter(isPlainObject) : [];
        const names = [];
        const seen = new Set();

        rows.forEach((row) => {
            Object.keys(row).forEach((name) => {
                if (!seen.has(name)) {
                    seen.add(name);
                    names.push(name);
                }
            });
        });

        const columns = names.map((name) => {
            const valueTypes = rows
                .map((row) => row[name])
                .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
                .map(inferValueType);
            const type = mergeTypes(valueTypes);
            return normalizeColumn({
                name,
                type,
                role: inferRole(name, type)
            });
        });
        const label = (columns.find((column) => column.role === 'label') || {}).name || '';

        return {
            columns,
            features: columns
                .filter((column) => column.role === 'feature')
                .map((column) => column.name),
            label,
            label_map: {}
        };
    }

    static normalizeColumn(column) {
        return normalizeColumn(column);
    }

    /**
     * Parses CSV text into an array of objects.
     * Supports quotes, commas within fields, and escaped quotes.
     * @param {string} text CSV content
     * @returns {Array<Object>}
     */
    static parseCSV(text) {
        if (!text || typeof text !== 'string') return [];

        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (inQuotes) {
                if (char === '"' && nextChar === '"') {
                    // Escaped quote: "" becomes "
                    currentField += '"';
                    i++;
                } else if (char === '"') {
                    // End of quoted field
                    inQuotes = false;
                } else {
                    currentField += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    currentRow.push(currentField.trim());
                    currentField = '';
                } else if (char === '\r' || char === '\n') {
                    if (currentField || currentRow.length > 0) {
                        currentRow.push(currentField.trim());
                        rows.push(currentRow);
                        currentField = '';
                        currentRow = [];
                    }
                    if (char === '\r' && nextChar === '\n') i++; // Skip \n
                } else {
                    currentField += char;
                }
            }
        }

        // Push last row if exists
        if (currentField || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            rows.push(currentRow);
        }

        if (rows.length < 2) return [];

        const headers = rows[0];
        const result = [];

        for (let i = 1; i < rows.length; i++) {
            const currentLine = rows[i];
            if (currentLine.length !== headers.length) continue;

            const obj = {};
            headers.forEach((header, index) => {
                let val = currentLine[index];
                // Handle numeric conversion
                if (val !== '' && !isNaN(val)) {
                    val = val.includes('.') ? parseFloat(val) : parseInt(val, 10);
                }
                obj[header] = val;
            });
            result.push(obj);
        }

        return result;
    }

}

export const DatasetSpecConstants = {
    SPEC_VERSION,
    PROJECT_TYPES: Array.from(PROJECT_TYPES),
    SOURCE_MODES: Array.from(SOURCE_MODES),
    COLUMN_TYPES: Array.from(COLUMN_TYPES),
    COLUMN_ROLES: Array.from(COLUMN_ROLES)
};
