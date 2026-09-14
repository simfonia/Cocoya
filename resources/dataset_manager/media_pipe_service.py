"""
media_pipe_service.py — MediaPipe 特徵提取服務（M4 重寫）

自歷史 stub（僅手部「偵測」、無 landmark 提取）重寫為「關鍵點（landmark）提取」：
  - Hands 21 點、Pose 33 點，每點含歸一化 x,y,z。
  - extract_landmarks(frame, use_z) → { available, hand_detected, pose_detected,
    hand: [[x,y,z]*21] 或 None, pose: [[x,y,z]*33] 或 None }。
  - MediaPipe 未安裝/初始化失敗→ available=False（缺裝降級，由呼叫端判 FEATURE_MEDIAPIPE_MISSING）。
"""

try:
    import mediapipe as mp
    import cv2
    import numpy as np
    _MP_IMPORT_OK = True
except ImportError:
    _MP_IMPORT_OK = False


class MediaPipeService:
    HAND_POINTS = 21
    POSE_POINTS = 33

    def __init__(self):
        self.enabled = _MP_IMPORT_OK
        self._hands = None
        self._pose = None
        if self.enabled:
            try:
                self._hands = mp.solutions.hands.Hands(
                    static_image_mode=False,
                    max_num_hands=1,
                    min_detection_confidence=0.5
                )
                self._pose = mp.solutions.pose.Pose(
                    static_image_mode=False,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5
                )
            except Exception:
                self.enabled = False

    def close(self):
        """釋放 MediaPipe 資源（可選）。"""
        for sol in (self._hands, self._pose):
            if sol is not None:
                try:
                    sol.close()
                except Exception:
                    pass

    def _serialize(self, landmark_list, points, use_z):
        """把 MediaPipe landmark list 轉成 [[x,y(,z)]*points]；未偵測回 None。"""
        if landmark_list is None:
            return None
        out = []
        for i in range(points):
            lm = landmark_list.landmark[i]
            v = [lm.x, lm.y]
            if use_z:
                v.append(lm.z)
            out.append(v)
        return out

    def extract_landmarks(self, frame, use_z=False):
        """單幀提取手/姿勢關鍵點。

        Args:
            frame: BGR numpy 陣列（camera_service 的 frame 就是 BGR）。
            use_z: 是否包含 z 座標（決定每點維度 3 或 2）。

        Returns:
            dict: { available, hand_detected, pose_detected, hand, pose }
              - hand/pose 為 None（未偵測或不可用）或 [[x,y(,z)]*N]。
              - MediaPipe 未安裝 → available=False，hand/pose 皆 None。
        """
        if not self.enabled or frame is None:
            return {
                "available": False,
                "hand_detected": False,
                "pose_detected": False,
                "hand": None,
                "pose": None
            }

        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        hand_data = None
        pose_data = None
        hand_detected = False
        pose_detected = False

        # 手部
        if self._hands is not None:
            try:
                hands_res = self._hands.process(image_rgb)
                hand_landmarks = (hands_res.multi_hand_landmarks[0]
                                  if hands_res.multi_hand_landmarks else None)
                if hand_landmarks is not None:
                    hand_data = self._serialize(hand_landmarks, self.HAND_POINTS, use_z)
                    hand_detected = True
            except Exception:
                pass

        # 姿勢
        if self._pose is not None:
            try:
                pose_res = self._pose.process(image_rgb)
                pose_landmarks = pose_res.pose_landmarks
                if pose_landmarks is not None:
                    pose_data = self._serialize(pose_landmarks, self.POSE_POINTS, use_z)
                    pose_detected = True
            except Exception:
                pass

        return {
            "available": True,
            "hand_detected": hand_detected,
            "pose_detected": pose_detected,
            "hand": hand_data,
            "pose": pose_data
        }
