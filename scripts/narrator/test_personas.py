"""Testes das personas do narrador: roteiro, voz neural, entrega e pronúncia.

Stdlib pura, como `test_narrator.py`: o Kokoro e o ffmpeg nunca rodam aqui — o que
se testa é o comando montado e a decisão de quem roda.
"""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from build_narrator import (
    DEFAULT_OUT_DIR, DEFAULT_WORK_DIR, RvcOptions, apply_persona, load_lines, parse_args,
    select_engine, select_speech, select_voice,
)
from delivery import (
    DELIVERIES, DeliveryVoice, arena_chain, drive, machine_chain, radio_chain, semitone_ratio,
    squelch_graph,
)
from markdown_lines import parse_markdown
from neural_speech import ChatterboxSpeech, KokoroSpeech, venv_python
from personas import PERSONAS, require_persona
from pronunciation import LEADING_PAUSE, fix_phonemes

LINES_MD = Path(__file__).resolve().parent / "lines.md"
VISOR_WIDTH = 40
RVC = RvcOptions(model=Path("m.pth"), index=None, python_executable="python",
                 script=Path("rvc_infer.py"))


def slugs_of(markdown: Path) -> list[str]:
    _, entries = parse_markdown(markdown.read_text(encoding="utf-8"), markdown)
    return [entry["slug"] for entry in entries]


def takes_of(markdown: Path) -> list[str]:
    _, entries = parse_markdown(markdown.read_text(encoding="utf-8"), markdown)
    return [take for entry in entries for take in entry["takes"]]


class PersonaScriptTest(unittest.TestCase):
    def test_every_persona_speaks_every_event_of_the_base_script(self) -> None:
        for persona in PERSONAS.values():
            with self.subTest(persona=persona.name):
                self.assertLessEqual(set(slugs_of(LINES_MD)), set(slugs_of(persona.script)))

    def test_every_persona_speaks_the_death_of_the_player(self) -> None:
        for persona in PERSONAS.values():
            with self.subTest(persona=persona.name):
                self.assertIn("death", slugs_of(persona.script))

    def test_every_line_fits_one_line_of_the_visor(self) -> None:
        for persona in PERSONAS.values():
            long = [take for take in takes_of(persona.script) if len(take) > VISOR_WIDTH]
            with self.subTest(persona=persona.name):
                self.assertEqual(long, [])

    def test_personas_do_not_share_wording(self) -> None:
        """Personalidade é texto próprio: a mesma frase em duas personas é cópia."""
        seen: dict[str, str] = {}
        for persona in PERSONAS.values():
            for take in takes_of(persona.script):
                with self.subTest(take=take):
                    self.assertNotIn(take, seen, f"{take!r} já é de {seen.get(take)}")
                seen[take] = persona.name

    def test_no_shipped_line_names_a_third_party_character_or_game(self) -> None:
        banned = ("shaxx", "black ops", "guardião", "guardian")
        for persona in PERSONAS.values():
            text = persona.script.read_text(encoding="utf-8").lower()
            with self.subTest(persona=persona.name):
                self.assertEqual([word for word in banned if word in text], [])

    def test_folder_is_name_and_locale_like_the_other_voices(self) -> None:
        self.assertEqual(PERSONAS["comandante"].folder, "comandante-pt-BR")

    def test_label_is_the_folder_without_locale_in_capitals(self) -> None:
        for persona in PERSONAS.values():
            with self.subTest(persona=persona.name):
                self.assertEqual(persona.label, persona.name.upper())

    def test_delivery_of_every_persona_exists(self) -> None:
        for persona in PERSONAS.values():
            with self.subTest(persona=persona.name):
                self.assertIn(persona.delivery, DELIVERIES)

    def test_unknown_persona_lists_the_known_ones(self) -> None:
        with self.assertRaisesRegex(ValueError, r"'bardo'.*atlas.*comandante.*mestre"):
            require_persona("bardo")


class PersonaBuildTest(unittest.TestCase):
    def test_persona_fills_script_voice_and_delivery(self) -> None:
        args = apply_persona(parse_args(["--persona", "mestre"]))
        self.assertEqual((args.lines, args.speech, args.tts_voice, args.voice),
                         (PERSONAS["mestre"].script, "kokoro", "pm_santa", "arena"))

    def test_persona_records_in_its_own_folders(self) -> None:
        args = apply_persona(parse_args(["--persona", "atlas"]))
        self.assertEqual((args.out_dir, args.work_dir),
                         (DEFAULT_OUT_DIR / "atlas-pt-BR", DEFAULT_WORK_DIR / "atlas-pt-BR"))

    def test_what_comes_from_the_command_line_wins_over_the_persona(self) -> None:
        args = apply_persona(parse_args(["--persona", "mestre", "--speed", "1.3",
                                         "--engine", "piper"]))
        self.assertEqual((args.speed, args.speech), (1.3, "piper"))

    def test_without_persona_the_old_defaults_stay(self) -> None:
        args = apply_persona(parse_args([]))
        self.assertEqual((args.speech, args.voice, args.out_dir), ("auto", "source",
                                                                   DEFAULT_OUT_DIR))

    def test_markdown_script_loads_without_a_json(self) -> None:
        catalog = load_lines(PERSONAS["comandante"].script)
        self.assertEqual(catalog.locale, "pt-BR")
        self.assertIn("death", catalog.slugs)

    def test_json_catalog_still_loads(self) -> None:
        self.assertGreater(len(load_lines(LINES_MD.with_suffix(".json")).lines), 0)

    def test_kokoro_engine_gets_the_voice_and_speed(self) -> None:
        speech = select_speech("kokoro", None, "pt-BR", 1.15, tts_voice="pf_dora")
        self.assertEqual(speech.name, "kokoro:pf_dora@1.15")

    def test_each_delivery_is_a_voice_of_its_own(self) -> None:
        for delivery in DELIVERIES:
            with self.subTest(delivery=delivery):
                self.assertEqual(select_voice(delivery, RVC).name, f"entrega:{delivery}")


class KokoroSpeechTest(unittest.TestCase):
    def test_argv_runs_our_script_in_the_venv_with_pt_br(self) -> None:
        with TemporaryDirectory() as home:
            argv = KokoroSpeech(voice="pm_santa", speed=1.15, home=Path(home)).argv(Path("a.wav"))
        self.assertEqual(argv[1].rsplit("/", 1)[-1], "kokoro_say.py")
        self.assertEqual(argv[argv.index("--lang") + 1], "pt-br")
        self.assertEqual(argv[argv.index("--speed") + 1], "1.15")

    def test_missing_venv_says_how_to_install(self) -> None:
        with TemporaryDirectory() as home:
            self.assertIn("install-kokoro.sh", KokoroSpeech("pm_santa", home=Path(home))
                          .missing_tool() or "")

    def test_missing_weights_are_named(self) -> None:
        with TemporaryDirectory() as home:
            (Path(home) / "bin").mkdir()
            python = Path(home) / "bin/python"
            python.write_text("#!/bin/sh\n")
            python.chmod(0o755)
            self.assertIn("kokoro-v1.0.onnx",
                          KokoroSpeech("pm_santa", home=Path(home)).missing_tool() or "")

    def test_venv_python_falls_back_to_the_system_name(self) -> None:
        self.assertEqual(venv_python(Path("/não/existe")), "python")


class ChatterboxSpeechTest(unittest.TestCase):
    def test_engine_needs_a_reference_and_says_so(self) -> None:
        args = apply_persona(parse_args(["--persona", "mestre", "--engine", "chatterbox"]))
        with self.assertRaisesRegex(SystemExit, "--reference"):
            select_engine(args, "pt-BR")

    def test_engine_takes_the_reference_and_the_exaggeration(self) -> None:
        args = apply_persona(parse_args(["--persona", "mestre", "--engine", "chatterbox",
                                         "--reference", "santa.wav", "--exaggeration", "1.6"]))
        self.assertEqual(select_engine(args, "pt-BR").name, "chatterbox:santa@1.6")

    def test_kokoro_still_comes_from_the_persona(self) -> None:
        args = apply_persona(parse_args(["--persona", "atlas"]))
        self.assertEqual(select_engine(args, "pt-BR").name, "kokoro:pf_dora@1")

    def test_argv_carries_reference_and_exaggeration(self) -> None:
        argv = ChatterboxSpeech(reference=Path("r.wav"), exaggeration=1.6).argv(Path("a.wav"))
        self.assertEqual(argv[argv.index("--reference") + 1], "r.wav")
        self.assertEqual(argv[argv.index("--exaggeration") + 1], "1.6")

    def test_missing_venv_says_how_to_install(self) -> None:
        with TemporaryDirectory() as home:
            speech = ChatterboxSpeech(reference=Path("r.wav"), home=Path(home))
            self.assertIn("install-chatterbox.sh", speech.missing_tool() or "")

    def test_missing_reference_is_named(self) -> None:
        with TemporaryDirectory() as home:
            (Path(home) / "bin").mkdir()
            (Path(home) / "bin/python").write_text("")
            speech = ChatterboxSpeech(reference=Path(home) / "r.wav", home=Path(home))
            self.assertIn("r.wav", speech.missing_tool() or "")


class DeliveryTest(unittest.TestCase):
    def test_a_semitone_up_is_the_twelfth_root_of_two(self) -> None:
        self.assertAlmostEqual(semitone_ratio(1), 2 ** (1 / 12))

    def test_drive_pushes_into_a_soft_clip_and_comes_back_down(self) -> None:
        up, clip, down = drive(12)
        self.assertEqual((up, down), ("volume=12dB", "volume=-9dB"))
        self.assertTrue(clip.startswith("asoftclip"))

    def test_arena_raises_the_pitch_and_ends_in_a_limiter(self) -> None:
        chain = arena_chain(1.0).split(",")
        self.assertTrue(chain[0].startswith("rubberband=pitch=1.05"))
        self.assertEqual(chain[-1], "alimiter=limit=0.89")

    def test_arena_has_the_stadium_echo(self) -> None:
        self.assertIn("aecho", arena_chain())

    def test_radio_cuts_both_ends_of_the_band(self) -> None:
        self.assertIn("highpass=f=300", radio_chain())
        self.assertIn("lowpass=f=3400", radio_chain())

    def test_radio_brackets_the_voice_with_squelch(self) -> None:
        graph = squelch_graph("anull")
        self.assertIn("[key][voice][release]concat", graph)
        self.assertIn("seed=", graph)

    def test_radio_argv_uses_the_graph_and_maps_its_output(self) -> None:
        argv = DeliveryVoice("radio").argv(Path("a.wav"), Path("b.wav"))
        self.assertEqual(argv[argv.index("-map") + 1], "[out]")
        self.assertIn("-filter_complex", argv)

    def test_arena_and_machine_are_plain_filter_chains(self) -> None:
        self.assertIn(arena_chain(), DeliveryVoice("arena").argv(Path("a"), Path("b")))
        self.assertIn(machine_chain(), DeliveryVoice("maquina").argv(Path("a"), Path("b")))

    def test_unknown_delivery_is_rejected_with_the_options(self) -> None:
        with self.assertRaisesRegex(ValueError, r"'estadio'.*arena"):
            DeliveryVoice("estadio")


class PhonemeFixTest(unittest.TestCase):
    def test_french_y_becomes_the_unstressed_i(self) -> None:
        self.assertEqual(fix_phonemes("sˈɐ̃ŋɡy", "pm_santa"), LEADING_PAUSE + "sˈɐ̃ŋɡi")

    def test_inserted_schwa_leaves(self) -> None:
        self.assertEqual(fix_phonemes("vˈeɾədʒy", "pm_santa"), LEADING_PAUSE + "vˈeɾdʒi")

    def test_nasal_diphthong_is_left_alone(self) -> None:
        """Mexer nela piorou o pacote de 12,3% para 21,8% de erro do whisper."""
        self.assertEqual(fix_phonemes("kˌomˈɛseɪŋ", "pm_santa"), LEADING_PAUSE + "kˌomˈɛseɪŋ")

    def test_the_pause_comes_before_the_first_word(self) -> None:
        """Sem ela, "Sinal" saía "Tinau" e "Baixa" saía "Paixa"."""
        self.assertTrue(fix_phonemes("sinˈaʊ", "pm_santa").startswith("…"))

    def test_the_voice_that_does_not_click_gets_no_pause(self) -> None:
        """Na `pf_dora`, a pausa virava um "e" antes da frase."""
        self.assertEqual(fix_phonemes("sinˈaʊ", "pf_dora"), "sinˈaʊ")


if __name__ == "__main__":
    unittest.main()
