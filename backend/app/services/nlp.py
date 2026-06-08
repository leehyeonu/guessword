import logging
from difflib import SequenceMatcher

import numpy as np
import fasttext

logger = logging.getLogger("guessword.nlp")

class FastTextWrapper:
    def __init__(self, model_path: str):
        logger.info(f"{model_path} 경로에서 모델 로딩 시작...")
        self.model = fasttext.load_model(model_path)
        logger.info("FastText 모델 로드 성공")
        
        # 정답별 최인접 이웃(1000개) 캐싱 딕셔너리
        # { target_word: { neighbor_word: rank } }
        self.target_cache = {}

    def is_word_in_vocab(self, word: str) -> bool:
        """단어가 모델 어휘 사전에 존재하는지 확인 (없으면 get_word_id가 -1 반환)"""
        if not word:
            return False
        return self.model.get_word_id(word) != -1

    def get_word_vector(self, word: str) -> np.ndarray:
        """단어의 300차원 벡터 추출"""
        return np.array(self.model.get_word_vector(word), dtype=np.float32)

    def _get_textual_similarity_bonus(self, target_word: str, guess_word: str) -> float:
        """부분 문자열, 공통 문자, 유사 문자열 구성 요소를 점수 보정에 반영"""
        if not target_word or not guess_word:
            return 0.0

        if target_word in guess_word or guess_word in target_word:
            return 0.15

        sequence_ratio = SequenceMatcher(None, target_word, guess_word).ratio()
        if sequence_ratio >= 0.35:
            return 0.10
        if sequence_ratio >= 0.20:
            return 0.06
        return 0.0

    def calculate_cosine_similarity(self, word1: str, word2: str) -> float:
        """두 단어 벡터 간 코사인 유사도 연산"""
        v1 = self.get_word_vector(word1)
        v2 = self.get_word_vector(word2)
        
        norm_v1 = np.linalg.norm(v1)
        norm_v2 = np.linalg.norm(v2)
        
        if norm_v1 == 0.0 or norm_v2 == 0.0:
            return 0.0
            
        similarity = np.dot(v1, v2) / (norm_v1 * norm_v2)
        return float(similarity)

    def _get_or_cache_neighbors(self, target_word: str) -> dict:
        """정답 단어의 최인접 이웃 1000개 순위 매핑 및 캐싱"""
        if target_word in self.target_cache:
            return self.target_cache[target_word]

        rank_map = {}
        try:
            # (similarity, word) 튜플 리스트 반환
            neighbors = self.model.get_nearest_neighbors(target_word, k=1000)
            
            for rank, (sim, neighbor_word) in enumerate(neighbors, 1):
                if isinstance(neighbor_word, bytes):
                    neighbor_word = neighbor_word.decode('utf-8')
                
                neighbor_word = neighbor_word.strip()
                if neighbor_word:
                    # 중복 키 유입 시 높은 순위(최초 등장) 유지
                    if neighbor_word not in rank_map:
                        rank_map[neighbor_word] = rank
        except Exception as e:
            logger.error(f"'{target_word}' 이웃 추출 에러: {e}")
            
        self.target_cache[target_word] = rank_map
        return rank_map

    def calculate_score(self, target_word: str, guess_word: str) -> tuple[float, float]:
        """두 단어의 코사인 유사도와 0~100 사이의 게임 보정 점수 계산"""
        # 완전 일치 시 100점 즉시 반환
        if guess_word == target_word:
            return 1.0, 100.0

        cos_sim = self.calculate_cosine_similarity(target_word, guess_word)
        text_bonus = self._get_textual_similarity_bonus(target_word, guess_word)
        cos_sim = min(1.0, cos_sim + text_bonus)
        rank_map = self._get_or_cache_neighbors(target_word)

        if guess_word in rank_map:
            # 1구간: 1000위 이내 유사 단어
            # 순위에 따라 50.0 ~ 100.0점 사이로 스케일링
            rank = rank_map[guess_word]
            rank_ratio = (1001 - rank) / 1000.0
            calibrated_score = 50.0 + 50.0 * (rank_ratio ** 1.25)
        else:
            # 2구간: 1000위 밖의 일반 단어
            # 코사인 유사도 범위(보통 0.02 ~ 0.55)를 0.0 ~ 50.0점으로 매핑
            min_sim = 0.02
            max_sim = 0.55
            if cos_sim <= min_sim:
                calibrated_score = 0.0
            else:
                normalized = (cos_sim - min_sim) / (max_sim - min_sim)
                normalized = min(1.0, max(0.0, normalized))
                calibrated_score = 50.0 * (normalized ** 1.4)

            # 정답 단어와 부분적으로 겹치는 경우, 최소 점수를 보장
            if target_word in guess_word or guess_word in target_word:
                calibrated_score = max(calibrated_score, 30.0)

        # 0.0 ~ 100.0 범위 클리핑
        calibrated_score = max(0.0, min(100.0, calibrated_score))
        
        return cos_sim, round(calibrated_score, 2)
