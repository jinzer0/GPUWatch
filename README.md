# GPUWatcher

Apple Silicon Mac에서 SSH로 Linux NVIDIA GPU 서버를 지켜보는 데스크톱 앱입니다. 원격 서버에는 에이전트나 컬렉터를 설치하지 않습니다.

## Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Features](#features)
- [Prerequisites](#prerequisites)

## Overview

서버 사이드바에서 대상을 선택하고 GPU 지표와 현재 프로세스를 확인합니다. React 화면은 동작별 Electron preload/IPC와 로컬 Rust helper를 거쳐 시스템 `ssh`로 수집하며, 데이터는 Mac의 SQLite에 저장합니다.

현재 화면에는 History 탭이나 최근 24시간 기록 화면이 없습니다. 가용 표시는 backend의 연속 성공 관측 결과이며, GPU 예약이나 실제 작업 실행 가능성을 보장하지 않습니다.

## Getting Started

### 앱 설치

1. [GPUWatcher v0.1.0 Releases](https://github.com/jinzer0/GPUWatch/releases/tag/v0.1.0)에서 앱 파일을 받습니다. 이 문서의 현재 소스 UI와 기존 릴리스 UI는 다를 수 있습니다.
2. 내려받은 파일을 열고 GPUWatcher를 Applications로 옮긴 뒤 실행합니다.

v0.1.0은 Apple Silicon Mac 전용 unsigned, non-notarized 앱입니다. macOS Gatekeeper가 차단하면 앱을 한 번 실행해 경고를 만든 뒤 `System Settings → Privacy & Security → Open Anyway`에서 확인 창의 `Open`을 누르세요. 자동 업데이트는 없으며 새 버전은 Releases에서 직접 확인합니다. 로컬 unsigned `.app`과 내부 테스트용 DMG/ZIP은 서명·공증·업로드된 프로덕션 배포 산출물이 아닙니다.

### 서버 연결

1. Mac Terminal에서 먼저 프롬프트 없이 키 기반 SSH로 접속되는지 확인합니다. `ssh -o BatchMode=yes USER@HOST true`의 `USER@HOST`를 실제 계정과 호스트로 바꿔 실행합니다.
2. 사이드바 `+ → 직접 추가`에서 이름, host, user, port, key path를 입력하고 로컬에 저장합니다. 저장은 SSH 연결 테스트가 아니며 연결 성공을 뜻하지 않습니다.
3. 서버 행 `… → 연결 테스트`에서 저장된 SSH 대상을 별도로 테스트합니다. 모니터링 시작 또는 새로고침으로 최신 상태를 가져옵니다.
4. `+ → SSH config 가져오기`에서는 후보를 선택해 저장합니다. 가져온 서버는 모니터링이 꺼진 상태이며, 부분 실패 시 성공 항목은 유지하고 실패 항목만 재시도합니다.
5. 서버 행을 선택해 GPU 카드와 프로세스를 확인합니다. 행의 `…`는 해당 서버의 편집·삭제·연결 테스트·모니터링 시작/중지를 열며, 서버 관리는 관리 시트에서 수행합니다.

연결 실패 시 같은 Mac Terminal에서 SSH key, host key, `ssh-agent`, DNS, 방화벽, 계정 권한을 확인하세요. GUI 실행 환경은 Terminal의 `SSH_AUTH_SOCK`·원격 `PATH`와 다를 수 있고, 앱은 비밀번호·passphrase·첫 host key 확인 프롬프트를 제공하지 않습니다.

### 로컬 데이터와 소스 실행

서버 설정과 수집 데이터는 `~/Library/Application Support/GPUWatcher/gpuwatcher.sqlite3`에 저장하며 원격 서버에 데이터 파일을 만들지 않습니다.

개발 실행에는 Node.js 24 이상, Rust 1.95 이상, npm이 필요합니다.

```bash
git clone https://github.com/jinzer0/GPUWatch.git
cd GPUWatch
npm install
```

깨끗한 재현 설치에는 `npm install` 대신 `npm ci`를 사용합니다. 개발 모드는 터미널 두 개에서 실행합니다.

```bash
npm run dev
```

```bash
npm run electron:dev
```

일반 브라우저에는 Electron backend가 없어 읽기 전용 빈 상태와 `backend_unavailable` 안내를 표시합니다. [스모크 체크리스트](docs/smoke-checklist.md)와 [데모 순서](docs/demo/demo-script.md)는 검증 시나리오이며 실행 결과가 아닙니다.

## Features

- **서버 중심 탐색**: 사이드바에서 서버를 선택하고 최신 성공 지표·건강 상태·오류를 확인합니다. 실패 시 이전 성공은 stale로 남으며 현재 값으로 가장하지 않습니다.
- **독립적인 펼침**: 여러 GPU 카드와 각 카드의 추가 지표를 독립적으로 펼쳐 프로세스·메모리·사용률·온도·전력 등을 확인합니다.
- **기본 GPU 가용 관측**: 알림 opt-in과 무관하게 알려진 UTIL ≤5% **그리고** VRAM ≤1024MiB가 성공 관측에서 연속 300초 유지될 때 가용으로 표시합니다. 실패·unknown·조건 이탈·GPU 사라짐·서버 설정 변경·모니터링 off·stale·재시작·절전은 관측 구간을 무효화합니다. 성공 관측 간 공백이 `2 × polling interval + 60초`를 넘으면 다시 관측하며, 화면 타이머만으로 가용이 되지 않습니다.
- **선택적 알림**: GPU 카드에서 알림을 켜고 끕니다. 저장된 사용자 지정 임계값·지속시간·cooldown은 기본 가용 조건과 별개이며 다시 켜도 보존됩니다. 연속 유휴 구간에는 한 번만 알리고, 사용 재개(저장 조건 이탈)가 관측된 후 지속 조건과 cooldown을 다시 만족해야 재알림합니다. 실효 cooldown은 최소 900초이며 더 작은 저장값을 덮어쓰지 않습니다. 실패·unknown·off/on은 발송 이력을 초기화하거나 재준비를 우회하지 않습니다.
- **외형 전용 설정 창**: 사이드바 설정 아이콘 또는 앱 메뉴의 설정(`Cmd+,`)으로 하나의 설정 창을 열어 시스템/라이트/다크 외형을 선택합니다. 서버 관리·알림 설정은 이 창에 두지 않습니다.

알림 권한을 확인할 수 없으면 상태는 `unknown`(확인 불가)입니다. 알림을 켰다는 사실은 OS 허용이나 배너 표시를 보장하지 않습니다. 사용자 지정 조건 알림은 기본 카드의 가용 판정과 다를 수 있습니다.

## Prerequisites

- Mac: Apple Silicon Mac, macOS 기본 `ssh`, 원격 서버로 접속 가능한 SSH key
- Linux NVIDIA GPU 서버: NVIDIA 드라이버와 `nvidia-smi`, POSIX shell, `ps`, 키 기반 SSH 계정

원격 서버에 GPUWatcher, Python, nvitop, collector 또는 저장소 파일을 설치하지 않습니다. SSH key에 passphrase가 있으면 앱 실행 전 `ssh-agent`에서 잠금을 풀어두세요.

### 지표 한계

`N/A`·`-`·누락된 지표는 unknown으로 남고 0으로 바꾸지 않습니다. MIG와 드라이버에 따라 지원 지표가 다르며 선택적 `pmon`/`dmon` 실패 시 일부 지표만 저하될 수 있습니다. 종료된 PID·권한·수집 시점 차이로 프로세스 정보가 불완전할 수 있으며 nvitop/NVML+psutil과 정확히 같은 결과를 보장하지 않습니다.
