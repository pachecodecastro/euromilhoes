"""
Testes do script euromilhoes_chi2.py (só biblioteca padrão).

Correr:  python3 -m unittest discover -s analysis -v
"""

import random
import unittest
from collections import Counter

import euromilhoes_chi2 as m


class TestChi2Cdf(unittest.TestCase):
    """Valores de referência: scipy.stats.chi2.sf(x, df), 4 casas."""

    def test_reference_values(self):
        cases = [
            (3.841, 1, 0.0500),
            (9.488, 4, 0.0500),
            (48.15, 49, 0.5075),
            (14.64, 11, 0.1996),
            (63.69, 49, 0.0774),
        ]
        for x, df, expected in cases:
            with self.subTest(x=x, df=df):
                self.assertAlmostEqual(1 - m.chi2_cdf(x, df), expected, delta=0.0005)

    def test_limits(self):
        self.assertEqual(m.chi2_cdf(0, 5), 0.0)
        self.assertGreater(m.chi2_cdf(500, 5), 0.999999)


class TestCounting(unittest.TestCase):
    def test_count_frequencies(self):
        rows = [
            {"n1": "1", "n2": "2", "n3": "3", "n4": "4", "n5": "5", "s1": "1", "s2": "2"},
            {"n1": "1", "n2": "2", "n3": "3", "n4": "4", "n5": "6", "s1": "1", "s2": "3"},
        ]
        nums, stars = m.count_frequencies(rows)
        self.assertEqual(nums[1], 2)
        self.assertEqual(nums[5], 1)
        self.assertEqual(nums[6], 1)
        self.assertEqual(stars[1], 2)
        self.assertEqual(sum(nums.values()), 10)
        self.assertEqual(sum(stars.values()), 4)


class TestChi2Test(unittest.TestCase):
    def test_perfectly_uniform_data(self):
        # 100 sorteios, cada número exatamente 10 vezes: χ² = 0, p = 1
        observed = {i: 10 for i in range(1, 51)}
        res = m.chi2_test(observed, 50, 5, 100)
        self.assertEqual(res["chi2"], 0)
        self.assertAlmostEqual(res["p_value"], 1.0, places=6)
        self.assertFalse(res["reject_h0"])

    def test_obviously_biased_data_is_rejected(self):
        observed = {i: 5 for i in range(1, 51)}
        observed[1] = 100
        res = m.chi2_test(observed, 50, 5, 100)
        self.assertTrue(res["reject_h0"])
        self.assertLess(res["p_value"], 0.001)

    def test_scale_factor(self):
        self.assertAlmostEqual(m.without_replacement_scale(50, 5), 49 / 45)
        self.assertAlmostEqual(m.without_replacement_scale(12, 2), 11 / 10)

    def test_adjusted_p_is_lower_than_classic(self):
        observed = {i: 20 + (i % 5) for i in range(1, 51)}
        n_draws = sum(observed.values()) // 5
        res = m.chi2_test(observed, 50, 5, n_draws)
        self.assertGreater(res["chi2_adjusted"], res["chi2"])
        self.assertLess(res["p_value"], res["p_value_classic"])

    def test_too_few_draws_is_refused(self):
        with self.assertRaises(AssertionError):
            m.chi2_test({i: 1 for i in range(1, 51)}, 50, 5, 10)


class TestCalibration(unittest.TestCase):
    """Confirma por simulação (com semente fixa) que a correção está certa."""

    def mean_statistic(self, n_cat, per, n_draws, reps):
        rng = random.Random(7)
        expected = per * n_draws / n_cat
        total = 0.0
        for _ in range(reps):
            counts = Counter()
            for _ in range(n_draws):
                counts.update(rng.sample(range(1, n_cat + 1), per))
            total += m.chi2_statistic(counts, n_cat, expected)
        return total / reps

    def test_mean_of_classic_statistic_is_n_minus_k(self):
        # Teoria: E[χ²] = N − k (45 para 5/50), não N − 1 (49)
        mean = self.mean_statistic(50, 5, 300, 300)
        self.assertAlmostEqual(mean, 45, delta=2.5)

    def test_mean_of_adjusted_statistic_is_degrees_of_freedom(self):
        mean = self.mean_statistic(50, 5, 300, 300) * m.without_replacement_scale(50, 5)
        self.assertAlmostEqual(mean, 49, delta=2.5)

    def test_simulated_p_matches_corrected_p(self):
        observed_chi2 = 48.15
        p_sim = m.simulate_p_value(observed_chi2, 50, 5, 1039, reps=400, seed=1)
        p_adj = 1 - m.chi2_cdf(observed_chi2 * m.without_replacement_scale(50, 5), 49)
        self.assertAlmostEqual(p_sim, p_adj, delta=0.08)


if __name__ == "__main__":
    unittest.main()
