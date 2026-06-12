# GPUWatcher

GPUWatcher는 macOS에서 SSH로 Linux NVIDIA GPU 서버 상태를 확인하는 Electron 데스크톱 유틸리티입니다. 원격 서버에 별도 수집기를 설치하지 않고, macOS 앱이 시스템 `ssh`로 고정된 `nvidia-smi`와 `ps` 명령을 실행한 뒤 결과를 로컬에서 파싱합니다.

## Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Remote Server Requirements](#remote-server-requirements)
- [Features And Caveats](#features-and-caveats)
- [Developer And Local Package Smoke](#developer-and-local-package-smoke)
- [Verification Commands](#verification-commands)
- [Local Data](#local-data)

## Overview

GPUWatcher는 여러 Linux NVIDIA GPU 서버의 최신 GPU 상태, GPU 프로세스, 최근 24시간 GPU 기록을 macOS 앱에서 확인하는 데 초점을 둡니다.

수집 흐름은 단순합니다. Electron main process가 로컬 Rust helper를 실행하고, helper와 shared core crate가 원격 서버로 SSH 접속을 엽니다. 원격 서버에서는 `nvidia-smi`와 `ps` 출력만 가져옵니다. GPUWatcher는 이 출력을 로컬에서 protocol v1 스냅샷으로 정리하고 SQLite에 저장합니다.

원격 서버에는 GPUWatcher, nvitop, Python, collector package, 저장소 파일을 설치할 필요가 없습니다. 장기 감사 로그, raw snapshot history, Prometheus exporter도 제공하지 않습니다.

## Installation

로컬 macOS에서 GPUWatcher를 실행하는 데 필요한 항목입니다.

| 구분 | 필요 항목 |
| --- | --- |
| 운영체제 | macOS |
| Node.js | Node.js 24 이상 |
| 패키지 관리자 | npm |
| Rust | Rust 1.95 이상 |
| 로컬 DB | SQLite 3 |
| SSH | macOS 기본 OpenSSH 또는 호환되는 system `ssh` |

아직 signed 또는 notarized release는 없습니다. 지금은 저장소를 받아 개발 모드로 실행하거나, 로컬 unsigned `.app` 디렉터리를 만들어 smoke test합니다.

## Quick Start

1. 저장소를 받고 프로젝트 디렉터리로 이동합니다.

```bash
git clone https://github.com/jinzer0/GPUWatch.git GPUWatcher
cd GPUWatcher
```

2. 프론트엔드와 개발 도구 의존성을 설치합니다.

```bash
npm install
```

3. macOS Terminal에서 원격 서버 SSH가 비대화형으로 동작하는지 확인합니다.

```bash
ssh -o BatchMode=yes USER@HOST true
```

비표준 포트나 키 파일을 쓴다면 평소 SSH 옵션을 함께 넣어 확인하세요.

```bash
ssh -o BatchMode=yes -p 2222 -i /path/to/key USER@HOST true
```

4. 개발 모드로 Electron 앱을 실행합니다. 첫 terminal은 Vite dev server를 유지하고, 두 번째 terminal은 Electron shell을 시작합니다.

```bash
npm run dev
```

```bash
npm run electron:dev
```

5. 앱에서 서버를 추가하고 첫 새로고침을 실행합니다.

Settings 화면에서 서버 이름, SSH host, user, port, key path 같은 접속 정보를 입력합니다. 저장한 뒤 Test Connection 또는 Refresh를 눌러 첫 스냅샷을 수집합니다.

정상이라면 Overview와 Server Detail에서 GPU 메모리, 사용률, 온도, 전력, 현재 프로세스를 볼 수 있습니다. 실패하면 먼저 Terminal에서 SSH, host key, `ssh-agent`, DNS, 방화벽, 계정 권한을 확인하세요.

## Remote Server Requirements

각 Linux NVIDIA GPU 서버에는 다음만 필요합니다.

- NVIDIA 드라이버와 `PATH`에서 실행 가능한 `nvidia-smi`
- SSH 로그인 사용자가 실행할 수 있는 POSIX shell
- 프로세스 이름과 명령어 보강에 사용할 `ps`
- macOS에서 원격 서버로 접속 가능한 키 기반 SSH

GPUWatcher 앱은 비밀번호 입력 UI를 제공하지 않습니다. 키에 passphrase가 있으면 앱을 실행하기 전에 `ssh-agent`에서 잠금을 해제하세요.

기본 GPU 조회가 성공해야 스냅샷이 성공합니다.

```bash
ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits'
```

프로세스 정보 확인에는 `nvidia-smi --query-compute-apps`와 `ps`가 쓰입니다.

```bash
ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-compute-apps=gpu_uuid,pid,process_name,used_memory --format=csv,noheader,nounits; ps -eo pid=,user=,comm=,args='
```

선택 지표인 MIG 목록, dmon, pmon, PCIe, encoder, decoder 정보는 서버와 드라이버에 따라 빠질 수 있습니다. 기본 GPU CSV가 성공하면 이런 선택 섹션 실패는 치명적 오류가 아니라 warning과 `unknown` 또는 `null` 값으로 표시됩니다.

## Features And Caveats

- SSH 기반으로 Linux NVIDIA GPU 서버의 최신 GPU 상태를 수집합니다.
- 원격 서버에 GPUWatcher, nvitop, Python, collector package, 저장소 파일을 설치하지 않아도 됩니다.
- `nvidia-smi` 기반 GPU 메모리, 사용률, 온도, 전력 정보를 표시합니다.
- 가능할 때 `gpu_extra_csv`, `mig_list`, `dmon`, `dmon_pcie`, `pmon`, `ps` 섹션으로 더 많은 지표와 프로세스 정보를 더합니다.
- Overview, Server Detail, Live Monitor, Process Table, Settings 화면으로 서버 상태와 최근 GPU 기록을 확인하고 관리합니다.
- Live Monitor는 로컬 SQLite에 저장된 최근 24시간 GPU 기록을 서버, GPU, 범위, 지표별로 보여줍니다.
- Server Detail 차트는 저장된 1시간 GPU 기록을 우선 사용하고, 저장 기록을 불러오는 중이거나 비어 있으면 현재 앱 세션의 live sample을 사용합니다.
- 저장 GPU 기록은 성공한 poll에서 GPU별로만 추가됩니다. 실패한 poll은 health와 오류 metadata를 갱신하고 history sample은 만들지 않습니다.
- 마지막 성공 스냅샷은 실패한 poll 뒤에도 stale 상태로 남습니다.
- 기록 보관 기간은 고정 24시간입니다. 장기 audit history, raw snapshot history, process timeline은 저장하지 않습니다.
- Prometheus exporter나 원격 background service는 제공하지 않습니다.
- `N/A`, `-`, 비어 있는 선택 지표, 사라진 PID는 0으로 바꾸지 않습니다. 알 수 없는 값은 `unknown` 또는 `null`로 둡니다.
- Process Table은 Flat 보기와 현재 보이는 GPU 프로세스만 묶는 Parent grouped 보기를 제공합니다.
- Display mode의 Full과 Compact 전환은 현재 앱 세션에만 적용되며, 앱을 다시 시작하면 기본 Full 보기로 돌아갑니다.

## Developer And Local Package Smoke

Electron main과 preload를 타입 체크하고 빌드하려면 다음 명령을 사용합니다.

```bash
npm run electron:build
```

Rust helper binary만 빌드하려면 다음 명령을 사용합니다.

```bash
npm run helper:build
```

로컬 Electron package smoke용 앱 디렉터리는 다음 명령으로 만듭니다. 이 결과물은 signed 또는 notarized release가 아니라 signing을 건너뛴 로컬 unsigned package입니다.

```bash
npm run electron:pack
```

Electron Builder의 macOS 출력 디렉터리는 CPU architecture와 빌드 설정에 따라 달라질 수 있습니다. Terminal에서 먼저 생성된 `.app` 경로를 찾은 뒤 실행하세요.

```bash
APP_PATH="$(find release/electron -name 'GPUWatcher.app' -type d -print -quit)"
test -n "$APP_PATH"
open "$APP_PATH"
```

Gatekeeper가 막거나 quarantine 경고가 보이면 로컬 unsigned app caveat로 다루세요. 이 문서는 signing, notarization, DMG, upload 절차를 다루지 않습니다.

프론트엔드만 브라우저에서 보고 싶다면 다음 명령을 사용할 수 있습니다. 이 경우 Electron preload bridge가 없으므로 저장, refresh 같은 backend action은 동작하지 않습니다. 정적 화면 식별과 읽기 전용 empty state 확인에만 쓰세요.

```bash
npm run dev
```

## Verification Commands

로컬 테스트와 빌드는 다음 명령으로 확인합니다.

```bash
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
npm run test
npm run build
npm run electron:build
npm run helper:build
```

라이브 SSH smoke는 일반 테스트에 포함하지 않습니다. `tml-server` live test는 명시적으로 환경 변수를 준 ignored test로만 실행합니다.

```bash
GPUWATCHER_LIVE_SSH_TARGET=tml-server cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml live_tml_server -- --ignored --nocapture
```

## Local Data

GPUWatcher는 서버 설정, 최신 성공 스냅샷, 최근 24시간 GPU 기록을 로컬 SQLite에 저장합니다.

```text
~/Library/Application Support/GPUWatcher/gpuwatcher.sqlite3
```

테스트와 smoke에는 `GPUWATCHER_TEST_DATA_DIR`로 격리된 데이터 디렉터리를 지정할 수 있습니다. 생산 기본값은 macOS data dir의 `GPUWatcher/gpuwatcher.sqlite3`입니다. 원격 서버에는 GPUWatcher 데이터베이스나 기록 파일을 만들지 않습니다.

Legacy schema를 여는 과정에서 destructive migration이 필요하면 core가 같은 로컬 데이터 디렉터리에 백업 DB를 먼저 만듭니다. 복원하려면 앱을 완전히 종료하고 현재 `gpuwatcher.sqlite3`을 다른 곳으로 옮긴 뒤 백업 파일을 `gpuwatcher.sqlite3` 이름으로 되돌리세요. DB가 손상되었거나 읽기 전용이면 앱을 닫고 파일 권한과 디스크 상태를 확인한 뒤 백업에서 복원하세요.
