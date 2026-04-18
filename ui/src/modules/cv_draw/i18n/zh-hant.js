Object.assign(Blockly.Msg, {
  // 影像標註積木
  "AI_DRAW_RECT": "影像%1畫矩形 %2到%3 顏色%4 粗細%5",
  "AI_DRAW_RECT_ALPHA": "影像%1 畫半透明矩形 %2到%3 顏色%4 透明度%5",
  "AI_DRAW_RECT_ALPHA_TOOLTIP": "在影像上繪製半透明的填充矩形。透明度範圍 0.0 到 1.0 (1.0 為不透明)。",
  "AI_DRAW_CIRCLE": "影像%1畫圓 圓心%2 半徑%3 顏色%4 粗細%5",
  "AI_DRAW_LINE": "影像%1畫線 %2到%3 顏色%4 粗細%5",
  "AI_DRAW_TEXT": "影像%1寫字%2 位置%3 顏色%4 大小%5",
  "AI_DRAW_TEXT_ZH": "影像%1寫中文%2 位置%3 顏色%4 大小%5",
  "AI_DRAW_TEXT_ZH_TOOLTIP": "使用 Pillow 函式庫在影像上寫中文。注意：需確保系統已安裝 Pillow 且字體路徑正確。",
  "AI_DRAW_ANGLE_ARC": "影像%1 繪製夾角圓弧 中心%2 起點%3 終點%4 半徑%5 顏色%6 粗細%7",
  "AI_DRAW_ANGLE_ARC_TOOLTIP": "在三點構成的夾角間繪製圓弧。中心通常為關節點（如手肘）。",
  "AI_DRAW_OVERLAY_IMAGE": "影像 %1 覆蓋圖片 %2 中心 %3 寬度 %4 旋轉角度 %5",
  "AI_DRAW_OVERLAY_IMAGE_TOOLTIP": "在指定位置覆蓋圖片（支援 PNG 透明度）。角度為逆時針方向。",
  "AI_DRAW_TOOLTIP": "在影像上繪製標註圖形。注意顏色需為 (B, G, R) 格式。",
  "AI_POINT": "(%1, %2)",
  "AI_COLOR": "(%1, %2, %3)",
  "AI_POINT_TOOLTIP": "座標位置 (X, Y)",
  "AI_COLOR_TOOLTIP": "顏色數值 (B, G, R)，範圍 0-255"
});
