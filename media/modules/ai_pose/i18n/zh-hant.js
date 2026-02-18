Object.assign(Blockly.Msg, {
  "AI_POSE_INIT": "初始化姿勢偵測 最小信心度 %1",
  "AI_POSE_INIT_TOOLTIP": "初始化 MediaPipe 姿勢偵測模型。建議放入「全域定義區」中以確保程式順序正確。",
  "AI_POSE_INIT_WARNING": "提醒：初始化積木建議放入「全域定義區」內。",
  "AI_POSE_PROCESS": "從影像 %1 進行姿勢分析並存入 %2",
  "AI_POSE_PROCESS_TOOLTIP": "將影像轉換為 RGB 並執行姿勢偵測。",
  "AI_POSE_IS_DETECTED": "%1 中是否存在人體姿勢",
  "AI_POSE_IS_DETECTED_TOOLTIP": "若畫面中偵測到至少一個姿勢則傳回真 (True)。傳回：布林值 (Boolean)。",
  "AI_POSE_GET_LANDMARKS": "取得 %1 中的姿勢特徵點",
  "AI_POSE_GET_LANDMARKS_TOOLTIP": "取得姿勢的 33 個特徵點資料。傳回：姿勢物件 (PoseLandmarks)。",
  "AI_POSE_GET_LANDMARK": "挑出 %1 中的第 %2 個特徵點",
  "AI_POSE_GET_LANDMARK_TOOLTIP": "從姿勢物件中取得特定特徵點 (索引 0-32)。傳回：單一特徵點 (Landmark)。",
  "AI_POSE_GET_LANDMARK_XY": "取得特徵點 %1 的座標 (x, y) 影像寬度 %2 影像高度 %3",
  "AI_POSE_GET_LANDMARK_XY_TOOLTIP": "將特徵點的歸一化座標轉換為像素座標。傳回：(x, y) 數值元組 (Tuple)。",
  "AI_POSE_DRAW": "在影像 %1 繪製 %2 姿勢骨架圖 特徵點顏色 %3 線條顏色 %4",
  "AI_POSE_DRAW_TOOLTIP": "在影像上標註姿勢特徵點與骨架連接線。",
  "AI_POSE_DRAW_INDICES": "在影像 %1 標註 %2 姿勢特徵點編號 大小 %3 顏色 %4",
  "AI_POSE_DRAW_INDICES_TOOLTIP": "在特徵點旁標註索引編號 (0-32)。"
});
