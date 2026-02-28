if __name__ == "__main__":  # S_ID:main_root
    # 1. 型別轉換與運算  # S_ID:c1  # E_ID:c1
    user_input = input('請輸入一個數字: ')  # S_ID:s1  # E_ID:s1
    print(f"""輸入的型別是: {str(type(user_input))}""")  # S_ID:p1  # E_ID:p1
    print(f"""加 100 之後結果: {int(user_input) + 100}""")  # S_ID:p2  # E_ID:p2
    # 2. 清單操作與排序  # S_ID:c2  # E_ID:c2
    data_list = [50, 10, 30]  # S_ID:s2  # E_ID:s2
    data_list.append(25)  # S_ID:ap1  # E_ID:ap1
    sorted_result = sorted(data_list, reverse=False)  # S_ID:s3  # E_ID:s3
    print(f"""排序後結果: {sorted_result}""")  # S_ID:p3  # E_ID:p3
    # 3. 字典與包含判斷  # S_ID:c3  # E_ID:c3
    scores_dict = {'Alice': 95, 'Bob': 88}  # S_ID:s4  # E_ID:s4
    if 'Alice' in scores_dict:  # S_ID:if1
        print(f"""Alice 的分數是: {scores_dict['Alice']}""")  # S_ID:p4  # E_ID:p4
    else:
        pass  # E_ID:if1
    print(f"""字典長度: {len(scores_dict)}""")  # S_ID:p5  # E_ID:p5  # E_ID:main_root