"""Testes do gerador do narrador.

Rodam em stdlib, sem tts, sem rvc e sem ffmpeg — todo processo externo entra por
um dublê nomeado:

    python3 -m unittest discover -s scripts/narrator -t scripts/narrator

Ficam fora do `npm test` de propósito: o vitest não roda python, e o pipeline do
narrador é ferramenta de asset, não código que vai para o navegador (ADR 0001).
"""

from __future__ import annotations

import json
import unittest
from contextlib import redirect_stdout
from io import StringIO
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import TemporaryDirectory

from backends import (
    DEFAULT_RVC_TEMPLATE, DEFAULT_SENTENCE_SILENCE, DEFAULT_SPEED, EspeakSpeech,
    KeepSourceVoice, PiperSpeech, RvcVoice,
    espeak_voice, format_command, length_scale, piper_executable, piper_voice, rvc_python,
)
from build_narrator import (
    NarratorBuild, RvcOptions, find_index, render_catalog, render_line, require_piper_model,
    require_tools, resolve_speech_kind, select_lines, select_speech, select_voice,
)
from catalog import (
    NarratorCatalog, NarratorLine, append_take, catalog_path, load_catalog, parse_catalog,
    slugify, write_catalog,
)
from encode import OpusEncoder, audio_filter
from manifest import NarratorClip, build_manifest, merge_manifest, read_manifest, write_manifest
from markdown_lines import append_take_md, import_markdown, json_path, parse_markdown
from menu import (
    MenuState, describe_voice, dispatch, pick_by_name, require_catalog, save_phrase, tool_rows,
)
from output import discard, list_clips, next_take, publish, take_of
from player import FfplayPlayer, LoopPlayback

LINES = Path(__file__).resolve().parent / "lines.json"
MEDAL_SLUGS = {"no-scope", "knife", "payback", "double-kill", "first-blood", "airborne",
               "backstab", "skeet", "triple-kill", "longshot-no-scope", "on-the-rope",
               "buzzkill", "360-no-scope", "overkill", "kill-chain", "collateral"}
SOURCE = Path("lines.json")


@dataclass
class RecordingSpeech:
    """Dublê do tts: escreve o texto no lugar do wav e guarda o que foi pedido."""

    spoken: list[str] = field(default_factory=list)

    @property
    def name(self) -> str:
        return "recording-speech"

    def missing_tool(self) -> str | None:
        return None

    def synthesize(self, text: str, target: Path) -> None:
        self.spoken.append(text)
        target.write_text(text, encoding="utf-8")


@dataclass
class RecordingEncoder:
    """Dublê do ffmpeg: copia o conteúdo e registra os pares origem/destino."""

    encoded: list[tuple[str, str]] = field(default_factory=list)

    @property
    def name(self) -> str:
        return "recording-encoder"

    def missing_tool(self) -> str | None:
        return None

    def encode(self, source: Path, target: Path) -> None:
        self.encoded.append((source.name, target.name))
        target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")


@dataclass
class FakeProcess:
    """Dublê do ffplay em loop: registra o pedido de parar, sem tocar nada."""

    stopped: bool = False
    killed: bool = False

    def terminate(self) -> None:
        self.stopped = True

    def wait(self, timeout: float | None = None) -> int:
        return 0

    def kill(self) -> None:
        self.killed = True


class CatalogTest(unittest.TestCase):
    def test_stem_has_zero_padded_take(self) -> None:
        self.assertEqual(NarratorLine("double-kill", "Double kill.", 2).stem, "double-kill-02")

    def test_shipped_catalog_covers_every_medal_of_the_doc(self) -> None:
        self.assertEqual(MEDAL_SLUGS - set(load_catalog(LINES).slugs), set())

    def test_entry_becomes_one_line_per_take(self) -> None:
        payload = {"locale": "en-US", "entries": [{"slug": "knife", "takes": ["Knife.", "Blade."]}]}
        self.assertEqual([line.take for line in parse_catalog(payload, SOURCE).lines], [1, 2])

    def test_text_is_trimmed(self) -> None:
        payload = {"locale": "en-US", "entries": [{"slug": "knife", "takes": ["  Knife. "]}]}
        self.assertEqual(parse_catalog(payload, SOURCE).lines[0].text, "Knife.")

    def test_slugs_keep_catalog_order_without_repeating(self) -> None:
        takes = (NarratorLine("knife", "a", 1), NarratorLine("knife", "b", 2))
        self.assertEqual(NarratorCatalog("en-US", takes).slugs, ("knife",))

    def test_repeated_slug_is_rejected_with_the_offending_value(self) -> None:
        twice = [{"slug": "knife", "takes": ["a"]}, {"slug": "knife", "takes": ["b"]}]
        payload = {"locale": "en-US", "entries": twice}
        with self.assertRaisesRegex(ValueError, "knife"):
            parse_catalog(payload, SOURCE)

    def test_bad_slug_is_rejected(self) -> None:
        payload = {"locale": "en-US", "entries": [{"slug": "Double Kill", "takes": ["a"]}]}
        with self.assertRaisesRegex(ValueError, "Double Kill"):
            parse_catalog(payload, SOURCE)

    def test_empty_takes_are_rejected(self) -> None:
        payload = {"locale": "en-US", "entries": [{"slug": "knife", "takes": []}]}
        with self.assertRaisesRegex(ValueError, r"takes"):
            parse_catalog(payload, SOURCE)

    def test_blank_text_is_rejected(self) -> None:
        payload = {"locale": "en-US", "entries": [{"slug": "knife", "takes": ["   "]}]}
        with self.assertRaisesRegex(ValueError, "knife"):
            parse_catalog(payload, SOURCE)

    def test_missing_locale_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "locale"):
            parse_catalog({"entries": [{"slug": "knife", "takes": ["a"]}]}, SOURCE)

    def test_missing_entries_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "entries"):
            parse_catalog({"locale": "en-US"}, SOURCE)

    def test_only_keeps_the_asked_slugs(self) -> None:
        catalog = load_catalog(LINES).only(frozenset({"first-blood"}))
        self.assertEqual(catalog.slugs, ("first-blood",))

    def test_only_rejects_slug_outside_the_catalog(self) -> None:
        with self.assertRaisesRegex(ValueError, "quad-kill"):
            load_catalog(LINES).only(frozenset({"quad-kill"}))

    def test_select_lines_without_filter_keeps_everything(self) -> None:
        catalog = load_catalog(LINES)
        self.assertEqual(select_lines(catalog, []).lines, catalog.lines)


class VoiceCommandTest(unittest.TestCase):
    def test_placeholders_are_replaced_in_place(self) -> None:
        argv = format_command("rvc -i {input} -o {output} -m {model} -x {index}", self.values())
        self.assertEqual(argv, ["rvc", "-i", "in.wav", "-o", "out.wav",
                                "-m", "Vega.pth", "-x", "Vega.index"])

    def test_path_with_space_stays_one_argument(self) -> None:
        values = {**self.values(), "input": "/a b/in.wav"}
        argv = format_command("rvc -i {input} -o {output} -m {model} -x {index}", values)
        self.assertIn("/a b/in.wav", argv)

    def test_template_without_input_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "input"):
            format_command("rvc -o {output} -m {model} -x {index}", self.values())

    def test_unknown_placeholder_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "device"):
            format_command("rvc -i {input} -o {output} -m {model} -x {index} -d {device}",
                           self.values())

    def test_rvc_argv_carries_model_index_and_pitch(self) -> None:
        voice = RvcVoice(model=Path("Vega.pth"), index=Path("Vega.index"),
                         python_executable="/venv/bin/python", script=Path("rvc_infer.py"),
                         pitch=-2)
        argv = voice.argv(Path("in.wav"), Path("out.wav"))
        self.assertEqual(argv[:2], ["/venv/bin/python", "rvc_infer.py"])
        self.assertEqual(argv[argv.index("--pitch") + 1], "-2")

    def test_protect_reaches_the_command(self) -> None:
        voice = RvcVoice(model=Path("Vega.pth"), index=Path("Vega.index"),
                         python_executable="python", script=Path("rvc_infer.py"), protect=0.5)
        argv = voice.argv(Path("in.wav"), Path("out.wav"))
        self.assertEqual(argv[argv.index("--protect") + 1], "0.5")

    def test_rvc_name_carries_the_model(self) -> None:
        voice = RvcVoice(model=Path("Vega.pth"), index=Path("Vega.index"),
                         python_executable="python", script=Path("rvc_cli.py"))
        self.assertEqual(voice.name, "rvc:Vega")

    def test_default_template_calls_our_wrapper_with_both_files(self) -> None:
        argv = format_command(DEFAULT_RVC_TEMPLATE, self.values())
        self.assertEqual(argv[:2], ["/venv/bin/python", "rvc_infer.py"])
        self.assertEqual(argv[argv.index("--input") + 1], "in.wav")
        self.assertEqual(argv[argv.index("--index-rate") + 1], "0.75")

    def test_keep_source_voice_copies_the_wav(self) -> None:
        with TemporaryDirectory() as work:
            source, target = Path(work) / "a.wav", Path(work) / "b.wav"
            source.write_text("wav", encoding="utf-8")
            KeepSourceVoice().convert(source, target)
            self.assertEqual(target.read_text(encoding="utf-8"), "wav")

    @staticmethod
    def values() -> dict[str, str]:
        return {"python": "/venv/bin/python", "script": "rvc_infer.py", "model": "Vega.pth",
                "index": "Vega.index", "input": "in.wav", "output": "out.wav",
                "pitch": "0", "index_rate": "0.75", "protect": "0.33"}


class RvcAvailabilityTest(unittest.TestCase):
    """O `.pth` sozinho não converte nada: sem o código do rvc não há timbre."""

    def test_missing_rvc_code_is_named(self) -> None:
        with TemporaryDirectory() as room:
            voice = self.voice(Path(room), script=Path(room) / "ainda-nao-clonado.py")
            self.assertIn("o código do rvc", str(voice.missing_tool()))

    def test_missing_model_is_named(self) -> None:
        with TemporaryDirectory() as room:
            voice = self.voice(Path(room), model=Path(room) / "Ausente.pth")
            self.assertIn("o modelo .pth", str(voice.missing_tool()))

    def test_missing_interpreter_comes_first(self) -> None:
        with TemporaryDirectory() as room:
            voice = self.voice(Path(room), python_executable="python-que-nao-existe")
            self.assertIn("python-que-nao-existe", str(voice.missing_tool()))

    def test_everything_in_place_reports_nothing(self) -> None:
        with TemporaryDirectory() as room:
            self.assertIsNone(self.voice(Path(room)).missing_tool())

    def test_the_build_refuses_to_start_without_the_rvc(self) -> None:
        with TemporaryDirectory() as room:
            voice = self.voice(Path(room), script=Path("nao-clonado.py"))
            build = NarratorBuild(speech=RecordingSpeech(), voice=voice, encoder=RecordingEncoder(),
                                  work_dir=Path(room), out_dir=Path(room))
            with self.assertRaisesRegex(SystemExit, "o código do rvc"):
                require_tools(build)

    @staticmethod
    def voice(room: Path, **override: object) -> RvcVoice:
        """Um rvc completo em disco; cada teste tira uma peça pelo `override`."""
        for name in ("rvc_cli.py", "Vega.pth", "Vega.index"):
            (room / name).touch()
        fields = {"model": room / "Vega.pth", "index": room / "Vega.index",
                  "python_executable": "python", "script": room / "rvc_cli.py"}
        return RvcVoice(**{**fields, **override})  # type: ignore[arg-type]


class SpeedTest(unittest.TestCase):
    """A velocidade é uma só para os dois tts, e cada um a converte para a sua unidade."""

    def test_natural_speed_does_not_stretch_anything(self) -> None:
        self.assertEqual(length_scale(1.0), 1.0)

    def test_slower_speech_means_longer_audio(self) -> None:
        self.assertEqual(length_scale(0.8), 1.25)

    def test_zero_speed_is_rejected_with_the_value(self) -> None:
        with self.assertRaisesRegex(ValueError, "0"):
            length_scale(0)

    def test_piper_gets_the_inverse_as_length_scale(self) -> None:
        argv = PiperSpeech(model=Path("v.onnx"), speed=0.8).argv(Path("a.wav"))
        self.assertEqual(argv[argv.index("--length_scale") + 1], "1.25")

    def test_espeak_gets_the_same_speed_in_words_per_minute(self) -> None:
        self.assertEqual(EspeakSpeech(speed=1.0).words_per_minute, 145)
        self.assertEqual(EspeakSpeech(speed=0.8).words_per_minute, 116)

    def test_the_default_is_slower_than_the_raw_voice(self) -> None:
        self.assertLess(DEFAULT_SPEED, 1.0)

    def test_the_pause_between_sentences_is_longer_than_the_piper_default(self) -> None:
        """0,2 s é o padrão do piper, e é ele que faz a fala sair corrida."""
        self.assertGreater(DEFAULT_SENTENCE_SILENCE, 0.2)

    def test_piper_gets_the_pause_between_sentences(self) -> None:
        argv = PiperSpeech(model=Path("v.onnx"), sentence_silence=0.45).argv(Path("a.wav"))
        self.assertEqual(argv[argv.index("--sentence_silence") + 1], "0.45")


class PiperTest(unittest.TestCase):
    """O piper é binário mais voz, e a voz é por idioma."""

    def test_voice_of_the_language_is_found_by_its_file_name(self) -> None:
        with TemporaryDirectory() as home:
            self.downloaded(Path(home), "pt_BR-faber-medium")
            found = piper_voice("pt-BR", Path(home))
            self.assertEqual(found.name if found else "", "pt_BR-faber-medium.onnx")

    def test_language_without_voice_finds_nothing(self) -> None:
        with TemporaryDirectory() as home:
            self.downloaded(Path(home), "en_US-lessac-medium")
            self.assertIsNone(piper_voice("ja-JP", Path(home)))

    def test_english_voice_is_not_taken_for_portuguese(self) -> None:
        with TemporaryDirectory() as home:
            self.downloaded(Path(home), "en_US-lessac-medium")
            self.assertIsNone(piper_voice("pt-BR", Path(home)))

    def test_downloaded_binary_is_used_when_there_is_none_in_the_path(self) -> None:
        with TemporaryDirectory() as home:
            self.assertEqual(piper_executable(Path(home)), str(Path(home) / "piper"))

    def test_language_without_voice_says_how_to_download(self) -> None:
        with TemporaryDirectory() as home:
            with self.assertRaisesRegex(SystemExit, "install-piper"):
                require_piper_model(None, "ja-JP", Path(home))

    def test_voice_given_by_hand_wins_over_the_download(self) -> None:
        with TemporaryDirectory() as home:
            chosen = Path("/algum/lugar/voz.onnx")
            self.assertEqual(require_piper_model(chosen, "en-US", Path(home)), chosen)

    def test_missing_voice_file_is_named(self) -> None:
        speech = PiperSpeech(model=Path("/nao/existe/pt_BR-faber-medium.onnx"), executable="ffmpeg")
        self.assertIn("a voz do piper", str(speech.missing_tool()))

    def test_missing_binary_is_named(self) -> None:
        speech = PiperSpeech(model=LINES, executable="/nao/existe/piper")
        self.assertIn("o piper", str(speech.missing_tool()))

    def test_name_carries_the_voice_in_use(self) -> None:
        self.assertEqual(PiperSpeech(model=Path("pt_BR-faber-medium.onnx")).name,
                         "piper:pt_BR-faber-medium")

    @staticmethod
    def downloaded(home: Path, voice: str) -> None:
        (home / "voices").mkdir(parents=True, exist_ok=True)
        (home / "voices" / f"{voice}.onnx").touch()


class EncoderTest(unittest.TestCase):
    def test_argv_ends_at_the_target(self) -> None:
        self.assertEqual(OpusEncoder().argv(Path("a.wav"), Path("a.webm"))[-1], "a.webm")

    def test_argv_forces_mono_opus(self) -> None:
        argv = OpusEncoder().argv(Path("a.wav"), Path("a.webm"))
        self.assertEqual(argv[argv.index("-ac") + 1], "1")
        self.assertIn("libopus", argv)

    def test_bitrate_is_injected(self) -> None:
        argv = OpusEncoder(bitrate="32k").argv(Path("a.wav"), Path("a.webm"))
        self.assertEqual(argv[argv.index("-b:a") + 1], "32k")

    def test_filter_trims_both_ends_before_levelling(self) -> None:
        chain = audio_filter()
        self.assertEqual(chain.count("silenceremove"), 2)
        self.assertTrue(chain.endswith(chain.split(",")[-1]) and "loudnorm" in chain.split(",")[-1])


class ManifestTest(unittest.TestCase):
    def test_takes_of_a_slug_are_grouped(self) -> None:
        clips = (NarratorClip("knife", "knife-01.webm", "Knife."),
                 NarratorClip("knife", "knife-02.webm", "Blade."))
        self.assertEqual(len(build_manifest("en-US", clips)["clips"]["knife"]), 2)

    def test_merge_keeps_slugs_that_were_not_rerecorded(self) -> None:
        existing = build_manifest("en-US", (NarratorClip("knife", "knife-01.webm", "Knife."),))
        fresh = build_manifest("en-US", (NarratorClip("payback", "payback-01.webm", "Payback."),))
        self.assertEqual(sorted(merge_manifest(existing, fresh)["clips"]), ["knife", "payback"])

    def test_merge_replaces_the_rerecorded_slug(self) -> None:
        existing = build_manifest("en-US", (NarratorClip("knife", "knife-01.webm", "Knife."),))
        fresh = build_manifest("en-US", (NarratorClip("knife", "knife-01.webm", "Blade contact."),))
        merged = merge_manifest(existing, fresh)
        self.assertEqual(merged["clips"]["knife"][0]["text"], "Blade contact.")

    def test_manifest_without_clips_object_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "clips"):
            merge_manifest({}, {"locale": "en-US"})

    def test_absent_file_reads_as_empty(self) -> None:
        with TemporaryDirectory() as work:
            self.assertEqual(read_manifest(Path(work) / "manifest.json")["clips"], {})

    def test_write_then_read_round_trips(self) -> None:
        with TemporaryDirectory() as work:
            target = Path(work) / "manifest.json"
            clips = (NarratorClip("knife", "knife-01.webm", "Knife."),)
            write_manifest(target, build_manifest("en-US", clips))
            self.assertEqual(read_manifest(target)["locale"], "en-US")

    def test_write_ends_with_a_newline(self) -> None:
        with TemporaryDirectory() as work:
            target = Path(work) / "manifest.json"
            write_manifest(target, build_manifest("en-US", ()))
            self.assertTrue(target.read_text(encoding="utf-8").endswith("\n"))


class RenderTest(unittest.TestCase):
    def test_line_walks_tts_then_voice_then_encoder(self) -> None:
        with TemporaryDirectory() as work:
            speech, encoder = RecordingSpeech(), RecordingEncoder()
            build = self.build(Path(work), speech, encoder)
            clip = render_line(NarratorLine("knife", "Knife.", 1), build)
            self.assertEqual((speech.spoken, clip.file), (["Knife."], "knife-01.webm"))
            self.assertEqual(encoder.encoded, [("knife-01.wav", "knife-01.webm")])

    def test_catalog_writes_one_file_per_take_and_a_manifest(self) -> None:
        with TemporaryDirectory() as work:
            build = self.build(Path(work), RecordingSpeech(), RecordingEncoder())
            render_catalog(load_catalog(LINES), build)
            written = sorted(path.name for path in build.out_dir.glob("*.webm"))
            self.assertEqual(len(written), len(load_catalog(LINES).lines))
            self.assertIn("360-no-scope-01.webm", written)

    def test_rerecording_one_slug_keeps_the_others_in_the_manifest(self) -> None:
        with TemporaryDirectory() as work:
            build = self.build(Path(work), RecordingSpeech(), RecordingEncoder())
            render_catalog(load_catalog(LINES), build)
            render_catalog(load_catalog(LINES).only(frozenset({"knife"})), build)
            written = (build.out_dir / "manifest.json").read_text(encoding="utf-8")
            self.assertIn("first-blood", json.loads(written)["clips"])

    @staticmethod
    def build(work: Path, speech: RecordingSpeech, encoder: RecordingEncoder) -> NarratorBuild:
        return NarratorBuild(speech=speech, voice=KeepSourceVoice(), encoder=encoder,
                             work_dir=work / "work", out_dir=work / "out")


class IndexLookupTest(unittest.TestCase):
    def test_the_single_index_next_to_the_model_is_found(self) -> None:
        with TemporaryDirectory() as work:
            index = Path(work) / "added_IVF694_Vega_v2.index"
            index.touch()
            self.assertEqual(find_index(Path(work) / "Vega.pth"), index)

    def test_ambiguous_folder_asks_for_the_flag(self) -> None:
        with TemporaryDirectory() as work:
            (Path(work) / "a.index").touch()
            (Path(work) / "b.index").touch()
            with self.assertRaisesRegex(SystemExit, "--rvc-index"):
                find_index(Path(work) / "Vega.pth")


class SlugifyTest(unittest.TestCase):
    def test_accents_and_punctuation_leave(self) -> None:
        self.assertEqual(slugify("Três sixty, no scope!"), "tres-sixty-no-scope")

    def test_phrase_is_cut_at_five_words(self) -> None:
        self.assertEqual(slugify("one two three four five six"), "one-two-three-four-five")

    def test_phrase_without_letters_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "!!!"):
            slugify("!!!")


class CatalogWritingTest(unittest.TestCase):
    def test_take_lands_on_the_slug_that_already_exists(self) -> None:
        path = self.written()
        catalog = append_take(path, "knife", "Blade contact.")
        knife = [line.text for line in catalog.lines if line.slug == "knife"]
        self.assertEqual(knife, ["Knife.", "Blade contact."])

    def test_unknown_slug_becomes_a_new_entry(self) -> None:
        catalog = append_take(self.written(), "headshot", "Headshot.")
        self.assertEqual(catalog.slugs[-1], "headshot")

    def test_written_catalog_reloads(self) -> None:
        path = self.written()
        self.assertEqual(load_catalog(path).locale, "en-US")

    def test_one_entry_per_line_keeps_the_diff_readable(self) -> None:
        body = self.written().read_text(encoding="utf-8")
        self.assertEqual(body.count('{"slug"'), 2)

    def written(self) -> Path:
        """Catálogo de duas entradas num arquivo temporário da própria pasta do teste."""
        work = TemporaryDirectory()
        self.addCleanup(work.cleanup)
        path = Path(work.name) / "lines.json"
        write_catalog(path, "en-US", [{"slug": "knife", "takes": ["Knife."]},
                                      {"slug": "payback", "takes": ["Payback."]}])
        return path


class OutputTest(unittest.TestCase):
    def test_first_take_of_an_empty_bench_is_one(self) -> None:
        with TemporaryDirectory() as work:
            self.assertEqual(next_take(Path(work), "knife"), 1)

    def test_take_continues_after_what_is_there(self) -> None:
        with TemporaryDirectory() as work:
            (Path(work) / "knife-01.webm").touch()
            (Path(work) / "knife-04.webm").touch()
            self.assertEqual(next_take(Path(work), "knife"), 5)

    def test_take_of_a_name_without_number_is_zero(self) -> None:
        self.assertEqual(take_of(Path("knife.webm")), 0)

    def test_another_slug_does_not_move_the_take(self) -> None:
        with TemporaryDirectory() as work:
            (Path(work) / "payback-09.webm").touch()
            self.assertEqual(next_take(Path(work), "knife"), 1)

    def test_clips_are_listed_in_name_order(self) -> None:
        with TemporaryDirectory() as work:
            for name in ("b-01.webm", "a-01.webm", "notes.txt"):
                (Path(work) / name).touch()
            self.assertEqual([c.name for c in list_clips(Path(work))], ["a-01.webm", "b-01.webm"])

    def test_bench_that_does_not_exist_lists_nothing(self) -> None:
        self.assertEqual(list_clips(Path("/nao/existe")), ())

    def test_publish_copies_and_keeps_the_original(self) -> None:
        with TemporaryDirectory() as work:
            clip = Path(work) / "knife-01.webm"
            clip.write_bytes(b"webm")
            target = publish(clip, Path(work) / "voicelines")
            self.assertEqual((target.read_bytes(), clip.is_file()), (b"webm", True))

    def test_publishing_what_does_not_exist_says_the_path(self) -> None:
        with self.assertRaisesRegex(FileNotFoundError, "knife-01"):
            publish(Path("/nao/existe/knife-01.webm"), Path("/tmp"))


class PlayerTest(unittest.TestCase):
    def test_argv_has_no_window_and_exits_alone(self) -> None:
        argv = FfplayPlayer().argv(Path("knife-01.webm"))
        self.assertEqual(argv[:3], ["ffplay", "-autoexit", "-nodisp"])


class MenuTest(unittest.TestCase):
    def test_build_follows_the_chosen_engines(self) -> None:
        build = self.state().build()
        self.assertEqual((build.speech.name, build.voice.name), ("espeak-ng", "keep-source-voice"))

    def test_switching_to_rvc_changes_the_voice_of_the_next_build(self) -> None:
        state = self.state()
        state.voice_kind = "rvc"
        self.assertEqual(state.build().voice.name, "rvc:Vega")

    def test_unknown_option_does_not_raise(self) -> None:
        with redirect_stdout(StringIO()) as printed:
            dispatch("99", self.state())
        self.assertIn("não existe", printed.getvalue())

    def test_failed_action_is_reported_instead_of_exploding(self) -> None:
        """Num diretório sem catálogo nenhum: o teste não pode depender do que foi
        publicado ao lado do `lines.json` de verdade."""
        state = self.state()
        work = TemporaryDirectory()
        self.addCleanup(work.cleanup)
        state.lines, state.locale = Path(work.name) / "lines.json", "pt-BR"
        with redirect_stdout(StringIO()) as printed:
            dispatch("2", state)
        self.assertIn("ainda não há frases salvas em pt-BR", printed.getvalue())

    def test_asking_for_m_brings_the_explanation_back(self) -> None:
        state = self.state()
        state.detailed = False
        dispatch("m", state)
        self.assertTrue(state.detailed)

    def test_unknown_option_brings_the_explanation_back(self) -> None:
        state = self.state()
        state.detailed = False
        with redirect_stdout(StringIO()):
            dispatch("99", state)
        self.assertTrue(state.detailed)

    def test_name_outside_the_list_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "quad-kill"):
            pick_by_name("quad-kill", ("knife", "payback"))

    def test_language_change_moves_the_saved_phrases_file(self) -> None:
        state = self.state()
        state.locale = "pt-BR"
        self.assertEqual(state.catalog_file().name, "lines.pt-BR.json")

    def test_language_change_reaches_the_voice_of_the_next_build(self) -> None:
        state = self.state()
        state.locale = "pt-BR"
        self.assertEqual(state.build().speech.voice, "pt-br")

    def test_missing_catalog_of_the_language_says_what_to_do(self) -> None:
        state = self.state()
        state.locale = "ja-JP"
        with self.assertRaisesRegex(FileNotFoundError, "opção 1"):
            require_catalog(state)

    def test_tool_list_shows_one_row_per_step(self) -> None:
        self.assertEqual([step for step, _, _ in tool_rows(self.state())],
                         ["fala", "timbre", "codec", "tocar"])

    def test_tool_list_flags_the_rvc_that_is_not_installed(self) -> None:
        state = self.state()
        state.voice_kind = "rvc"
        timbre = [absent for step, _, absent in tool_rows(state) if step == "timbre"]
        self.assertIn("rvc_cli.py", str(timbre[0]))

    def test_status_line_names_the_timbre_in_use(self) -> None:
        state = self.state()
        state.voice_kind = "rvc"
        self.assertIn("Vega", describe_voice(state))

    def state(self) -> MenuState:
        work = TemporaryDirectory()
        self.addCleanup(work.cleanup)
        room = Path(work.name)
        rvc = RvcOptions(model=room / "Vega.pth", index=room / "Vega.index",
                         python_executable="python", script=Path("rvc_cli.py"))
        return MenuState(lines=LINES, out_dir=room / "output", work_dir=room / "work",
                         voicelines_dir=room / "voicelines", rvc=rvc)


class SelectionTest(unittest.TestCase):
    def test_espeak_is_the_default_engine(self) -> None:
        self.assertEqual(select_speech("espeak", None).name, "espeak-ng")

    def test_piper_without_any_voice_stops_with_an_instruction(self) -> None:
        with TemporaryDirectory() as home:
            with self.assertRaisesRegex(SystemExit, "--piper-model"):
                require_piper_model(None, "en-US", Path(home))

    def test_source_voice_is_the_default(self) -> None:
        options = RvcOptions(model=Path("Vega.pth"), index=Path("Vega.index"),
                             python_executable="python", script=Path("rvc_cli.py"))
        self.assertEqual(select_voice("source", options).name, "keep-source-voice")


class LocaleTest(unittest.TestCase):
    def test_espeak_voice_of_a_known_tag(self) -> None:
        self.assertEqual(espeak_voice("pt-BR"), "pt-br")

    def test_tag_without_mapping_falls_back_to_lowercase(self) -> None:
        self.assertEqual(espeak_voice("fr-FR"), "fr-fr")

    def test_base_language_keeps_the_original_file(self) -> None:
        self.assertEqual(catalog_path(Path("lines.json"), "en-US", "en-US"), Path("lines.json"))

    def test_other_language_gets_its_own_file(self) -> None:
        self.assertEqual(catalog_path(Path("lines.json"), "pt-BR", "en-US"),
                         Path("lines.pt-BR.json"))

    def test_first_phrase_of_a_language_creates_the_file(self) -> None:
        with TemporaryDirectory() as work:
            path = Path(work) / "lines.pt-BR.json"
            catalog = append_take(path, "primeiro-sangue", "Primeiro sangue.", "pt-BR")
            self.assertEqual((catalog.locale, catalog.slugs), ("pt-BR", ("primeiro-sangue",)))

    def test_language_of_an_existing_file_is_not_overwritten(self) -> None:
        with TemporaryDirectory() as work:
            path = Path(work) / "lines.json"
            write_catalog(path, "en-US", [{"slug": "knife", "takes": ["Knife."]}])
            self.assertEqual(append_take(path, "knife", "Blade.", "pt-BR").locale, "en-US")


class SpeechDefaultTest(unittest.TestCase):
    """`auto` é o padrão, e é ele que evita gravar sem querer com a voz robótica."""

    def test_auto_picks_piper_when_the_voice_is_downloaded(self) -> None:
        with TemporaryDirectory() as home:
            self.downloaded(Path(home), "pt_BR-faber-medium", binary=True)
            self.assertEqual(resolve_speech_kind("auto", "pt-BR", Path(home)), "piper")

    def test_auto_falls_back_to_espeak_without_a_voice(self) -> None:
        with TemporaryDirectory() as home:
            self.downloaded(Path(home), "en_US-lessac-medium", binary=True)
            self.assertEqual(resolve_speech_kind("auto", "ja-JP", Path(home)), "espeak")

    def test_auto_falls_back_to_espeak_without_the_binary(self) -> None:
        with TemporaryDirectory() as home:
            self.downloaded(Path(home), "en_US-lessac-medium", binary=False)
            self.assertEqual(resolve_speech_kind("auto", "en-US", Path(home)), "espeak")

    def test_an_explicit_choice_is_never_overridden(self) -> None:
        with TemporaryDirectory() as home:
            self.assertEqual(resolve_speech_kind("espeak", "en-US", Path(home)), "espeak")

    def test_rvc_interpreter_falls_back_when_the_venv_is_absent(self) -> None:
        with TemporaryDirectory() as home:
            self.assertEqual(rvc_python(Path(home)), "python")

    def test_rvc_interpreter_of_an_installed_venv(self) -> None:
        with TemporaryDirectory() as home:
            interpreter = Path(home) / ".venv/bin/python"
            interpreter.parent.mkdir(parents=True)
            interpreter.touch()
            self.assertEqual(rvc_python(Path(home)), str(interpreter))

    @staticmethod
    def downloaded(home: Path, voice: str, binary: bool) -> None:
        (home / "voices").mkdir(parents=True, exist_ok=True)
        (home / "voices" / f"{voice}.onnx").touch()
        if binary:
            (home / "piper").touch(mode=0o755)


class LoopTest(unittest.TestCase):
    def test_loop_argv_repeats_forever_without_a_window(self) -> None:
        argv = FfplayPlayer().loop_argv(Path("knife-01.webm"))
        self.assertEqual(argv[:4], ["ffplay", "-loop", "0", "-nodisp"])

    def test_stop_asks_the_process_to_end(self) -> None:
        process = FakeProcess()
        LoopPlayback(process).stop()
        self.assertEqual((process.stopped, process.killed), (True, False))


class DiscardTest(unittest.TestCase):
    def test_discard_takes_the_clip_and_its_intermediates(self) -> None:
        with TemporaryDirectory() as room:
            clip, work = self.recorded(Path(room))
            discard(clip, work)
            self.assertEqual(list(work.rglob("*.wav")) + list(clip.parent.glob("*.webm")), [])

    def test_discarding_twice_does_not_fail(self) -> None:
        with TemporaryDirectory() as room:
            clip, work = self.recorded(Path(room))
            discard(clip, work)
            discard(clip, work)

    @staticmethod
    def recorded(room: Path) -> tuple[Path, Path]:
        """Simula o que uma gravação deixa: o webm na bancada e dois wav no work."""
        clip = room / "output" / "knife-01.webm"
        clip.parent.mkdir(parents=True)
        clip.write_bytes(b"webm")
        for step in ("tts", "voice"):
            wav = room / "work" / step / "knife-01.wav"
            wav.parent.mkdir(parents=True)
            wav.write_bytes(b"wav")
        return clip, room / "work"


class MarkdownTest(unittest.TestCase):
    """O markdown é a fonte; o json é derivado dele."""

    SHEET = """# falas

locale: pt-BR

Texto solto é comentário, e não vira fala.

### `knife`

Quando a kill é de faca.

- Faca.
- Contato com a lâmina.

### `payback`

- Troco.
"""

    def test_locale_comes_from_the_header(self) -> None:
        locale, _ = parse_markdown(self.SHEET, Path("lines.md"))
        self.assertEqual(locale, "pt-BR")

    def test_each_bullet_is_a_take(self) -> None:
        _, entries = parse_markdown(self.SHEET, Path("lines.md"))
        self.assertEqual(entries[0], {"slug": "knife", "takes": ["Faca.", "Contato com a lâmina."]})

    def test_prose_between_takes_is_ignored(self) -> None:
        _, entries = parse_markdown(self.SHEET, Path("lines.md"))
        self.assertEqual([entry["slug"] for entry in entries], ["knife", "payback"])

    def test_sheet_without_locale_says_what_to_add(self) -> None:
        with self.assertRaisesRegex(ValueError, "locale: pt-BR"):
            parse_markdown("### `knife`\n- Faca.\n", Path("lines.md"))

    def test_phrase_without_any_take_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "knife"):
            parse_markdown("locale: pt-BR\n### `knife`\n\n### `payback`\n- Troco.\n", Path("l.md"))

    def test_json_lands_beside_the_markdown(self) -> None:
        self.assertEqual(json_path(Path("a/lines.md")), Path("a/lines.json"))

    def test_import_writes_a_catalog_the_generator_can_read(self) -> None:
        catalog = load_catalog(import_markdown(self.written()))
        self.assertEqual((catalog.locale, catalog.slugs), ("pt-BR", ("knife", "payback")))

    def test_take_of_a_known_phrase_joins_its_section(self) -> None:
        sheet = self.written()
        append_take_md(sheet, "knife", "Lâmina.")
        _, entries = parse_markdown(sheet.read_text(encoding="utf-8"), sheet)
        self.assertEqual(entries[0]["takes"], ["Faca.", "Contato com a lâmina.", "Lâmina."])

    def test_take_of_a_new_phrase_opens_a_section(self) -> None:
        sheet = self.written()
        append_take_md(sheet, "headshot", "Na cabeça.")
        _, entries = parse_markdown(sheet.read_text(encoding="utf-8"), sheet)
        self.assertEqual(entries[-1], {"slug": "headshot", "takes": ["Na cabeça."]})

    def test_a_slug_is_not_confused_with_one_that_starts_the_same(self) -> None:
        sheet = self.written()
        append_take_md(sheet, "knife-throw", "Faca voadora.")
        _, entries = parse_markdown(sheet.read_text(encoding="utf-8"), sheet)
        self.assertEqual(entries[0]["takes"], ["Faca.", "Contato com a lâmina."])

    def test_the_shipped_sheet_carries_every_medal_of_the_doc(self) -> None:
        sheet = Path(__file__).resolve().parent / "lines.md"
        _, entries = parse_markdown(sheet.read_text(encoding="utf-8"), sheet)
        slugs = {entry["slug"] for entry in entries}
        self.assertEqual(MEDAL_SLUGS - slugs, set())

    def written(self) -> Path:
        work = TemporaryDirectory()
        self.addCleanup(work.cleanup)
        sheet = Path(work.name) / "lines.md"
        sheet.write_text(self.SHEET, encoding="utf-8")
        return sheet


class SavePhraseTest(unittest.TestCase):
    def test_phrase_goes_into_the_markdown_when_there_is_one(self) -> None:
        state, sheet = self.state_with_sheet()
        save_phrase(state, "knife", "Lâmina.")
        self.assertIn("- Lâmina.", sheet.read_text(encoding="utf-8"))

    def test_saving_also_refreshes_the_generated_json(self) -> None:
        state, _ = self.state_with_sheet()
        save_phrase(state, "knife", "Lâmina.")
        self.assertIn("Lâmina.", state.catalog_file().read_text(encoding="utf-8"))

    def test_without_a_markdown_the_json_is_written_directly(self) -> None:
        state, sheet = self.state_with_sheet()
        sheet.unlink()
        self.assertEqual(save_phrase(state, "knife", "Lâmina."), state.catalog_file())

    def state_with_sheet(self) -> tuple[MenuState, Path]:
        work = TemporaryDirectory()
        self.addCleanup(work.cleanup)
        room = Path(work.name)
        sheet = room / "lines.md"
        sheet.write_text("locale: pt-BR\n\n### `knife`\n\n- Faca.\n", encoding="utf-8")
        import_markdown(sheet)
        rvc = RvcOptions(model=room / "Vega.pth", index=room / "Vega.index",
                         python_executable="python", script=room / "rvc_infer.py")
        state = MenuState(lines=room / "lines.json", out_dir=room / "output",
                          work_dir=room / "work", voicelines_dir=room / "voicelines",
                          rvc=rvc, locale="pt-BR", base_locale="pt-BR")
        return state, sheet


if __name__ == "__main__":
    unittest.main()
