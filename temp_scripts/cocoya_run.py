import numpy as np


cocoya_img_cache = {}

def cocoya_overlay_image(img, path, center, width, angle):
    # 1. 快取檢查：避免重複讀取磁碟
    cache_key = f"{path}_{width}_{angle}"
    if cache_key in cocoya_img_cache:
        overlay = cocoya_img_cache[cache_key]
    else:
        # 讀取並預處理
        raw = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if raw is None: return
        h_orig, w_orig = raw.shape[:2]
        width = max(1, int(width))
        height = max(1, int(h_orig * (width / w_orig)))
        overlay = cv2.resize(raw, (width, height), interpolation=cv2.INTER_AREA)

        # 旋轉處理
        if angle != 0:
            (h, w) = overlay.shape[:2]
            (cX, cY) = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D((cX, cY), angle, 1.0)
            cos, sin = np.abs(M[0, 0]), np.abs(M[0, 1])
            nW, nH = int((h * sin) + (w * cos)), int((h * cos) + (w * sin))
            M[0, 2] += (nW / 2) - cX
            M[1, 2] += (nH / 2) - cY
            overlay = cv2.warpAffine(overlay, M, (nW, nH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))

        # 存入快取 (限制快取大小防止記憶體溢出)
        if len(cocoya_img_cache) > 20: cocoya_img_cache.clear()
        cocoya_img_cache[cache_key] = overlay

    # 2. 快速混合邏輯
    h, w = overlay.shape[:2]
    x, y = int(center[0] - w // 2), int(center[1] - h // 2)
    img_h, img_w = img.shape[:2]
    x1, y1 = max(x, 0), max(y, 0)
    x2, y2 = min(x + w, img_w), min(y + h, img_h)
    if x1 >= x2 or y1 >= y2: return

    overlay_crop = overlay[y1-y:y2-y, x1-x:x2-x]
    img_crop = img[y1:y2, x1:x2]

    if overlay_crop.shape[2] == 4:
        # 使用 NumPy 廣播進行 Alpha 混合 (高效版)
        alpha = overlay_crop[:, :, 3:] / 255.0
        img_crop[:] = (alpha * overlay_crop[:, :, :3] + (1 - alpha) * img_crop).astype(np.uint8)
    else:
        img_crop[:] = overlay_crop[:, :, :3]


import math  # S_ID:imp_math  # E_ID:imp_math  # S_ID:def_zone
import cv2  # S_ID:face_init
import mediapipe as mp
mp_face_mesh = mp.solutions.face_mesh
mp_draw = mp.solutions.drawing_utils
mp_face_model = mp_face_mesh.FaceMesh(max_num_faces=1, min_detection_confidence=0.5)  # E_ID:face_init  # E_ID:def_zone

if __name__ == "__main__":  # S_ID:main_zone
    cap = cv2.VideoCapture(0)  # S_ID:open_cam  # E_ID:open_cam
    while True:  # S_ID:main_loop
        ret, frame = cap.read()  # S_ID:read_f  # E_ID:read_f
        frame = cv2.flip(frame, 1)  # S_ID:flip_f  # E_ID:flip_f
        results_face = mp_face_model.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))  # S_ID:proc_f  # E_ID:proc_f
        if results_face.multi_face_landmarks is not None:  # S_ID:if_face
            face_0 = results_face.multi_face_landmarks[0] if results_face.multi_face_landmarks and len(results_face.multi_face_landmarks) > 0 else None  # S_ID:set_face0  # E_ID:set_face0
            # 第一步：取得額頭三個定位點  # S_ID:cmt_p
            # 103 與 332 分別是額頭左右兩側點
            # 10 是額頭正中央點  # E_ID:cmt_p
            p103 = (int((face_0.landmark[103] if face_0 else None).x * 640), int((face_0.landmark[103] if face_0 else None).y * 480)) if (face_0.landmark[103] if face_0 else None) else (0, 0)  # S_ID:get_p109_val  # E_ID:get_p109_val
            p332 = (int((face_0.landmark[332] if face_0 else None).x * 640), int((face_0.landmark[332] if face_0 else None).y * 480)) if (face_0.landmark[332] if face_0 else None) else (0, 0)  # S_ID:get_p338_val  # E_ID:get_p338_val
            p10 = (int((face_0.landmark[10] if face_0 else None).x * 640), int((face_0.landmark[10] if face_0 else None).y * 480)) if (face_0.landmark[10] if face_0 else None) else (0, 0)  # S_ID:get_p10_val  # E_ID:get_p10_val
            # 第二步：計算頭部寬度(dx, dy)  # S_ID:cmt_math
            # 並利用 atan2 計算傾斜角度
            # 最後將弧度轉為角度並修正正負號(因為 OpenCV 的旋轉逆時針為正，
            # 與 MediaPipe  座標系中的向量方向之間存在正負號差異。  # E_ID:cmt_math
            dx = p332[int(1 - 1)] - p103[int(1 - 1)]  # S_ID:calc_dx  # E_ID:calc_dx
            dy = p332[int(2 - 1)] - p103[int(2 - 1)]  # S_ID:calc_dy  # E_ID:calc_dy
            crown_width = math.sqrt(dx ** 2 + dy ** 2) * 1.5  # S_ID:set_width  # E_ID:set_width
            angle_deg = 0 - math.degrees(math.atan2(dy, dx))  # S_ID:set_deg  # E_ID:set_deg
            # 第三步：覆蓋圖片。將中心點上移  # S_ID:cmt_overlay
            # 以確保皇冠戴在正確的高度  # E_ID:cmt_overlay
            cocoya_overlay_image(frame, 'resources/princess-crown.png', tuple(map(int, (p10[int(1 - 1)], p10[int(2 - 1)] - crown_width * 0.4))), crown_width, angle_deg)  # S_ID:overlay_crown  # E_ID:overlay_crown  # E_ID:if_face
        cv2.imshow('Cocoya Video', frame)  # S_ID:show  # E_ID:show
        if cv2.waitKey(1) & 0xFF == ord('q'):  # S_ID:wait
            break  # E_ID:wait  # E_ID:main_loop
    cap.release()  # S_ID:rel
    cv2.destroyAllWindows()  # E_ID:rel  # E_ID:main_zone