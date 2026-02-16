import cv2  # ID:FVJEH)kt-HX6d]SA2=86  # ID:Bdnw_V/[8M]Jo#_UyXzr

if __name__ == "__main__":  # ID:p:|{}^h|CUVx%-*[UR[:
    cap = cv2.VideoCapture(0)  # ID:KNSpp|FG?Q2lG~TWzUzX
    while True:  # ID:(,knB!Ds3VQp,o0BTr(f
        ret, frame = cap.read()  # ID:y~*-jX{W6f4eHdfDP85:
        frame = cv2.flip(frame, 1)  # ID:1kR!ykjk/ErC*mA0;NtV
        cv2.imshow('Cocoya Video', frame)  # ID:Q^lZgVIg-,biE-b$W1!^
        if cv2.waitKey(1) & 0xFF == ord('q'):  # ID:D~})?7P+sabTaEXgqI9N
            break
    cap.release()  # ID:A(CtJW7060y(j%Audi=%
    cv2.destroyAllWindows()