# Third-party notices

CallScribe's own source code is licensed under Apache-2.0. This file records
third-party software and model assets used by the distributed browser app. Their
licences remain their own; this repository's licence does not change them.

## Browser application dependencies

| Component | Version used | Licence |
| --- | ---: | --- |
| `@huggingface/transformers` | 3.8.1 | Apache-2.0 |
| `onnxruntime-web` | 1.27.0 | MIT |
| `@gutenye/ocr-browser` | 1.4.8 | MIT |
| `@gutenye/ocr-models` | 1.4.2 | MIT |
| `@techstark/opencv-js` | 4.9.0-release.3 | Apache-2.0 |

The packaged PP-OCRv4 detection and recognition assets originate from the
PaddleOCR ecosystem, which is licensed under Apache-2.0.

## Downloaded speech and speaker models

Speech-recognition models are fetched on demand from their configured public
model repositories and stored in the user's browser. They are not relicensed by
CallScribe. Users must follow the model card and licence displayed by the source
repository for the selected Moonshine or Whisper model.

Optional speaker separation downloads the unofficial ONNX export
`NealCaren/Nemotron-3-Diarization-ONNX`. It is redistributed under the NVIDIA
OpenMDW License Agreement v1.1. See its model card and licence before enabling
speaker separation:
<https://huggingface.co/NealCaren/Nemotron-3-Diarization-ONNX>.

## Build-only dependencies

The local development dependency tree includes Sharp and a platform-specific
libvips package under LGPL-3.0-or-later. They are build-time tooling and are not
bundled into the static browser application.
