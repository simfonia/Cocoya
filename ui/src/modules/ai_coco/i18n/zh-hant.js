Object.assign(Blockly.Msg, {
  "AI_COCO_INIT": "初始化 COCO 偵測器 模型 %1 全域信心度 %2 最多結果 %3",
  "AI_COCO_INIT_TOOLTIP": "載入 EfficientDet-Lite0 預訓練模型（MediaPipe Tasks VIDEO 模式）。全域信心度設低一點（如 0.2），各物件的精確門檻由「走訪目標物件」積木的字典決定。建議放入「全域定義區」。",
  "AI_COCO_INIT_WARNING": "提醒：初始化積木建議放入「全域定義區」內。",
  "AI_COCO_DETECT": "從影像 %1 執行 COCO 偵測並存入 %2",
  "AI_COCO_DETECT_TOOLTIP": "自動處理 BGR→RGB、mp.Image 包裝、timestamp 遞增與 detect_for_video。傳回：偵測結果（detection_result）。",
  "AI_COCO_FOR_EACH_TARGET": "走訪 %1 中符合目標字典的物件",
  "AI_COCO_FOR_EACH_TARGET_TOOLTIP": "依序檢查每個偵測結果：無分類／標籤為空／非目標字典內／信心度不足者自動跳過。通過者可在迴圈內用「目標欄位」積木取得 label、score、x、y、w、h。",
  "AI_COCO_TARGET_FIELD": "目標物件的 %1",
  "AI_COCO_TARGET_FIELD_TOOLTIP": "只能放在「走訪目標物件」迴圈內使用。傳回該次通過篩選的物件欄位。",
  "AI_COCO_FIELD_LABEL": "標籤",
  "AI_COCO_FIELD_SCORE": "信心度",
  "AI_COCO_FIELD_X": "框左上 X",
  "AI_COCO_FIELD_Y": "框左上 Y",
  "AI_COCO_FIELD_W": "框寬",
  "AI_COCO_FIELD_H": "框高",
  "AI_COCO_CLOSE": "釋放 COCO 偵測器",
  "AI_COCO_CLOSE_TOOLTIP": "程式結束前釋放偵測器資源（對應 detector.close()）。"
});
