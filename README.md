# GPUWatcher

Apple Silicon Mac에서 SSH로 Linux NVIDIA GPU 서버를 지켜보는 데스크톱 앱입니다. 원격 서버에는 에이전트나 컬렉터를 설치하지 않습니다.

[Releases](https://github.com/jinzer0/GPUWatch/releases/tag/v0.1.0)

## Features

- **여러 서버 한눈에 보기**: 여러 Linux NVIDIA GPU 서버의 상태를 한 화면에서 확인합니다.
- **GPU 핵심 지표**: GPU 이름, 메모리 사용량, 사용률, 온도, 전력 상태를 보기 쉽게 정리합니다.
- **현재 프로세스 확인**: 지금 GPU를 쓰고 있는 프로세스와 사용자 정보를 확인합니다.
- **최근 24시간 기록**: 서버와 GPU별로 최근 GPU 사용 흐름을 살펴봅니다.
- **GPU availability watch**: 비어 있는 GPU가 생기면 macOS 네이티브 알림으로 알려줍니다.
- **원격 설치 없음**: 원격 서버에 GPUWatcher, Python, nvitop, 별도 collector를 설치할 필요가 없습니다.
- **로컬 설정과 데이터**: 서버 설정, 알림 watch, 최근 기록은 Mac 안에 저장됩니다.
- **SSH 기반 사용**: 이미 쓰는 키 기반 SSH 접근을 그대로 사용합니다.

## Installation

1. [GPUWatcher v0.1.0 Releases](https://github.com/jinzer0/GPUWatch/releases/tag/v0.1.0)에서 앱 파일을 받습니다.
2. 내려받은 파일을 열고 GPUWatcher를 Applications로 옮깁니다.
3. Applications에서 GPUWatcher를 실행합니다.

v0.1.0은 Apple Silicon Mac 전용입니다. unsigned, non-notarized 앱이라 macOS Gatekeeper가 처음 실행을 막을 수 있습니다. 차단되면 앱을 한 번 실행해 경고를 만든 뒤 `System Settings → Privacy & Security → Open Anyway`를 누르고, 확인 창에서 `Open`을 누르세요.

자동 업데이트는 설정되어 있지 않습니다. 새 버전은 Releases 페이지에서 직접 확인해야 합니다.

## Requirements

- Mac: Apple Silicon Mac, macOS 기본 `ssh`, 원격 서버로 접속 가능한 SSH key
- Linux NVIDIA GPU 서버: NVIDIA 드라이버, `nvidia-smi`, POSIX shell, `ps`, 키 기반 SSH 계정

원격 서버에는 GPUWatcher, Python, nvitop, collector를 설치하지 않아도 됩니다. GPUWatcher는 비밀번호 입력 UI를 제공하지 않습니다. SSH key에 passphrase가 있다면 앱을 열기 전에 `ssh-agent`에서 잠금을 풀어두세요.

## Getting Started

1. Mac의 Terminal에서 원격 서버에 키 기반 SSH로 접속되는지 먼저 확인합니다.

```bash
ssh -o BatchMode=yes USER@HOST true
```

2. GPUWatcher를 열고 Settings에서 서버를 추가합니다.
3. 서버 이름, host, user, port, key path를 입력하고 저장합니다.
4. Test Connection 또는 Refresh로 첫 상태를 가져옵니다.
5. Overview에서 여러 서버 상태를 보고, Server Detail에서 GPU 지표, 현재 프로세스, 최근 24시간 기록을 확인합니다.
6. 비어 있는 GPU 알림이 필요하면 availability watch를 설정합니다.

연결이 실패하면 같은 Mac Terminal에서 SSH key, host key, `ssh-agent`, DNS, 방화벽, 계정 권한을 먼저 확인하세요.

## Local Data

GPUWatcher는 설정과 최근 데이터를 Mac의 앱 데이터 폴더에 저장하며, 원격 서버에는 GPUWatcher 데이터 파일을 만들지 않습니다.

```text
~/Library/Application Support/GPUWatcher/gpuwatcher.sqlite3
```

## From Source

개발 실행에는 Node.js 24 이상, Rust 1.95 이상, npm이 필요합니다.

```bash
git clone https://github.com/jinzer0/GPUWatch.git
cd GPUWatch
npm install
```

깨끗한 재현 설치가 필요하면 `npm install` 대신 `npm ci`를 사용할 수 있습니다.

개발 모드는 터미널 두 개에서 실행합니다.

```bash
npm run dev
```

```bash
npm run electron:dev
```
