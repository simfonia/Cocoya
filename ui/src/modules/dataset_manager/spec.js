import { t } from './i18n.js';

const SPEC_VERSION = '1.0';

const PROJECT_TYPES = new Set(['image', 'object_detection', 'feature', 'serial', 'table', 'line_following']);
// 影像類專案：schema.columns 為匯入/採集時自動生成，不需使用者手動定義欄位
const IMAGE_TYPES = new Set(['image', 'object_detection', 'line_following']);
const SOURCE_MODES = new Set(['live', 'file', 'hybrid']);
const COLUMN_TYPES = new Set(['float', 'int', 'string', 'boolean', 'image_path', 'timestamp']);
const COLUMN_ROLES = new Set(['feature', 'label', 'id', 'timestamp', 'metadata', 'ignore']);

// R7 表格 samples 落盤上限：dataset.json 內 samples 最多保留筆數，超出以 stats.samples_truncated 旗標表露
export const TABLE_SAMPLES_PERSIST_LIMIT = 2000;

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
        label_counts: isPlainObject(input.label_counts) ? clone(input.label_counts) : {},
        // R7：表格截斷旗標（舊檔無此欄→false；後端透傳不解讀）
        samples_truncated: input.samples_truncated === true
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
            warnings.push(t('VALIDATE_VERSION_UNSUPPORTED', 'Unsupported spec version "%1". Expected "%2".', spec.version, SPEC_VERSION));
        }
        if (!spec.project.name) {
            errors.push(t('VALIDATE_PROJECT_NAME_REQUIRED', 'Project name is required.'));
        }
        if (!PROJECT_TYPES.has(spec.project.type)) {
            errors.push(t('VALIDATE_PROJECT_TYPE_INVALID', 'Project type must be one of: %1.', Array.from(PROJECT_TYPES).join(', ')));
        }
        if (!SOURCE_MODES.has(spec.data_source.mode)) {
            errors.push(t('VALIDATE_SOURCE_MODE_INVALID', 'Data source mode must be one of: %1.', Array.from(SOURCE_MODES).join(', ')));
        }
        const isImageType = IMAGE_TYPES.has(spec.project.type);
        const sampleCount = spec.stats.sample_count
            || (Array.isArray(spec.data_source.samples) ? spec.data_source.samples.length : 0);

        if (!Array.isArray(spec.schema.columns) || spec.schema.columns.length === 0) {
            if (isImageType) {
                // 影像類：欄位由匯入/採集自動生成；尚未有樣本時以引導式 warning 呈現
                if (sampleCount === 0) {
                    warnings.push(t('VALIDATE_NO_SAMPLES', 'No images imported yet. Select an image folder or capture photos with the camera.'));
                }
            } else {
                // 表格類：欄位為匯出必要條件，維持 error 但文案改為引導式
                errors.push(t('VALIDATE_COLUMN_REQUIRED', 'No columns defined yet. Import a CSV/JSON file, or click "Add Feature / Add Label" to create one.'));
            }
        }

        spec.schema.columns.forEach((column, index) => {
            if (!column.name) {
                errors.push(t('VALIDATE_COLUMN_MISSING_NAME', 'Column %1 is missing a name.', index + 1));
                return;
            }
            if (columnNames.has(column.name)) {
                errors.push(t('VALIDATE_COLUMN_DUPLICATE', 'Duplicate column name: %1.', column.name));
            }
            columnNames.add(column.name);
            if (!COLUMN_TYPES.has(column.type)) {
                errors.push(t('VALIDATE_COLUMN_INVALID_TYPE', 'Column "%1" has invalid type "%2".', column.name, column.type));
            }
            if (!COLUMN_ROLES.has(column.role)) {
                errors.push(t('VALIDATE_COLUMN_INVALID_ROLE', 'Column "%1" has invalid role "%2".', column.name, column.role));
            }
        });

        spec.schema.features.forEach((name) => {
            if (!columnNames.has(name)) {
                errors.push(t('VALIDATE_FEATURE_NOT_FOUND', 'Feature column "%1" does not exist in schema.columns.', name));
            }
        });

        if (spec.schema.label && !columnNames.has(spec.schema.label)) {
            errors.push(t('VALIDATE_LABEL_NOT_FOUND', 'Label column "%1" does not exist in schema.columns.', spec.schema.label));
        }
        // Label 檢查：影像類若尚未有任何樣本，不重複發出 NO_LABEL 警告
        if (!spec.schema.label && spec.project.type !== 'table' && spec.project.type !== 'line_following') {
            if (!(isImageType && sampleCount === 0)) {
                warnings.push(t('VALIDATE_NO_LABEL', 'No label column is assigned yet.'));
            }
        }
        // Features 檢查：補上 object_detection 豁免；僅在有欄位但未指定 role=feature 時提醒，避免與無欄位的 COLUMN_REQUIRED 重複
        if (spec.schema.features.length === 0 && !isImageType && spec.schema.columns.length > 0) {
            warnings.push(t('VALIDATE_NO_FEATURES', 'No feature columns are assigned yet.'));
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
                label_counts: {},
                samples_truncated: false
            }
        });
    }

    /**
     * R7：表格系 samples 落盤組裝（純函式，可測）。
     * 取前 limit 筆寫入 dataset.json，回傳是否截斷與全量總數；
     * 供 syncSpecFromUI 填 samples／stats（sample_count 記全量 rows，非 samples 陣列長度）。
     * @param {Array<object>} [tableRows]
     * @param {number} [limit]
     * @returns {{ samples: Array<object>, truncated: boolean, total: number }}
     */
    static buildTableSamples(tableRows, limit = TABLE_SAMPLES_PERSIST_LIMIT) {
        const rows = Array.isArray(tableRows) ? tableRows : [];
        return {
            samples: rows.slice(0, limit),
            truncated: rows.length > limit,
            total: rows.length
        };
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
