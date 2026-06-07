import logging
import numpy as np
import fasttext

logger = logging.getLogger("guessword.nlp")

class FastTextWrapper:
    def __init__(self, model_path: str):
        logger.info(f"Loading FastText model from {model_path}...")
        # Load the model using fasttext library
        self.model = fasttext.load_model(model_path)
        logger.info("FastText model loaded successfully.")
        
        # Cache dictionary to store top 1000 nearest neighbors for target words
        # Structure: { target_word: { neighbor_word: rank } }
        self.target_cache = {}

    def is_word_in_vocab(self, word: str) -> bool:
        """
        Check if the word exists in the model's vocabulary using O(1) get_word_id.
        FastText returns -1 if the word is Out Of Vocabulary (OOV).
        """
        if not word:
            return False
        return self.model.get_word_id(word) != -1

    def get_word_vector(self, word: str) -> np.ndarray:
        """
        Get the 300-dimension vector of a word.
        """
        return np.array(self.model.get_word_vector(word), dtype=np.float32)

    def calculate_cosine_similarity(self, word1: str, word2: str) -> float:
        """
        Calculate the cosine similarity between two words using NumPy.
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
        Retrieve top 1000 nearest neighbors for a target word, caching the result.
        Returns a dictionary of { neighbor_word: rank (1-1000) }.
        """
        if target_word in self.target_cache:
            return self.target_cache[target_word]

        rank_map = {}
        try:
            # get_nearest_neighbors returns a list of (similarity, word)
            # We request 1000 neighbors
            neighbors = self.model.get_nearest_neighbors(target_word, k=1000)
            
            for rank, (sim, neighbor_word) in enumerate(neighbors, 1):
                # Normalize byte strings to utf-8 if returned as bytes
                if isinstance(neighbor_word, bytes):
                    neighbor_word = neighbor_word.decode('utf-8')
                
                # FastText can sometimes return empty or whitespace words, skip those
                neighbor_word = neighbor_word.strip()
                if neighbor_word:
                    # In case of duplicate words returned, keep the highest rank (first occurrence)
                    if neighbor_word not in rank_map:
                        rank_map[neighbor_word] = rank
        except Exception as e:
            logger.error(f"Error fetching nearest neighbors for '{target_word}': {e}")
            
        self.target_cache[target_word] = rank_map
        return rank_map

    def calculate_score(self, target_word: str, guess_word: str) -> tuple[float, float]:
        """
        Compute the cosine similarity and the calibrated, non-linear score.
        Returns:
            (cosine_similarity, calibrated_score)
        """
        # 1. Exact match gets 100.0 score immediately
        if guess_word == target_word:
            return 1.0, 100.0

        # Calculate base cosine similarity
        cos_sim = self.calculate_cosine_similarity(target_word, guess_word)

        # 2. Get nearest neighbors mapping for non-linear rank-based scaling
        rank_map = self._get_or_cache_neighbors(target_word)

        if guess_word in rank_map:
            # Tier 1: Inside Top 1000 (Close Semantic Match)
            # Scale non-linearly between 50.0 and 100.0 based on rank
            rank = rank_map[guess_word]
            # Quadratic scaling: closer to 1st place means exponentially higher score
            rank_ratio = (1001 - rank) / 1000.0
            calibrated_score = 50.0 + 50.0 * (rank_ratio ** 2)
        else:
            # Tier 2: Outside Top 1000 (Cold / Warm)
            # Scale cosine similarity (usually in [0, 0.5] range for typical non-neighbors) to 0.0 - 50.0
            # Cubic scaling ensures that low similarity values stay extremely close to 0
            calibrated_score = 50.0 * (max(0.0, cos_sim) ** 3)

        # Clamp score between 0.0 and 100.0
        calibrated_score = max(0.0, min(100.0, calibrated_score))
        
        return cos_sim, round(calibrated_score, 2)
