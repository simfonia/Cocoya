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


# AI 鼻子撞球遊戲  (反彈版)  # S_ID:cmt_game  # S_ID:def_zone
# 【遊戲調整說明】
# 1. 下落速度：修改下面的 [fall_speed]，建議 5~12。
# 2. 反彈力道：修改下面的 [bounce_power]，建議 10~25。
#
# 【技術重點】
# 1. 雙球系統：挑戰左右夾擊。
# 2. Debounce：只有 vy > 0 時才做碰撞判斷，防止同一球重複加分。
# 3. 反彈機制：撞擊後將垂直速度設為負值，產生向上彈飛效果。  # E_ID:cmt_game
import math  # S_ID:imp_math  # E_ID:imp_math
import random  # S_ID:imp_rand  # E_ID:imp_rand
import cv2  # S_ID:pose_init
import mediapipe as mp
mp_pose = mp.solutions.pose
mp_draw = mp.solutions.drawing_utils
mp_pose_model = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)  # E_ID:pose_init  # E_ID:def_zone

if __name__ == "__main__":  # S_ID:main_zone
    score = 0  # S_ID:i_sc  # E_ID:i_sc
    fall_speed = 8  # S_ID:i_sp  # E_ID:i_sp
    bounce_power = 15  # S_ID:i_bp  # E_ID:i_bp
    bx1 = random.randint(100, 500)  # S_ID:i_b1x  # E_ID:i_b1x
    by1 = -50  # S_ID:i_b1y  # E_ID:i_b1y
    vy1 = fall_speed  # S_ID:i_b1v  # E_ID:i_b1v
    bx2 = random.randint(100, 500)  # S_ID:i_b2x  # E_ID:i_b2x
    by2 = -300  # S_ID:i_b2y  # E_ID:i_b2y
    vy2 = fall_speed  # S_ID:i_b2v  # E_ID:i_b2v
    cap = cv2.VideoCapture(0)  # S_ID:oc  # E_ID:oc
    while True:  # S_ID:ml
        ret, frame = cap.read()  # S_ID:rf  # E_ID:rf
        frame = cv2.flip(frame, 1)  # S_ID:ff  # E_ID:ff
        results = mp_pose_model.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))  # S_ID:pp  # E_ID:pp
        if results.pose_landmarks is not None:  # S_ID:ip
            nose = (int(((results.pose_landmarks if results.pose_landmarks else None).landmark[0] if (results.pose_landmarks if results.pose_landmarks else None) else None).x * 640), int(((results.pose_landmarks if results.pose_landmarks else None).landmark[0] if (results.pose_landmarks if results.pose_landmarks else None) else None).y * 480)) if ((results.pose_landmarks if results.pose_landmarks else None).landmark[0] if (results.pose_landmarks if results.pose_landmarks else None) else None) else (0, 0)  # S_ID:sn  # E_ID:sn
            # 球 1 碰撞 (下落時才判定)  # S_ID:c1  # E_ID:c1
            dist = math.sqrt((nose[int(1 - 1)] - bx1) ** 2 + (nose[int(2 - 1)] - by1) ** 2)  # S_ID:d1  # E_ID:d1
            if dist < 45 and vy1 > 0:  # S_ID:h1
                score = score + 1  # S_ID:su1  # E_ID:su1
                vy1 = 0 - bounce_power  # S_ID:rv1  # E_ID:rv1  # E_ID:h1
            # 球 2 碰撞判斷  # S_ID:c2  # E_ID:c2
            dist = math.sqrt((nose[int(1 - 1)] - bx2) ** 2 + (nose[int(2 - 1)] - by2) ** 2)  # S_ID:d2  # E_ID:d2
            if dist < 45 and vy2 > 0:  # S_ID:h2
                score = score + 1  # S_ID:su2  # E_ID:su2
                vy2 = 0 - bounce_power  # S_ID:rv2  # E_ID:rv2  # E_ID:h2  # E_ID:ip
        # 物理運動與邊界  # S_ID:c_upd  # E_ID:c_upd
        by1 = by1 + vy1  # S_ID:mv1  # E_ID:mv1
        by2 = by2 + vy2  # S_ID:mv2  # E_ID:mv2
        if by1 > 480 or by1 < -150:  # S_ID:ck1
            bx1 = random.randint(100, 500)  # S_ID:rs1x  # E_ID:rs1x
            by1 = -50  # S_ID:rs1y  # E_ID:rs1y
            vy1 = fall_speed  # S_ID:rs1v  # E_ID:rs1v  # E_ID:ck1
        if by2 > 480 or by2 < -150:  # S_ID:ck2
            bx2 = random.randint(100, 500)  # S_ID:rs2x  # E_ID:rs2x
            by2 = -50  # S_ID:rs2y  # E_ID:rs2y
            vy2 = fall_speed  # S_ID:rs2v  # E_ID:rs2v  # E_ID:ck2
        cv2.circle(frame, tuple(map(int, (bx1, by1))), int(25), (0, 165, 255), (-1))  # S_ID:dr1  # E_ID:dr1
        cv2.circle(frame, tuple(map(int, (bx2, by2))), int(25), (255, 100, 0), (-1))  # S_ID:dr2  # E_ID:dr2
        cocoya_draw_rect_alpha(frame, (20, 20), (250, 75), (0, 0, 0), 0.5)  # S_ID:sbg  # E_ID:sbg
        cocoya_draw_text_zh(frame, f'遊戲得分：{score}', tuple(map(int, (30, 55))), (255, 255, 255), 30)  # S_ID:stxt  # E_ID:stxt
        cv2.imshow('Cocoya Video', frame)  # S_ID:sh  # E_ID:sh
        if cv2.waitKey(1) & 0xFF == ord('q'):  # S_ID:wk
            break  # E_ID:wk  # E_ID:ml
    cap.release()  # S_ID:VN@xA:|IXrCqlM7b(CwJ
    cv2.destroyAllWindows()  # E_ID:VN@xA:|IXrCqlM7b(CwJ  # E_ID:main_zone