Object.assign(Blockly.Msg, {
  "AI_POSE_INIT": "Init Pose Detection Min Confidence %1",
  "AI_POSE_INIT_TOOLTIP": "Initialize MediaPipe Pose Detection model. Recommended to place in the 'Global Definition Zone'.",
  "AI_POSE_INIT_WARNING": "Tip: Init block should be placed inside 'Global Definition Zone'.",
  "AI_POSE_PROCESS": "Process frame %1 save to %2",
  "AI_POSE_PROCESS_TOOLTIP": "Convert frame to RGB and execute pose detection.",
  "AI_POSE_IS_DETECTED": "is pose detected in %1?",
  "AI_POSE_IS_DETECTED_TOOLTIP": "Returns True if at least one pose is detected. Returns: Boolean.",
  "AI_POSE_GET_LANDMARKS": "get pose landmarks from %1",
  "AI_POSE_GET_LANDMARKS_TOOLTIP": "Get 33 pose landmarks. Returns: PoseLandmarks.",
  "AI_POSE_GET_LANDMARK": "pick landmark %2 from %1",
  "AI_POSE_GET_LANDMARK_TOOLTIP": "Get a specific landmark (0-32) from pose. Returns: Landmark.",
  "AI_POSE_GET_LANDMARK_XY": "get landmark %1 (x, y) Width %2 Height %3",
  "AI_POSE_GET_LANDMARK_XY_TOOLTIP": "Convert normalized coords to pixel coords. Returns: (x, y) Tuple.",
  "AI_POSE_DRAW": "Draw %2 skeleton on %1 Landmark %3 Line %4",
  "AI_POSE_DRAW_TOOLTIP": "Draw landmarks and skeleton connections on image.",
  "AI_POSE_DRAW_INDICES": "Label %2 indices on %1 Size %3 Color %4",
  "AI_POSE_DRAW_INDICES_TOOLTIP": "Draw index numbers (0-32) next to each landmark."
});
