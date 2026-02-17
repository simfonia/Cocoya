# 這個範例展示了如何透過數學運算來實現更精準的 AI 邏輯判斷，識別「OK」手勢。  # ID:Y{8PN|lx,+^wrCPH.+t8  # ID:def_zone
# 辨識邏輯說明：
# 1. 距離計算：利用 math.sqrt 與 **2 積木，計算「大拇指尖 (4)」與「食指尖 (8)」之間的歐幾里得距離。
# 2. 多重條件組合：
#     * 拇指與食指靠近：距離小於 30 像素。
#     * 手指伸直狀態：同時檢查「中指」與「小拇指」是否保持伸直（Up）。
#
import math  # ID:imp_math
import cv2  # ID:hand_init
import mediapipe as mp
mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils
hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.7)

if __name__ == "__main__":  # ID:main_zone
    cap = cv2.VideoCapture(0)  # ID:open_cam
    while True:  # ID:main_loop
        ret, frame = cap.read()  # ID:read_f
        frame = cv2.flip(frame, 1)  # ID:flip_f
        results = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))  # ID:proc_h
        if results.multi_hand_landmarks is not None:  # ID:if_detected
            hand_0 = results.multi_hand_landmarks[0] if results.multi_hand_landmarks and len(results.multi_hand_landmarks) > 0 else None  # ID:set_h0
            p4 = (int((hand_0.landmark[4] if hand_0 else None).x * 640), int((hand_0.landmark[4] if hand_0 else None).y * 480)) if (hand_0.landmark[4] if hand_0 else None) else (0, 0)  # ID:set_p4
            p8 = (int((hand_0.landmark[8] if hand_0 else None).x * 640), int((hand_0.landmark[8] if hand_0 else None).y * 480)) if (hand_0.landmark[8] if hand_0 else None) else (0, 0)  # ID:set_p8
            dx = p4[int(1 - 1)] - p8[int(1 - 1)]  # ID:set_dx
            dy = p4[int(2 - 1)] - p8[int(2 - 1)]  # ID:set_dy
            dist = math.sqrt(dx ** 2 + dy ** 2)  # ID:set_dist
            if dist < 30 and results.multi_hand_landmarks[0].landmark[12].y < results.multi_hand_landmarks[0].landmark[10].y if results.multi_hand_landmarks and len(results.multi_hand_landmarks) > 0 else False and results.multi_hand_landmarks[0].landmark[20].y < results.multi_hand_landmarks[0].landmark[18].y if results.multi_hand_landmarks and len(results.multi_hand_landmarks) > 0 else False:  # ID:if_gesture_match
                cv2.putText(frame, str('GESTURE: OK'), (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 255), 2)  # ID:draw_ok
        cv2.imshow('Cocoya Video', frame)  # ID:show
        if cv2.waitKey(1) & 0xFF == ord('q'):  # ID:wait
            break
    cap.release()  # ID:rel
    cv2.destroyAllWindows()