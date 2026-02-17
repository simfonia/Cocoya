import numpy as np


def cocoya_overlay_image(img, path, center, width, angle):
    overlay = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if overlay is None:
        print(f"Warning: Cannot load image at {path}")
        return
    h_orig, w_orig = overlay.shape[:2]
    width = max(1, int(width))
    height = max(1, int(h_orig * (width / w_orig)))
    overlay = cv2.resize(overlay, (width, height), interpolation=cv2.INTER_AREA)
    (h, w) = overlay.shape[:2]
    (cX, cY) = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D((cX, cY), angle, 1.0)
    cos, sin = np.abs(M[0, 0]), np.abs(M[0, 1])
    nW, nH = int((h * sin) + (w * cos)), int((h * cos) + (w * sin))
    M[0, 2] += (nW / 2) - cX
    M[1, 2] += (nH / 2) - cY
    overlay = cv2.warpAffine(overlay, M, (nW, nH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))
    h, w = overlay.shape[:2]
    x, y = int(center[0] - w // 2), int(center[1] - h // 2)
    img_h, img_w = img.shape[:2]
    x1, y1 = max(x, 0), max(y, 0)
    x2, y2 = min(x + w, img_w), min(y + h, img_h)
    if x1 >= x2 or y1 >= y2: return
    overlay_crop = overlay[y1-y:y2-y, x1-x:x2-x]
    img_crop = img[y1:y2, x1:x2]
    if overlay_crop.shape[2] == 4:
        alpha = overlay_crop[:, :, 3:] / 255.0
        img_crop[:] = (alpha * overlay_crop[:, :, :3] + (1 - alpha) * img_crop).astype(np.uint8)
    else:
        img_crop[:] = overlay_crop[:, :, :3]


import math  # ID:imp_math  # ID:def_zone
import cv2  # ID:face_init
import mediapipe as mp
mp_face_mesh = mp.solutions.face_mesh
mp_draw = mp.solutions.drawing_utils
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1, min_detection_confidence=0.5)

if __name__ == "__main__":  # ID:main_zone
    cap = cv2.VideoCapture(0)  # ID:open_cam
    while True:  # ID:main_loop
        ret, frame = cap.read()  # ID:read_f
        frame = cv2.flip(frame, 1)  # ID:flip_f
        results_face = face_mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))  # ID:proc_f
        if results_face.multi_face_landmarks is not None:  # ID:if_face
            face_0 = results_face.multi_face_landmarks[0] if results_face.multi_face_landmarks and len(results_face.multi_face_landmarks) > 0 else None  # ID:set_face0
            # 第一步：取得額頭三個定位點  # ID:cmt_p
            # 103 與 332 分別是額頭左右兩側點
            # 10 是額頭正中央點
            p103 = (int((face_0.landmark[103] if face_0 else None).x * 640), int((face_0.landmark[103] if face_0 else None).y * 480)) if (face_0.landmark[103] if face_0 else None) else (0, 0)  # ID:get_p109_val
            p332 = (int((face_0.landmark[332] if face_0 else None).x * 640), int((face_0.landmark[332] if face_0 else None).y * 480)) if (face_0.landmark[332] if face_0 else None) else (0, 0)  # ID:get_p338_val
            p10 = (int((face_0.landmark[10] if face_0 else None).x * 640), int((face_0.landmark[10] if face_0 else None).y * 480)) if (face_0.landmark[10] if face_0 else None) else (0, 0)  # ID:get_p10_val
            # 第二步：計算頭部寬度(dx, dy)  # ID:cmt_math
            # 並利用 atan2 計算傾斜角度
            # 最後將弧度轉為角度並修正正負號
            dx = p332[int(1 - 1)] - p103[int(1 - 1)]  # ID:calc_dx
            dy = p332[int(2 - 1)] - p103[int(2 - 1)]  # ID:calc_dy
            crown_width = math.sqrt(dx ** 2 + dy ** 2) * 1.5  # ID:set_width
            angle_deg = 0 - math.degrees(math.atan2(dy, dx))  # ID:set_deg
            # 第三步：覆蓋圖片。將中心點上移  # ID:cmt_overlay
            # 以確保皇冠戴在正確的高度
            cocoya_overlay_image(frame, 'resources/princess-crown.png', tuple(map(int, (p10[int(1 - 1)], p10[int(2 - 1)] - crown_width * 0.4))), crown_width, angle_deg)  # ID:overlay_crown
        cv2.imshow('Cocoya Video', frame)  # ID:show
        if cv2.waitKey(1) & 0xFF == ord('q'):  # ID:wait
            break
    cap.release()  # ID:rel
    cv2.destroyAllWindows()