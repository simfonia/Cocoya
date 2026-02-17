Object.assign(Blockly.Msg, {
  "AI_FACE_INIT": "初始化臉部網格偵測 最大臉部數量 %1 最小信心度 %2",
  "AI_FACE_INIT_TOOLTIP": "初始化 MediaPipe 臉部網格偵測模型。建議放入「全域定義區」中。",
  "AI_FACE_INIT_WARNING": "提醒：初始化積木建議放入「全域定義區」內。",
  "AI_FACE_PROCESS": "從影像 %1 進行臉部分析並存入 %2",
  "AI_FACE_PROCESS_TOOLTIP": "執行臉部網格偵測。",
  "AI_FACE_IS_DETECTED": "%1 中是否存在臉部",
  "AI_FACE_IS_DETECTED_TOOLTIP": "若畫面中偵測到至少一張臉則傳回真 (True)。傳回：布林值 (Boolean)。",
  "AI_FACE_GET_LANDMARKS": "取得 %1 中第 %2 張臉的特徵點",
  "AI_FACE_GET_LANDMARKS_TOOLTIP": "取得指定臉部的 468 個特徵點資料 (索引從 0 開始)。傳回：臉部物件 (FaceLandmarks)。",
  "AI_FACE_GET_LANDMARK": "挑出 %1 中的第 %2 個特徵點",
  "AI_FACE_GET_LANDMARK_TOOLTIP": "從臉部物件中取得特定特徵點 (索引 0-467)。傳回：單一特徵點 (Landmark)。",
  "AI_FACE_DRAW": "在影像 %1 繪製 %2 臉部網格圖 網格顏色 %3 輪廓顏色 %4",
  "AI_FACE_DRAW_TOOLTIP": "在影像上標註臉部 468 個特徵點與連結網格。",
  "AI_FACE_DRAW_INDICES": "在影像 %1 標註 %2 臉部特徵點編號 範圍 %3 到 %4 大小 %5 顏色 %6",
  "AI_FACE_DRAW_INDICES_TOOLTIP": "在特徵點旁標註索引編號 (0-467)。可指定範圍以避免畫面過於擁擠。"
});
