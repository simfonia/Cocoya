/**
 * Dataset Manager Importer
 * 負責處理 CSV/JSON 檔案與影像目錄匯入邏輯
 */

export const Importer = {
    /**
     * 解析影像目錄
     * @param {FileList} files 來自 input[webkitdirectory] 的檔案清單
     * @returns {Promise<Object>} { images: [], labelCounts: {}, labelMap: {} }
     */
    async importImageDirectory(files) {
        const images = [];
        const labelCounts = {};
        const labelMap = {};
        let nextLabelId = 0;

        const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];

        for (const file of Array.from(files)) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!imageExtensions.includes(ext)) continue;

            // 提取父目錄名作為標籤 (例如: "dataset/train/cat/01.jpg" -> "cat")
            // webkitRelativePath 在 VS Code Webview 中通常可用
            const pathParts = file.webkitRelativePath.split('/');
            const label = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'unlabeled';

            if (!labelCounts[label]) {
                labelCounts[label] = 0;
                labelMap[label] = nextLabelId++;
            }
            labelCounts[label]++;

            images.push({
                file: file, // 原始 File 物件
                name: file.name,
                path: file.webkitRelativePath,
                label: label,
                blobUrl: URL.createObjectURL(file) // 用於縮圖預覽
            });
        }

        return {
            images,
            labelCounts,
            labelMap
        };
    }
};
