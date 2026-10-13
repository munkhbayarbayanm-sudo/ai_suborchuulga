"""Real provider adapters. Imports and model loads are lazy and cached per process."""

import importlib
import importlib.metadata
import wave
from pathlib import Path

from PIL import Image

from .app import ProviderError
from .normalization import normalize_asr, normalize_ocr


def version(distribution: str) -> str | None:
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return None


class Providers:
    def __init__(self, settings):
        self.settings = settings
        self.asr_pipeline = None
        self.ocr_pipeline = None
        self.align_models = {}
        self.diarization = None
        self.failed = {}
        self.gpu_available = {}

    def _model(self, kind):
        if kind == "asr":
            model = Path(self.settings.asr_model)
            return model.name if model.is_absolute() else self.settings.asr_model
        return "PP-OCRv5_mobile_det+PP-OCRv5_mobile_rec"

    def _dependency(self, kind):
        packages = (
            ("whisperx", "torch", "torchaudio", "ctranslate2", "silero-vad")
            if kind == "asr"
            else ("paddleocr", "paddlepaddle")
        )
        return all(version(package) is not None for package in packages)

    def _local_ocr(self):
        return all(
            directory
            and (Path(directory) / "inference.json").is_file()
            and (Path(directory) / "inference.pdiparams").is_file()
            for directory in (self.settings.ocr_det_dir, self.settings.ocr_rec_dir)
        )

    def _local_asr(self):
        directory = Path(self.settings.asr_model)
        return directory.is_absolute() and (directory / "model.bin").is_file()

    def _device_available(self, kind):
        if self.settings.device == "cpu":
            return True
        if kind not in self.gpu_available:
            try:
                module = importlib.import_module("torch" if kind == "asr" else "paddle")
                self.gpu_available[kind] = (
                    bool(module.cuda.is_available())
                    if kind == "asr"
                    else (module.is_compiled_with_cuda() and module.device.cuda.device_count() > 0)
                )
            except Exception:
                self.gpu_available[kind] = False
        return self.gpu_available[kind]

    def readiness(self):
        result = {}
        for kind, provider in (("asr", "whisperx"), ("ocr", "paddleocr")):
            loaded = (
                self.asr_pipeline is not None if kind == "asr" else self.ocr_pipeline is not None
            )
            local = self._local_asr() if kind == "asr" else self._local_ocr()
            available = (
                self._dependency(kind)
                and self._device_available(kind)
                and (loaded or self.settings.downloads or local)
                and kind not in self.failed
            )
            message = None
            if kind in self.failed:
                message = self.failed[kind].message
            elif not self._dependency(kind):
                message = "Optional provider dependencies are not installed."
            elif not self._device_available(kind):
                message = "No supported CUDA runtime/device is available; use CPU."
            elif not available:
                message = "MODEL_UNAVAILABLE: downloads disabled and local models not configured."
            elif not loaded:
                message = "Dependencies present; model not loaded or inference verified. " + (
                    "First request may download model weights."
                    if self.settings.downloads
                    else "Configured local model will be loaded on first request."
                )
            result[kind] = {
                "provider": provider,
                "state": ("READY_GPU" if self.settings.device == "cuda" else "READY_CPU")
                if available
                else "UNAVAILABLE",
                "version": version(provider),
                "model": self._model(kind),
                "message": message,
            }
        return result

    def _require(self, kind):
        if not self._dependency(kind):
            raise ProviderError(
                "DEPENDENCY_UNAVAILABLE", "Provider dependencies are not installed."
            )
        if not self._device_available(kind):
            raise ProviderError(
                "DEPENDENCY_UNAVAILABLE", "No supported CUDA runtime/device; use CPU."
            )
        if not self.settings.downloads:
            local = self._local_asr() if kind == "asr" else self._local_ocr()
            loaded = (
                self.asr_pipeline is not None if kind == "asr" else self.ocr_pipeline is not None
            )
            if not local and not loaded:
                raise ProviderError(
                    "MODEL_UNAVAILABLE", "Model downloads are disabled; configure local models."
                )

    def _guard_error(self, kind, error, loading=False):
        if isinstance(error, ProviderError):
            return error
        if isinstance(error, MemoryError) or "out of memory" in str(error).lower():
            safe = ProviderError(
                "OUT_OF_MEMORY", "Provider ran out of memory; use CPU or a smaller model."
            )
        elif isinstance(error, ImportError) or (isinstance(error, OSError) and not loading):
            safe = ProviderError(
                "DEPENDENCY_UNAVAILABLE", "Provider runtime dependency could not load."
            )
        elif loading:
            safe = ProviderError(
                "MODEL_UNAVAILABLE",
                "Provider model could not load; check installation and model access.",
            )
        else:
            safe = ProviderError("PROCESS_FAILED", "Provider inference failed.")
        # Startup incompatibilities require configuration/restart. A transient
        # inference failure belongs to its run and must allow an intentional rerun.
        if safe.code in ("MODEL_UNAVAILABLE", "DEPENDENCY_UNAVAILABLE") and (
            loading or isinstance(error, ImportError)
        ):
            self.failed[kind] = safe
        return safe

    def asr(self, body, audio_path, check):
        self._require("asr")
        loading = False
        warnings = []
        try:
            check()
            whisperx = importlib.import_module("whisperx")
            numpy = importlib.import_module("numpy")
            if self.asr_pipeline is None:
                # Package-bundled pinned Silero weights avoid torch.hub downloading executable code.
                silero = importlib.import_module("silero_vad")
                silero_type = importlib.import_module("whisperx.vads.silero").Silero

                class PackagedSilero(silero_type):
                    def __init__(self):
                        self.vad_onset, self.chunk_size = 0.5, 30
                        self.vad_pipeline = silero.load_silero_vad()
                        self.get_speech_timestamps = silero.get_speech_timestamps

                loading = True
                self.asr_pipeline = whisperx.load_model(
                    self.settings.asr_model,
                    self.settings.device,
                    compute_type="int8" if self.settings.device == "cpu" else "float16",
                    vad_method="silero",
                    vad_model=PackagedSilero(),
                    language=None,
                    download_root=str(self.settings.model_root)
                    if self.settings.model_root
                    else None,
                    local_files_only=not self.settings.downloads,
                )
            loading = False
            check()
            # Worker extracts a bounded mono 16kHz PCM16 WAV; no ffmpeg shell or audio per segment.
            with wave.open(str(audio_path), "rb") as source:
                if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (
                    1,
                    2,
                    16000,
                ):
                    raise ProviderError("PROCESS_FAILED", "ASR requires mono 16kHz PCM16 WAV.", 422)
                if source.getnframes() / 16000 > self.settings.max_audio_seconds:
                    raise ProviderError(
                        "PROCESS_FAILED", "Audio exceeds the configured duration limit.", 422
                    )
                audio = (
                    numpy.frombuffer(source.readframes(source.getnframes()), dtype="<i2").astype(
                        numpy.float32
                    )
                    / 32768.0
                )
            check()
            result = self.asr_pipeline.transcribe(audio, batch_size=1, language=body.language)
            check()
            language = result.get("language")
            # Forced language is request evidence; it is not independent language detection.
            language_detected = language if body.language is None else None
            if body.align:
                if not self.settings.downloads and language not in self.align_models:
                    warnings.append("Word alignment unavailable: model downloads disabled.")
                else:
                    try:
                        if language not in self.align_models:
                            self.align_models[language] = whisperx.load_align_model(
                                language_code=language,
                                device=self.settings.device,
                                model_dir=str(self.settings.model_root)
                                if self.settings.model_root
                                else None,
                            )
                        check()
                        align_model, metadata = self.align_models[language]
                        aligned_result = whisperx.align(
                            result["segments"],
                            align_model,
                            metadata,
                            audio,
                            self.settings.device,
                            return_char_alignments=False,
                        )
                        # A failed optional aligner must not discard valid basic-ASR evidence.
                        normalize_asr(aligned_result, language)
                        result = aligned_result
                    except ProviderError:
                        raise
                    except Exception:
                        warnings.append("Word alignment unavailable; segment timing retained.")
            check()
            if body.diarize:
                if not self.settings.hf_token:
                    warnings.append(
                        "Speaker diarization unavailable: HF_TOKEN and gated model access required."
                    )
                elif not self.settings.downloads and self.diarization is None:
                    warnings.append("Speaker diarization unavailable: model downloads disabled.")
                else:
                    try:
                        if self.diarization is None:
                            diarize_module = importlib.import_module("whisperx.diarize")
                            self.diarization = diarize_module.DiarizationPipeline(
                                use_auth_token=self.settings.hf_token, device=self.settings.device
                            )
                        check()
                        result = whisperx.assign_word_speakers(self.diarization(audio), result)
                    except ProviderError:
                        raise
                    except Exception:
                        warnings.append("Speaker diarization unavailable; transcript retained.")
            check()
            segments = normalize_asr(result, language)
            if len(segments) > 50000:
                raise ProviderError("PROCESS_FAILED", "Provider result exceeds the segment limit.")
            self.failed.pop("asr", None)
            return {
                "provider": "whisperx",
                "providerVersion": version("whisperx"),
                "modelVersion": self._model("asr"),
                "languageDetected": language_detected,
                "device": "cpu" if self.settings.device == "cpu" else "gpu",
                "segments": segments,
                "warnings": warnings,
            }
        except Exception as error:
            raise self._guard_error("asr", error, loading) from None

    def ocr(self, body, frames, check):
        self._require("ocr")
        loading = self.ocr_pipeline is None
        try:
            check()
            if self.ocr_pipeline is None:
                paddleocr = importlib.import_module("paddleocr")
                arguments = {
                    "device": "cpu" if self.settings.device == "cpu" else "gpu:0",
                    "ocr_version": "PP-OCRv5",
                    "lang": "ch",
                    "text_detection_model_name": "PP-OCRv5_mobile_det",
                    "text_recognition_model_name": "PP-OCRv5_mobile_rec",
                    "use_doc_orientation_classify": False,
                    "use_doc_unwarping": False,
                    "use_textline_orientation": False,
                    "enable_mkldnn": False,
                }
                if self.settings.ocr_det_dir:
                    arguments["text_detection_model_dir"] = self.settings.ocr_det_dir
                if self.settings.ocr_rec_dir:
                    arguments["text_recognition_model_dir"] = self.settings.ocr_rec_dir
                self.ocr_pipeline = paddleocr.PaddleOCR(**arguments)
            loading = False
            observations = []
            for at, path in frames:
                check()
                if path.stat().st_size > 16 * 1024 * 1024:
                    raise ProviderError("PROCESS_FAILED", "OCR frame exceeds the size limit.", 422)
                with Image.open(path) as image:
                    width, height = image.size
                    if width * height > 16000000:
                        raise ProviderError(
                            "PROCESS_FAILED", "OCR frame exceeds the pixel limit.", 422
                        )
                # One loaded detector/recognizer for the entire process, never per sampled frame.
                predictions = list(self.ocr_pipeline.predict(str(path)))
                if len(predictions) > 1:
                    raise ProviderError("PROCESS_FAILED", "OCR requires one image per frame.")
                payload = dict(predictions[0]) if predictions else {}
                observations.append(normalize_ocr(payload, width, height, at))
            check()
            self.failed.pop("ocr", None)
            return {
                "provider": "paddleocr",
                "providerVersion": version("paddleocr"),
                "modelVersion": self._model("ocr"),
                "languageDetected": None,
                "device": "cpu" if self.settings.device == "cpu" else "gpu",
                "observations": observations,
                "warnings": [
                    "OCR language is a request hint; script variant was not independently detected."
                ],
            }
        except Exception as error:
            raise self._guard_error("ocr", error, loading) from None
