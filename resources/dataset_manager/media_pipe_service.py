try:
    import mediapipe as mp
    import cv2
    import numpy as np
except ImportError:
    pass

class MediaPipeService:
    def __init__(self):
        self.enabled = False
        try:
            self.mp_hands = mp.solutions.hands
            self.hands = self.mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=2,
                min_detection_confidence=0.5
            )
            self.enabled = True
        except:
            print("[MediaPipe] Module not found or init failed.")

    def process_frame(self, frame):
        if not self.enabled:
            return None
        
        # 轉換顏色空間
        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(image_rgb)
        
        # 這裡僅回傳基本偵測狀態，後續可擴充特徵點提取
        if results.multi_hand_landmarks:
            return {
                "hand_count": len(results.multi_hand_landmarks),
                "detected": True
            }
        return {"detected": False}
