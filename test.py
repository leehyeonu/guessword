import fasttext
import numpy as np

# 1. 코사인 유사도 계산 함수 (두 단어가 얼마나 비슷한지 %로 반환)
def cosine_similarity(vec1, vec2):
    dot_product = np.dot(vec1, vec2)
    norm_vec1 = np.linalg.norm(vec1)
    norm_vec2 = np.linalg.norm(vec2)
    return dot_product / (norm_vec1 * norm_vec2)

print("모델 로딩 중... (4.5GB 파일이라 1~2분 정도 걸립니다. 컴퓨터 램도 5GB 정도 씁니다!)")
# 2. 다운받은 모델 파일 불러오기
model = fasttext.load_model('models/cc.ko.300.bin')
print("로딩 완료!\n")

# 3. 테스트할 단어들
target = "사과"
guesses = ["바나나", "포도", "우주선", "애플", "사과나무", "기차", "뀰빵이"] # 뀰빵이=사전에 없는 단어

target_vec = model.get_word_vector(target)

print(f"정답 단어: [{target}]")
for word in guesses:
    guess_vec = model.get_word_vector(word)
    sim = cosine_similarity(target_vec, guess_vec)
    # 소수점 값을 보기 좋게 100점 만점으로 변환
    score = sim * 100
    print(f"'{word}' 입력 시 유사도: {score:.2f}점")