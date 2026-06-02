# GPUWatcher

macOS에서 SSH로 Linux NVIDIA GPU 서버 상태를 확인하는 Tauri 데스크톱 유틸리티입니다.

## Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Features](#features)
- [Prerequisites](#prerequisites)

## Overview

GPUWatcher는 여러 Linux NVIDIA GPU 서버의 최신 GPU 상태와 프로세스 정보를 macOS 앱에서 확인하기 위한 프로젝트입니다.
원격 서버에 별도 수집기를 설치하지 않고, 시스템 `ssh`로 고정된 `nvidia-smi`와 `ps` 명령을 실행한 뒤 결과를 로컬에서 파싱합니다.
수집된 데이터는 backend에서 protocol v1 스냅샷으로 정리되며, 서버 설정과 최신 성공 스냅샷은 로컬 SQLite에 저장됩니다.
GPU 서버의 현재 사용 가능 여부와 프로세스 점유 상태를 빠르게 확인하는 데 초점을 둡니다.

## Getting Started

저장소를 로컬에 받은 뒤 프로젝트 디렉터리에서 의존성을 설치합니다.

```bash
npm install
```

macOS 데스크톱 앱을 개발 모드로 실행합니다.

```bash
npm run tauri dev
```

프론트엔드만 브라우저에서 확인하려면 다음 명령을 사용할 수 있습니다.

```bash
npm run dev
```

로컬 테스트와 빌드는 다음 명령으로 확인합니다.

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run test
npm run build
```

## Features

- SSH 기반으로 Linux NVIDIA GPU 서버의 최신 GPU 상태를 수집합니다.
- 원격 서버에 GPUWatcher, nvitop, Python 수집기, 저장소 파일을 설치하지 않아도 됩니다.
- `nvidia-smi` 기반 GPU 메모리, 사용률, 온도, 전력 정보를 표시합니다.
- `nvidia-smi --query-compute-apps`, 선택적 `pmon`/`dmon`, `ps`를 조합해 GPU 프로세스 정보를 보여줍니다.
- Overview, Server Detail, Process Table, Settings 화면으로 서버 상태를 확인하고 관리합니다.
- 실패한 새로고침 이후에도 최신 성공 스냅샷을 보존하고 stale 상태와 오류 정보를 표시합니다.

## Prerequisites

| 구분 | 필요 항목 |
|---|---|
| Local | macOS |
| Runtime | Node.js 24 이상, npm, Rust 1.95 이상, SQLite 3 |
| Remote GPU server | Linux NVIDIA 드라이버, `nvidia-smi`, POSIX shell, `ps` |
| SSH | macOS에서 원격 서버로 접속 가능한 키 기반 SSH |

원격 서버는 비대화형 SSH로 접근 가능해야 합니다. 비밀번호 인증 UI는 v0.1 범위에 포함되지 않으며, 패스프레이즈가 있는 키는 `ssh-agent`에서 먼저 잠금 해제해 주세요.

```bash
ssh -o BatchMode=yes USER@HOST true
```

`nvidia-smi` 출력은 드라이버, GPU 모드, MIG 구성에 따라 `N/A` 또는 `-`를 반환할 수 있습니다. GPUWatcher는 이런 값을 0으로 바꾸지 않고 `unknown` 또는 `null`로 처리합니다.
