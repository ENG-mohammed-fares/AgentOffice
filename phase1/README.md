# Phase 1 readiness and S1 fixture

Baseline 3ee976b858f34fa547896a5c6062bc723668658f. The v2 branch omits the inherited release workflow, including manual dispatch. All benchmark files are evaluator-owned. Supply only brief.txt to the model as prompt text. Give it a freshly created empty directory. Abort unless directory enumeration, including hidden entries, is empty. The digest convention is SHA-256 of the UTF-8 sorted relative entry list, one entry per line. Empty input hashes to e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.

## Execution environment observed on 2026-11-23

The development runner is Linux x86_64 kernel 6.18.57 with Python 3.12.14 and about 17 GiB disk available. It exposes no /dev/kvm, /dev/dri, /dev/dxg or NVIDIA device. pytest, qemu-system-x86_64, virsh, VBoxManage and ollama are absent there.

The owner supplied screenshots from the intended physical target. They identify an HP Victus 16-d0xxx running Windows 11 Pro 25H2 build 26200.9974, an Intel Core i7-11800H, 16 GB RAM at 3200 MT/s, 477 GB NVMe storage with about 260 GB free, integrated Intel graphics and a discrete NVIDIA GeForce RTX adapter with 4.0 GB dedicated GPU memory and 7.8 GB shared memory. The exact RTX model and driver remain unrecorded. Ollama 0.40.17 was installed successfully on the target and its CLI version command completed. Windows Sandbox launch, virtualization status, local model identity/digest, inference behavior and license are still unverified. S2 remains blocked before guest qualification. No containment pass, model generation, timing, or renderer comparison is claimed.

## Frozen evidence contract

Track the fixture revision. Keep evaluator files outside the guest writable tree and all model context. Validate fixture files with sha256sum -c phase1/fixture.sha256 from the repository root. Run python3 -m unittest discover -s phase1/evaluator for transcript-grader self-checks. Independent reference totals include 2×125 + 3×10 = 280 and 17×31 + 23×5 = 642. Test records are simulated capture data.

After S2 passes, collect each candidate into an immutable snapshot. The evaluator constructs manifest.json containing trial_id, fixture_commit, guest_digest, model_digest, inference_settings, empty_directory_sha256, elapsed_seconds and files (array of relative path, byte count and SHA-256 records). Include plan, tool trace, invoice_total.py, generated tests and README. Keep evaluator logs and hashes outside candidate control. Execute each cases.json stdin separately in a fresh evaluator-controlled guest process, observing actual exit and both streams, with an enforced trial deadline. Record UTF-8 capture in a JSON object keyed by case ID, each value containing stdout, stderr and integer exit. Reject timeouts and invalid UTF-8 before grading. Run python3 phase1/evaluator/grade.py CAPTURE.json. Archive generated pytest results and the negative control on the quantity-ignoring faulty copy separately. Eligibility requires the intact candidate, all artifacts, passed independent cases and detection of the faulty copy.

Next gate is access to a disposable Windows target with offline Python/pytest and an approved local inference runtime. Record host configuration and qualify the guest using the Phase 1 S2 protocol before executing generated code.

## Bounded S1 generation runner

The runner under phase1/runner is a standard-library Python client for Ollama's local chat API. It exposes only list, UTF-8 read, bounded UTF-8 write and finish tools rooted in a new empty candidate directory. It has no process execution, test execution, browser, Git, deletion or arbitrary host-read tool. It rejects absolute paths, parent traversal, backslash paths, links, non-regular entries, files over 256 KiB and projects over 1 MiB. The evidence directory stays outside the model-writable candidate directory and captures compact tool-call hashes, Ollama timing counters, the local model digest and a final file manifest.

On the Windows target, extract the reviewed develop/v2 source, open PowerShell in its phase1 directory and run .\\run-s1.ps1. The script requires Python 3, Ollama and the already-pulled qwen2.5-coder:7b. It verifies the frozen fixture hashes, runs the runner boundary tests, then creates a timestamped candidate and evidence pair under %USERPROFILE%\\AgentOFF-Phase1. This first action authors files only. Do not run the generated project until S2 qualifies Windows Sandbox and the evaluator transfer.
