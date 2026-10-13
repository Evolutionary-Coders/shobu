"""Testes da geometria pura do build do Neon-kaidō: a planta do piso e as faces expostas.

Rodam em stdlib, sem blender:

    npm run neon:test

Ficam fora do `npm test` pelo mesmo motivo dos testes do narrador: o vitest não
roda python, e isto é ferramenta de asset (ADR 0001). Cada um guarda um buraco
que a varredura de 12/10 achou no mapa ("dava para ver o limbo").
"""

import unittest

from neon_floorplan import area, grid_cells, grime, road_paint, street_plan, subtract_rects
from neon_layout import Block, exposed_facades, exposed_pieces, solid_spans, subtract_intervals, walk_gaps

WORLD = (60.0, 0.0, 62.0)


def block(name, layer, lo, hi):
    return Block({"name": name, "layer": layer, "zone": "kaido", "minM": list(lo), "maxM": list(hi)})


class SubtractRects(unittest.TestCase):
    def test_hole_in_the_middle_leaves_four_pieces_with_the_exact_area(self):
        pieces = subtract_rects([(0, 0, 10, 10)], [(4, 4, 6, 6)])
        self.assertAlmostEqual(area(pieces), 96)
        self.assertEqual(len(pieces), 4)

    def test_hole_outside_keeps_the_rect(self):
        self.assertEqual(subtract_rects([(0, 0, 10, 10)], [(20, 20, 30, 30)]), [(0, 0, 10, 10)])

    def test_pieces_do_not_overlap(self):
        pieces = subtract_rects([(0, 0, 10, 10)], [(-1, 3, 4, 5), (6, 6, 12, 8)])
        for i, a in enumerate(pieces):
            for b in pieces[i + 1 :]:
                overlap = min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])
                self.assertFalse(overlap, f"{a} sobrepõe {b}")


class StreetPlan(unittest.TestCase):
    """O piso de 11/10 pulava o ladrilho de 4 m inteiro quando o centro caía sob prédio.

    O W1 vai de x -24 a -6,5: o ladrilho de -8 a -4 tinha o centro fora dele e
    virava só faixa do Kaidō (até -6,5), e a faixa de -8 a -6,5 do hiroba ficava
    sem chão.
    """

    FOOTPRINT = (-24.0, -24.0, -6.5, -10.5)

    def plan(self):
        return street_plan(62.0, 36.0, 6.5, 5.0, [self.FOOTPRINT])

    def test_covers_the_whole_floor_except_the_footprint(self):
        total = sum(area(rects) for rects in self.plan().values())
        expected = 72 * 72 + 2 * 13 * 26 - (17.5 * 13.5)
        self.assertAlmostEqual(total, expected)

    def test_the_strip_beside_the_kaido_has_floor(self):
        point = (-7.2, -30.0)
        covered = any(r[0] < point[0] < r[2] and r[1] < point[1] < r[3] for rects in self.plan().values() for r in rects)
        self.assertTrue(covered)

    def test_grid_cells_cover_the_rects_exactly(self):
        rects = self.plan()["beco"]
        self.assertAlmostEqual(area(grid_cells(rects, 2.0)), area(rects))


class RoadPaint(unittest.TestCase):
    def test_paint_stays_on_the_road(self):
        for x0, z0, x1, z1 in road_paint(62.0, 5.0, [(7.5, 11.5)]):
            self.assertTrue(-5 <= x0 < x1 <= 5 and -62 <= z0 < z1 <= 62, (x0, z0, x1, z1))

    def test_centre_dashes_stop_at_the_crossing(self):
        dashes = [r for r in road_paint(62.0, 5.0, [(7.5, 11.5)]) if r[0] == -0.07]
        self.assertFalse(any(z0 < 11.5 and z1 > 7.5 for _, z0, _, z1 in dashes))


class Grime(unittest.TestCase):
    def test_stays_between_the_darkest_stain_and_clean(self):
        values = [grime(x * 0.7, z * 1.3, [(-24, -24, -6.5, -10.5)], 5.0) for x in range(-40, 40) for z in range(-40, 40)]
        self.assertGreaterEqual(min(values), 0.45)
        self.assertLessEqual(max(values), 1.0)
        self.assertGreater(max(values) - min(values), 0.3, "sem variação, o encardido não quebra o ladrilho")


class ExposedFacades(unittest.TestCase):
    """Até 12/10 cada trecho de 13 m saía inteiro pelo que o ponto do meio dele via.

    O trecho com um vizinho alto no meio e espaço aberto na ponta ficava sem
    parede na ponta, e de cima via-se o oco do prédio.
    """

    def test_neighbour_hides_only_the_part_it_touches(self):
        pieces = exposed_pieces((0, 20), (0, 30), [((0, 10), (0, 40))])
        self.assertEqual(pieces, [((10, 20), (0, 30))])

    def test_low_neighbour_hides_only_the_foot(self):
        pieces = exposed_pieces((0, 20), (0, 30), [((0, 20), (0, 6))])
        self.assertEqual(pieces, [((0, 20), (6, 30))])

    def test_partial_neighbour_in_the_middle_of_a_segment_keeps_the_rest(self):
        wall = block("bairro", "outskirt", (-60, 0, -62), (-35, 30, -36))
        tower = block("torre", "tower", (-47, 0, -36), (-40, 20, -20))
        faces = [f for f in exposed_facades(wall, [wall, tower], WORLD) if f.axis == "z" and f.normal == 1]
        covered_by_tower = [f for f in faces if f.span[0] >= -47 - 1e-6 and f.span[1] <= -40 + 1e-6]
        self.assertTrue(covered_by_tower, "o trecho atrás da torre tem que ter fachada acima dela")
        self.assertTrue(all(f.base == 20 for f in covered_by_tower))
        beside = [f for f in faces if f.span[1] <= -47 + 1e-6 or f.span[0] >= -40 - 1e-6]
        self.assertTrue(any(f.span[0] >= -40 - 1e-6 for f in beside), "a ponta depois da torre ficou sem fachada")
        self.assertTrue(all(f.base == 0 for f in beside))

    def test_subtract_intervals(self):
        self.assertEqual(subtract_intervals((0, 10), [(2, 4)]), [(0, 2), (4, 10)])


class WalkGaps(unittest.TestCase):
    """A platibanda e o guarda-corpo abrem onde se chega andando (ADR 0024)."""

    roof = block("fundo", "building", (-35, 0, -20), (-27.5, 6, 20))
    # a escada corre ao lado da fachada leste e chega no telhado no último degrau.
    steps = [block(f"degrau-{i}", "stair", (-27.5, 0, -4 + 0.4 * i), (-25.5, 0.3 * (i + 1), -3.6 + 0.4 * i)) for i in range(20)]
    edge = (2, 0, -27.5, 1, (-20, 20), 6.0)

    def test_the_top_steps_open_a_gap_wide_enough_for_a_body(self):
        gaps = walk_gaps([self.roof, *self.steps], self.edge, own=self.roof)
        widest = max(end - start for start, end in gaps)
        self.assertGreaterEqual(widest, 1.6)
        self.assertTrue(all(-20 <= start < end <= 20 for start, end in gaps))

    def test_the_gap_is_where_the_stair_arrives(self):
        spans = solid_spans((-20, 20), walk_gaps([self.roof, *self.steps], self.edge, own=self.roof))
        self.assertEqual(len(spans), 2)
        self.assertLess(spans[0][1], 3.6)
        self.assertGreater(spans[1][0], 4.0)

    def test_a_walkway_at_another_height_or_away_from_the_edge_opens_nothing(self):
        low = block("passarela", "walkway", (-27.5, 2.5, 0), (-20, 3, 4))
        far = block("ponte", "walkway", (-25, 5.5, 0), (-20, 6, 4))
        self.assertEqual(walk_gaps([self.roof, low, far], self.edge, own=self.roof), [])


if __name__ == "__main__":
    unittest.main()
