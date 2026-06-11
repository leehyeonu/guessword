import logging
from difflib import SequenceMatcher

import numpy as np
import fasttext

logger = logging.getLogger("malmatch.nlp")

class FastTextWrapper:
    def __init__(self, model_path: str):
        logger.info(f"{model_path} 경로에서 모델 로딩 시작...")
        self.model = fasttext.load_model(model_path)
        logger.info("FastText 모델 로드 성공")
        
        # 정답별 최인접 이웃(1000개) 캐싱 딕셔너리
        # { target_word: (rank_map, rank_1000_sim) }
        self.target_cache = {}
        
        # 정답 단어별 벡터 및 L2 Norm 캐시
        # { target_word: (vector, norm) }
        self.target_vector_cache = {}

    def is_word_in_vocab(self, word: str) -> bool:
        """어휘 사전(Vocab)에 단어가 등록되어 있는지 체크"""
        if not word:
            return False
        return self.model.get_word_id(word) != -1

    def get_word_vector(self, word: str) -> np.ndarray:
        """단어별 300차원 FastText 임베딩 벡터 추출"""
        return np.array(self.model.get_word_vector(word), dtype=np.float32)

    def _get_textual_similarity_bonus(self, target_word: str, guess_word: str) -> float:
        """동음이의어 또는 부분 매칭 형태소 보너스 계산"""
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
        """두 단어 간의 코사인 유사도 산출 (L2 Norm 캐싱 적용)"""
        if word1 in self.target_vector_cache:
            v1, norm_v1 = self.target_vector_cache[word1]
        else:
            v1 = self.get_word_vector(word1)
            norm_v1 = np.linalg.norm(v1)
            self.target_vector_cache[word1] = (v1, norm_v1)
            
        v2 = self.get_word_vector(word2)
        norm_v2 = np.linalg.norm(v2)
        
        if norm_v1 == 0.0 or norm_v2 == 0.0:
            return 0.0
            
        similarity = np.dot(v1, v2) / (norm_v1 * norm_v2)
        return float(similarity)

    def _get_or_cache_neighbors(self, target_word: str) -> tuple[dict[str, int], float]:
        """정답 단어 기준의 Top 1000 유사 단어 순위 맵 조회 및 메모리 캐싱"""
        if target_word in self.target_cache:
            return self.target_cache[target_word]

        rank_map = {}
        rank_1000_sim = 0.35
        try:
            # (similarity, word) 튜플 리스트 반환
            neighbors = self.model.get_nearest_neighbors(target_word, k=1000)
            if neighbors:
                rank_1000_sim = float(neighbors[-1][0])
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
            
        result = (rank_map, rank_1000_sim)
        self.target_cache[target_word] = result
        return result

    def calculate_score(self, target_word: str, guess_word: str) -> tuple[float, float]:
        """코사인 유사도를 기반으로 최종 인게임 스코어(0~100점) 스케일링 적용
        
        스코어 분포 정책 (로그 스케일 및 유사도 보간):
        - 100점: exact match (정답 단어)
        - 95~99점: 유사도 Top 3 이내 (동의어/반의어 수준)
        - 85~95점: 유사도 Top 4 ~ 15 이내
        - 70~85점: 유사도 Top 16 ~ 100 이내
        - 55~70점: 유사도 Top 101 ~ 500 이내
        - 50~55점: 유사도 Top 501 ~ 1000 이내
        - 0~50점: 1000위 밖 (코사인 유사도로 직접 0~50점 맵핑)
        """
        import math
        
        if guess_word == target_word:
            return 1.0, 100.0

        # 1. 순수 코사인 유사도 계산 (보너스 더하기 전)
        cos_sim = self.calculate_cosine_similarity(target_word, guess_word)
        rank_map, rank_1000_sim = self._get_or_cache_neighbors(target_word)

        calibrated_score = 0.0

        if guess_word in rank_map:
            # [1구간] 1000위 이내: 로그 기반 순위 스케일링 (50 ~ 99점)
            # log 스케일링은 상위 순위(1~10위)에서 자연스러운 점수 차를 만들고,
            # 하위 순위(500~1000위)에서는 점수가 완만하게 내려감
            rank = rank_map[guess_word]
            log_rank = math.log(rank)       # log(1)=0, log(1000)≈6.9
            log_max = math.log(1000)        # ≈6.9
            normalized = 1.0 - (log_rank / log_max)  # 1위→1.0, 1000위→0.0
            calibrated_score = 50.0 + 49.0 * normalized
        else:
            # [2구간] 1000위 밖: 유사도 기반 스케일링 (0 ~ 50점)
            min_sim = 0.02
            max_sim = rank_1000_sim

            if cos_sim <= min_sim:
                calibrated_score = 0.0
            else:
                normalized = (cos_sim - min_sim) / (max_sim - min_sim)
                normalized = min(1.0, max(0.0, normalized))
                calibrated_score = 50.0 * (normalized ** 1.4)

        # 2. 텍스트 형태소 보너스 (최대 5점으로 축소하여 점수 인플레이션 방지)
        text_bonus = self._get_textual_similarity_bonus(target_word, guess_word)
        score_bonus = text_bonus * 33  # 0.15 * 33 ≈ 5점 최대
        calibrated_score += score_bonus

        # 정답 단어와 부분적으로 겹치는 경우, 최소 점수 보장
        if target_word in guess_word or guess_word in target_word:
            calibrated_score = max(calibrated_score, 30.0)

        # 100점은 오직 정답(exact match)만 가능 — 정답이 아닌 단어는 최대 99점
        calibrated_score = max(0.0, min(99.0, calibrated_score))
        
        # 보너스가 포함된 최종 코사인 유사도 반환 (표시용)
        display_cos_sim = min(1.0, cos_sim + text_bonus)
        
        return display_cos_sim, round(calibrated_score, 2)
