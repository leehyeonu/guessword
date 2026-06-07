import logging
import numpy as np
import fasttext

logger = logging.getLogger("guessword.nlp")

class FastTextWrapper:
    def __init__(self, model_path: str):
        logger.info(f"{model_path} 경로에서 FastText 모델 로드 중...")
        # fasttext 라이브러리를 사용하여 모델 로드
        self.model = fasttext.load_model(model_path)
        logger.info("FastText 모델이 성공적으로 로드되었습니다.")
        
        # 정답 단어에 대해 상위 1000개의 가장 유사한 이웃 단어를 저장하는 캐시 딕셔너리
        # 구조: { target_word: { neighbor_word: rank } }
        self.target_cache = {}

    def is_word_in_vocab(self, word: str) -> bool:
        """
        O(1) 속도의 get_word_id를 사용하여 단어가 모델의 어휘 사전에 존재하는지 확인합니다.
        FastText는 사전에 없는 단어(OOV)일 경우 -1을 반환합니다.
        """
        if not word:
            return False
        return self.model.get_word_id(word) != -1

    def get_word_vector(self, word: str) -> np.ndarray:
        """
        단어의 300차원 벡터를 가져옵니다.
        """
        return np.array(self.model.get_word_vector(word), dtype=np.float32)

    def calculate_cosine_similarity(self, word1: str, word2: str) -> float:
        """
        NumPy를 사용하여 두 단어 간의 코사인 유사도를 계산합니다.
        """
        v1 = self.get_word_vector(word1)
        v2 = self.get_word_vector(word2)
        
        norm_v1 = np.linalg.norm(v1)
        norm_v2 = np.linalg.norm(v2)
        
        if norm_v1 == 0.0 or norm_v2 == 0.0:
            return 0.0
            
        similarity = np.dot(v1, v2) / (norm_v1 * norm_v2)
        return float(similarity)

    def _get_or_cache_neighbors(self, target_word: str) -> dict:
        """
        정답 단어에 대해 상위 1000개의 가장 유사한 이웃 단어를 가져오고 결과를 캐싱합니다.
        { neighbor_word: rank (1-1000) } 형태의 딕셔너리를 반환합니다.
        """
        if target_word in self.target_cache:
            return self.target_cache[target_word]

        rank_map = {}
        try:
            # get_nearest_neighbors는 (similarity, word)의 리스트를 반환합니다.
            # 1000개의 이웃 단어를 요청합니다.
            neighbors = self.model.get_nearest_neighbors(target_word, k=1000)
            
            for rank, (sim, neighbor_word) in enumerate(neighbors, 1):
                # 바이트 문자열인 경우 utf-8로 디코딩
                if isinstance(neighbor_word, bytes):
                    neighbor_word = neighbor_word.decode('utf-8')
                
                # FastText가 빈 값이나 공백 문자를 반환할 수 있으므로 건너뜁니다.
                neighbor_word = neighbor_word.strip()
                if neighbor_word:
                    # 중복 단어가 반환될 경우 가장 높은 순위(첫 등장)를 유지합니다.
                    if neighbor_word not in rank_map:
                        rank_map[neighbor_word] = rank
        except Exception as e:
            logger.error(f"'{target_word}'에 대한 이웃 단어를 가져오는 중 오류 발생: {e}")
            
        self.target_cache[target_word] = rank_map
        return rank_map

    def calculate_score(self, target_word: str, guess_word: str) -> tuple[float, float]:
        """
        코사인 유사도와 비선형으로 보정된 점수를 계산합니다.
        반환값:
            (cosine_similarity, calibrated_score)
        """
        # 1. 정확히 일치하면 즉시 100.0점을 반환합니다.
        if guess_word == target_word:
            return 1.0, 100.0

        # 기본 코사인 유사도 계산
        cos_sim = self.calculate_cosine_similarity(target_word, guess_word)

        # 2. 비선형 순위 기반 스케일링을 위해 가장 유사한 이웃 단어 매핑을 가져옵니다.
        rank_map = self._get_or_cache_neighbors(target_word)

        if guess_word in rank_map:
            # 1단계: 상위 1000위 이내 (유사한 의미적 매칭)
            # 순위에 따라 50.0점에서 100.0점 사이로 비선형 스케일링
            rank = rank_map[guess_word]
            # 2차 스케일링: 1위에 가까울수록 점수가 기하급수적으로 상승
            rank_ratio = (1001 - rank) / 1000.0
            calibrated_score = 50.0 + 50.0 * (rank_ratio ** 2)
        else:
            # 2단계: 상위 1000위 바깥 (연관성 낮음/보통)
            # 일반적인 비이웃 단어들의 코사인 유사도(보통 [0, 0.5] 범위)를 0.0 ~ 50.0점으로 스케일링
            # 3차 스케일링을 사용하여 낮은 유사도 값을 0에 가깝게 강하게 누릅니다.
            calibrated_score = 50.0 * (max(0.0, cos_sim) ** 3)

        # 점수를 0.0점에서 100.0점 사이로 고정
        calibrated_score = max(0.0, min(100.0, calibrated_score))
        
        return cos_sim, round(calibrated_score, 2)

