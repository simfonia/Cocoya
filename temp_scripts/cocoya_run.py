from PIL import Image, ImageDraw, ImageFont
import numpy as np


def cocoya_draw_rect_alpha(img, pt1, pt2, color, alpha):
    overlay = img.copy()
    cv2.rectangle(overlay, tuple(map(int, pt1)), tuple(map(int, pt2)), color, -1)
    cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)

def cocoya_draw_text_zh(img, text, pos, color, size):
    img_pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img_pil)
    try:
        # Windows 預設微軟正黑體
        font = ImageFont.truetype("C:/Windows/Fonts/msjh.ttc", int(size))
    except:
        try:
            # Linux 常用字體
            font = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", int(size))
        except:
            font = ImageFont.load_default()

    # PIL color is RGB, OpenCV color is BGR
    b, g, r = color
    draw.text(pos, str(text), font=font, fill=(r, g, b))
    img[:] = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)


# AI 鼻子撞球遊戲 進階版 (物理反彈 + 防抖)  # ID:cmt_game  # ID:def_zone
# 【遊戲調整說明】
# 1. 下落速度：修改下面的 [fall_speed]，建議 5~12。
# 2. 反彈力道：修改下面的 [bounce_power]，建議 10~25。
#
# 【技術重點】
# 1. 雙球系統：挑戰左右夾擊。
# 2. 物理防抖：增加 [只有 vy > 0 時才碰撞] 的判斷，防止同一球重複加分。
# 3. 反彈機制：撞擊後將垂直速度設為負值，產生向上彈飛效果。
import math  # ID:imp_math
import random  # ID:imp_rand
import cv2  # ID:pose_init
import mediapipe as mp
mp_pose = mp.solutions.pose
mp_draw = mp.solutions.drawing_utils
mp_pose_model = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

if __name__ == "__main__":  # ID:main_zone
    score = 0  # ID:i_sc
    fall_speed = 8  # ID:i_sp
    bounce_power = 15  # ID:i_bp
    bx1 = random.randint(100, 500)  # ID:i_b1x
    by1 = -50  # ID:i_b1y
    vy1 = fall_speed  # ID:i_b1v
    bx2 = random.randint(100, 500)  # ID:i_b2x
    by2 = -300  # ID:i_b2y
    vy2 = fall_speed  # ID:i_b2v
    cap = cv2.VideoCapture(0)  # ID:oc
    while True:  # ID:ml
        ret, frame = cap.read()  # ID:rf
        frame = cv2.flip(frame, 1)  # ID:ff
        results = mp_pose_model.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))  # ID:pp
        if results.pose_landmarks is not None:  # ID:ip
            nose = (int(((results.pose_landmarks if results.pose_landmarks else None).landmark[0] if (results.pose_landmarks if results.pose_landmarks else None) else None).x * 640), int(((results.pose_landmarks if results.pose_landmarks else None).landmark[0] if (results.pose_landmarks if results.pose_landmarks else None) else None).y * 480)) if ((results.pose_landmarks if results.pose_landmarks else None).landmark[0] if (results.pose_landmarks if results.pose_landmarks else None) else None) else (0, 0)  # ID:sn
            # 球 1 碰撞 (下落時才判定)  # ID:c1
            dist = math.sqrt((nose[int(1 - 1)] - bx1) ** 2 + (nose[int(2 - 1)] - by1) ** 2)  # ID:d1
            if dist < 45 and vy1 > 0:  # ID:h1
                score = score + 1  # ID:su1
                vy1 = 0 - bounce_power  # ID:rv1
            # 球 2 碰撞判斷  # ID:c2
            dist = math.sqrt((nose[int(1 - 1)] - bx2) ** 2 + (nose[int(2 - 1)] - by2) ** 2)  # ID:d2
            if dist < 45 and vy2 > 0:  # ID:h2
                score = score + 1  # ID:su2
                vy2 = 0 - bounce_power  # ID:rv2
        # 物理運動與邊界  # ID:c_upd
        by1 = by1 + vy1  # ID:mv1
        by2 = by2 + vy2  # ID:mv2
        if by1 > 480 or by1 < -150:  # ID:ck1
            bx1 = random.randint(100, 500)  # ID:rs1x
            by1 = -50  # ID:rs1y
            vy1 = fall_speed  # ID:rs1v
        if by2 > 480 or by2 < -150:  # ID:ck2
            bx2 = random.randint(100, 500)  # ID:rs2x
            by2 = -50  # ID:rs2y
            vy2 = fall_speed  # ID:rs2v
        cv2.circle(frame, tuple(map(int, (bx1, by1))), int(25), (0, 165, 255), (-1))  # ID:dr1
        cv2.circle(frame, tuple(map(int, (bx2, by2))), int(25), (255, 100, 0), (-1))  # ID:dr2
        cocoya_draw_rect_alpha(frame, (20, 20), (250, 75), (0, 0, 0), 0.5)  # ID:sbg
        cocoya_draw_text_zh(frame, f'遊戲得分：{score}', tuple(map(int, (30, 55))), (255, 255, 255), 30)  # ID:stxt
        cv2.imshow('Cocoya Video', frame)  # ID:sh
        if cv2.waitKey(1) & 0xFF == ord('q'):  # ID:wk
            break
    cap.release()  # ID:VN@xA:|IXrCqlM7b(CwJ
    cv2.destroyAllWindows()